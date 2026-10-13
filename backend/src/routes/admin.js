/**
 * Campus Inn+ — Admin, User Authorization & Governance Routes (/api/v1/admin)
 * Enterprise College Admin Console: User & Role Management, Multi-Role Approvals,
 * Audit Ledger, and Secure Administrator Replacement Lifecycle.
 */
const express = require('express');
const bcrypt = require('bcrypt');
const validator = require('validator');
const { query, transaction } = require('../db/pool');
const { authenticate, authorize } = require('../middleware/auth');
const { validateAdminFacultyRegister } = require('../middleware/validate');

const router = express.Router();
const SALT_ROUNDS = 12;

// Concurrency mutex and staged replacement tracker
let replacementLock = false;
let pendingReplacementState = null;

/**
 * Record an entry into the audit_log table safely (NEVER logs secrets or hashes)
 */
async function recordAuditLog(actorId, action, entityType, entityId, details = {}, req = null) {
  try {
    let ip = '127.0.0.1';
    if (req) {
      ip = (req.headers && req.headers['x-forwarded-for']) || req.ip || (req.connection && req.connection.remoteAddress) || '127.0.0.1';
      if (typeof ip === 'string' && ip.includes(',')) {
        ip = ip.split(',')[0].trim();
      }
    }
    await query(
      `INSERT INTO audit_log (actor_id, action, entity_type, entity_id, details, ip_address, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, NOW())`,
      [actorId || null, action, entityType || 'users', entityId || null, JSON.stringify(details), ip]
    );
  } catch (err) {
    console.warn('[Audit Log] Warning: could not record audit log entry:', err.message);
  }
}

/**
 * Dispatch an in-app notification to a specific user
 */
async function createNotification(userId, title, message, type = 'info', link = null) {
  try {
    await query(
      `INSERT INTO notifications (user_id, title, message, type, link, is_read, created_at)
       VALUES ($1, $2, $3, $4, $5, false, NOW())`,
      [userId, title, message, type, link]
    );
  } catch (err) {
    console.warn('[Notification] Warning: could not create notification:', err.message);
  }
}

/**
 * Helper: Check whether request has authorized operator credentials
 */
function isAuthorizedOperator(req) {
  const operatorSecret = (req.headers && (req.headers['x-admin-operator-secret'] || req.headers['x-admin-bootstrap-secret'])) ||
    (req.body && (req.body.operatorSecret || req.body.bootstrapSecret));
  const configuredSecret = process.env.ADMIN_OPERATOR_SECRET || process.env.ADMIN_BOOTSTRAP_SECRET;
  return Boolean(configuredSecret && operatorSecret && operatorSecret === configuredSecret);
}

/* ══════════════════════════════════════════════════════════
   1. PENDING APPROVALS QUEUE
   ══════════════════════════════════════════════════════════ */

/**
 * GET /api/v1/admin/pending
 * Retrieve pending accounts awaiting institutional review:
 * Faculty, Coordinators, and Corporate Recruiters
 */
router.get('/pending', authenticate, authorize('admin'), async (req, res, next) => {
  try {
    // 1. Pending faculty
    const facultyRes = await query(
      `SELECT u.id, u.email, u.role, u.status, u.first_name AS "firstName", u.last_name AS "lastName",
              u.phone, u.username, u.created_at AS "createdAt",
              fp.employee_id AS "employeeId", fp.department, fp.designation, fp.college,
              fp.cabin_number AS "cabinNumber", fp.office_hours AS "officeHours"
       FROM users u
       LEFT JOIN faculty_profiles fp ON fp.user_id = u.id
       WHERE u.role = 'faculty' AND u.status = 'pending'
       ORDER BY u.created_at ASC`
    ).catch(() => ({ rows: [] }));

    // 2. Pending coordinators
    const coordRes = await query(
      `SELECT u.id, u.email, u.role, u.status, u.first_name AS "firstName", u.last_name AS "lastName",
              u.phone, u.username, u.created_at AS "createdAt",
              cp.department, cp.club_name AS "clubName", cp.role_label AS "roleLabel"
       FROM users u
       LEFT JOIN coordinator_profiles cp ON cp.user_id = u.id
       WHERE u.role = 'coordinator' AND u.status = 'pending'
       ORDER BY u.created_at ASC`
    ).catch(() => ({ rows: [] }));

    // 3. Pending recruiters and partner companies
    const recruiterRes = await query(
      `SELECT u.id, u.email, u.role, u.status, u.first_name AS "firstName", u.last_name AS "lastName",
              u.phone, u.username, u.created_at AS "createdAt",
              rp.company_name AS "companyName", rp.designation, rp.company_id AS "companyId",
              c.name AS "registeredCompany", c.website, c.verification_status AS "verificationStatus",
              c.status AS "companyStatus"
       FROM users u
       LEFT JOIN recruiter_profiles rp ON rp.user_id = u.id
       LEFT JOIN companies c ON c.id = rp.company_id
       WHERE u.role = 'recruiter' AND (u.status = 'pending' OR c.verification_status = 'pending')
       ORDER BY u.created_at ASC`
    ).catch(() => ({ rows: [] }));

    const faculty = facultyRes.rows.map(f => ({
      ...f,
      fullName: [f.firstName, f.lastName].filter(Boolean).join(' ') || 'Faculty Member',
    }));

    const coordinators = coordRes.rows.map(c => ({
      ...c,
      fullName: [c.firstName, c.lastName].filter(Boolean).join(' ') || 'Coordinator',
    }));

    const recruiters = recruiterRes.rows.map(r => ({
      ...r,
      fullName: [r.firstName, r.lastName].filter(Boolean).join(' ') || 'Recruiter',
      companyName: r.companyName || r.registeredCompany || 'Corporate Partner',
    }));

    const totalCount = faculty.length + coordinators.length + recruiters.length;

    return res.status(200).json({
      success: true,
      count: totalCount,
      pending: {
        faculty,
        coordinators,
        recruiters,
        counts: {
          faculty: faculty.length,
          coordinators: coordinators.length,
          recruiters: recruiters.length,
          total: totalCount,
        },
      },
    });
  } catch (err) {
    next(err);
  }
});

/* ══════════════════════════════════════════════════════════
   2. USER DIRECTORY & ROLE MANAGEMENT
   ══════════════════════════════════════════════════════════ */

/**
 * GET /api/v1/admin/users
 * Search and filter users across all roles: student, faculty, coordinator, recruiter, tpo, admin
 */
router.get('/users', authenticate, authorize('admin'), async (req, res, next) => {
  try {
    const { role, status, search, limit = 100, offset = 0 } = req.query;

    const conditions = [];
    const params = [];
    let paramIdx = 1;

    if (role && ['student', 'faculty', 'admin', 'tpo', 'coordinator', 'recruiter'].includes(role.trim().toLowerCase())) {
      conditions.push(`u.role = $${paramIdx++}`);
      params.push(role.trim().toLowerCase());
    }

    if (status && ['active', 'suspended', 'pending', 'deactivated'].includes(status.trim().toLowerCase())) {
      conditions.push(`u.status = $${paramIdx++}`);
      params.push(status.trim().toLowerCase());
    }

    if (search && search.trim()) {
      const q = `%${search.trim().toLowerCase()}%`;
      conditions.push(`(
        LOWER(u.email) LIKE $${paramIdx} OR
        LOWER(u.first_name) LIKE $${paramIdx} OR
        LOWER(u.last_name) LIKE $${paramIdx} OR
        LOWER(COALESCE(u.username, '')) LIKE $${paramIdx} OR
        LOWER(COALESCE(sp.roll_number, '')) LIKE $${paramIdx} OR
        LOWER(COALESCE(fp.employee_id, '')) LIKE $${paramIdx} OR
        LOWER(COALESCE(rp.company_name, '')) LIKE $${paramIdx} OR
        LOWER(COALESCE(cp.club_name, '')) LIKE $${paramIdx}
      )`);
      params.push(q);
      paramIdx++;
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const usersRes = await query(
      `SELECT u.id, u.email, u.username, u.role, u.status, u.first_name AS "firstName", u.last_name AS "lastName",
              u.phone, u.avatar_url AS "avatarUrl", u.created_at AS "createdAt", u.last_login AS "lastLogin",
              u.token_version AS "tokenVersion",
              sp.roll_number AS "rollNumber", sp.department AS "studentDepartment", sp.cgpa,
              fp.employee_id AS "employeeId", fp.department AS "facultyDepartment", fp.designation AS "facultyDesignation",
              cp.department AS "coordinatorDepartment", cp.club_name AS "clubName",
              rp.company_name AS "companyName", rp.designation AS "recruiterDesignation"
       FROM users u
       LEFT JOIN student_profiles sp ON sp.user_id = u.id
       LEFT JOIN faculty_profiles fp ON fp.user_id = u.id
       LEFT JOIN coordinator_profiles cp ON cp.user_id = u.id
       LEFT JOIN recruiter_profiles rp ON rp.user_id = u.id
       ${whereClause}
       ORDER BY u.created_at DESC
       LIMIT $${paramIdx++} OFFSET $${paramIdx++}`,
      [...params, parseInt(limit, 10), parseInt(offset, 10)]
    );

    const users = usersRes.rows.map(u => ({
      id: u.id,
      email: u.email,
      username: u.username,
      role: u.role,
      status: u.status,
      firstName: u.firstName,
      lastName: u.lastName,
      fullName: [u.firstName, u.lastName].filter(Boolean).join(' ') || u.email,
      phone: u.phone,
      avatarUrl: u.avatarUrl,
      createdAt: u.createdAt,
      lastLogin: u.lastLogin,
      rollNumber: u.rollNumber || null,
      employeeId: u.employeeId || null,
      department: u.facultyDepartment || u.studentDepartment || u.coordinatorDepartment || null,
      designation: u.facultyDesignation || u.recruiterDesignation || null,
      clubName: u.clubName || null,
      companyName: u.companyName || null,
    }));

    return res.status(200).json({
      success: true,
      count: users.length,
      users,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/v1/admin/coordinators
 * List all event and club coordinators and their organizational responsibilities
 */
router.get('/coordinators', authenticate, authorize('admin'), async (req, res, next) => {
  try {
    const coordsRes = await query(
      `SELECT u.id, u.email, u.role, u.status, u.first_name AS "firstName", u.last_name AS "lastName",
              u.phone, u.username, u.created_at AS "createdAt",
              cp.department, cp.club_name AS "clubName", cp.role_label AS "roleLabel"
       FROM users u
       LEFT JOIN coordinator_profiles cp ON cp.user_id = u.id
       WHERE u.role = 'coordinator'
       ORDER BY u.created_at DESC`
    );

    const coordinators = coordsRes.rows.map(c => ({
      ...c,
      fullName: [c.firstName, c.lastName].filter(Boolean).join(' ') || 'Coordinator',
    }));

    return res.status(200).json({
      success: true,
      count: coordinators.length,
      coordinators,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/v1/admin/users/:id/approve
 * Formal institutional approval of pending user accounts (Faculty, Coordinator, Recruiter)
 */
router.post('/users/:id/approve', authenticate, authorize('admin'), async (req, res, next) => {
  try {
    const targetUserId = req.params.id;
    const { department, clubName } = req.body || {};

    const userRes = await query('SELECT * FROM users WHERE id::text = $1', [targetUserId]);
    if (userRes.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Target user account not found.',
        code: 'USER_NOT_FOUND',
      });
    }

    const targetUser = userRes.rows[0];

    const result = await transaction(async (client) => {
      // 1. Activate user
      const updated = await client.query(
        `UPDATE users
         SET status = 'active', updated_at = NOW()
         WHERE id = $1
         RETURNING id, email, role, status, first_name, last_name, username`,
        [targetUser.id]
      );

      // 2. Role-specific profile updates
      if (targetUser.role === 'coordinator' && (department || clubName)) {
        await client.query(
          `INSERT INTO coordinator_profiles (user_id, department, club_name, role_label, updated_at)
           VALUES ($1, $2, $3, 'Event & Club Coordinator', NOW())
           ON CONFLICT (user_id)
           DO UPDATE SET department = COALESCE($2, coordinator_profiles.department),
                         club_name = COALESCE($3, coordinator_profiles.club_name),
                         updated_at = NOW()`,
          [targetUser.id, department ? department.trim() : null, clubName ? clubName.trim() : null]
        );
      }

      if (targetUser.role === 'recruiter') {
        // Approve associated corporate partner
        const rp = await client.query('SELECT company_id FROM recruiter_profiles WHERE user_id = $1', [targetUser.id]);
        if (rp.rows.length > 0 && rp.rows[0].company_id) {
          await client.query(
            `UPDATE companies SET verification_status = 'approved', status = 'active', updated_at = NOW() WHERE id = $1`,
            [rp.rows[0].company_id]
          );
        }
      }

      return updated.rows[0];
    });

    await recordAuditLog(
      req.user.id,
      'USER_APPROVED',
      'users',
      targetUser.id,
      {
        targetEmail: targetUser.email,
        targetRole: targetUser.role,
        approvedBy: req.user.email,
      },
      req
    );

    await createNotification(
      targetUser.id,
      'Account Registration Approved',
      `Your Campus Inn+ account has been verified and approved by the College Administration. You may now sign in and access the portal.`,
      'success',
      'login.html'
    );

    return res.status(200).json({
      success: true,
      message: `Account for ${result.first_name} ${result.last_name} (${result.email}) approved successfully.`,
      user: {
        id: result.id,
        email: result.email,
        role: result.role,
        status: result.status,
        fullName: `${result.first_name} ${result.last_name}`.trim(),
      },
    });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/v1/admin/users/:id/reject
 * Reject a pending account registration request
 */
router.post('/users/:id/reject', authenticate, authorize('admin'), async (req, res, next) => {
  try {
    const targetUserId = req.params.id;
    const { reason = 'Application declined upon institutional verification.' } = req.body || {};

    const userRes = await query('SELECT * FROM users WHERE id::text = $1', [targetUserId]);
    if (userRes.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Target user account not found.',
        code: 'USER_NOT_FOUND',
      });
    }

    const targetUser = userRes.rows[0];

    // Safety check: Cannot reject the acting admin or the last active admin
    if (targetUser.role === 'admin') {
      const activeAdminCountRes = await query("SELECT COUNT(*) AS count FROM users WHERE role = 'admin' AND status = 'active'");
      const count = parseInt(activeAdminCountRes.rows[0].count, 10);
      if (count <= 1) {
        return res.status(409).json({
          success: false,
          message: 'Cannot reject or deactivate the only usable College Administrator in the system.',
          code: 'CANNOT_REMOVE_LAST_ADMIN',
        });
      }
    }

    const updateRes = await query(
      `UPDATE users
       SET status = 'suspended', token_version = token_version + 1, updated_at = NOW()
       WHERE id = $1
       RETURNING id, email, role, status, first_name, last_name`,
      [targetUser.id]
    );

    // If recruiter, mark associated company rejected if newly created
    if (targetUser.role === 'recruiter') {
      const rp = await query('SELECT company_id FROM recruiter_profiles WHERE user_id = $1', [targetUser.id]);
      if (rp.rows.length > 0 && rp.rows[0].company_id) {
        await query(
          `UPDATE companies SET verification_status = 'rejected', updated_at = NOW() WHERE id = $1`,
          [rp.rows[0].company_id]
        ).catch(() => {});
      }
    }

    await recordAuditLog(
      req.user.id,
      'USER_REJECTED',
      'users',
      targetUser.id,
      {
        targetEmail: targetUser.email,
        targetRole: targetUser.role,
        reason,
        rejectedBy: req.user.email,
      },
      req
    );

    await createNotification(
      targetUser.id,
      'Account Registration Decision',
      `Your account registration was not approved: ${reason}`,
      'error'
    );

    return res.status(200).json({
      success: true,
      message: `Account registration for ${targetUser.email} has been rejected.`,
      user: updateRes.rows[0],
    });
  } catch (err) {
    next(err);
  }
});

/**
 * PATCH /api/v1/admin/users/:id/status
 * Activate, suspend, or reactivate any user account
 */
router.patch('/users/:id/status', authenticate, authorize('admin'), async (req, res, next) => {
  try {
    const targetUserId = req.params.id;
    const { status } = req.body || {};

    if (!status || !['active', 'suspended', 'pending', 'deactivated'].includes(status.trim().toLowerCase())) {
      return res.status(400).json({
        success: false,
        message: 'Status must be one of: active, suspended, pending, deactivated.',
        code: 'INVALID_STATUS',
      });
    }

    const cleanStatus = status.trim().toLowerCase();

    const userRes = await query('SELECT * FROM users WHERE id::text = $1', [targetUserId]);
    if (userRes.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Target user account not found.',
        code: 'USER_NOT_FOUND',
      });
    }

    const targetUser = userRes.rows[0];

    // Safety check: Cannot suspend the last usable administrator
    if (targetUser.role === 'admin' && cleanStatus !== 'active') {
      const activeAdminCountRes = await query(
        "SELECT COUNT(*) AS count FROM users WHERE role = 'admin' AND status = 'active' AND id != $1",
        [targetUser.id]
      );
      const count = parseInt(activeAdminCountRes.rows[0].count, 10);
      if (count < 1) {
        return res.status(409).json({
          success: false,
          message: 'Cannot suspend account: At least one usable College Administrator must remain active in the system.',
          code: 'CANNOT_SUSPEND_LAST_ADMIN',
        });
      }
    }

    // Invalidate sessions when suspending by incrementing token_version
    const tokenIncrementSql = cleanStatus !== 'active' ? ', token_version = token_version + 1' : '';

    const updateRes = await query(
      `UPDATE users
       SET status = $1 ${tokenIncrementSql}, updated_at = NOW()
       WHERE id = $2
       RETURNING id, email, role, status, first_name, last_name, username`,
      [cleanStatus, targetUser.id]
    );

    await recordAuditLog(
      req.user.id,
      cleanStatus === 'active' ? 'USER_ACTIVATED' : 'USER_SUSPENDED',
      'users',
      targetUser.id,
      {
        previousStatus: targetUser.status,
        newStatus: cleanStatus,
        targetEmail: targetUser.email,
        targetRole: targetUser.role,
        updatedBy: req.user.email,
      },
      req
    );

    await createNotification(
      targetUser.id,
      `Account Status Updated: ${cleanStatus.toUpperCase()}`,
      cleanStatus === 'active'
        ? 'Your account has been activated. You now have full access to authorized services.'
        : 'Your account has been suspended by administration. Access to protected services is temporarily restricted.',
      cleanStatus === 'active' ? 'success' : 'warning'
    );

    return res.status(200).json({
      success: true,
      message: `Account status for ${targetUser.email} updated to ${cleanStatus}.`,
      user: updateRes.rows[0],
    });
  } catch (err) {
    next(err);
  }
});

/* ══════════════════════════════════════════════════════════
   3. GRANT & REVOKE ADMINISTRATOR PRIVILEGES
   ══════════════════════════════════════════════════════════ */

/**
 * POST /api/v1/admin/users/:id/grant-admin
 * Assign College Administrator privileges to a trusted existing user
 */
router.post('/users/:id/grant-admin', authenticate, authorize('admin'), async (req, res, next) => {
  try {
    const targetUserId = req.params.id;
    const { confirm } = req.body || {};

    if (confirm !== true && confirm !== 'true') {
      return res.status(400).json({
        success: false,
        message: 'Granting enterprise administrator privileges carries central authority and requires explicit confirmation (confirm: true).',
        code: 'CONFIRMATION_REQUIRED',
      });
    }

    const userRes = await query('SELECT * FROM users WHERE id::text = $1', [targetUserId]);
    if (userRes.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Target user account not found.',
        code: 'USER_NOT_FOUND',
      });
    }

    const targetUser = userRes.rows[0];

    if (targetUser.role === 'admin') {
      return res.status(400).json({
        success: false,
        message: 'Target account already possesses administrator privileges.',
        code: 'ALREADY_ADMIN',
      });
    }

    // Atomic update: promote role to admin, ensure status is active, increment token_version to refresh JWT
    const updatedRes = await query(
      `UPDATE users
       SET role = 'admin', status = 'active', token_version = token_version + 1, updated_at = NOW()
       WHERE id = $1
       RETURNING id, email, role, status, first_name, last_name, username`,
      [targetUser.id]
    );

    const updatedUser = updatedRes.rows[0];

    await recordAuditLog(
      req.user.id,
      'ADMIN_ROLE_GRANTED',
      'users',
      targetUser.id,
      {
        previousRole: targetUser.role,
        targetEmail: targetUser.email,
        grantedBy: req.user.email,
        timestamp: new Date().toISOString(),
      },
      req
    );

    await createNotification(
      targetUser.id,
      'College Administrator Privileges Granted',
      'You have been granted College Administrator privileges across Campus Inn+ by the executive office.',
      'info'
    );

    return res.status(200).json({
      success: true,
      message: `College Administrator privileges successfully granted to ${updatedUser.first_name} ${updatedUser.last_name} (${updatedUser.email}).`,
      user: updatedUser,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/v1/admin/users/:id/revoke-admin
 * Revoke administrator permissions from another user with last-usable-admin safeguard
 */
router.post('/users/:id/revoke-admin', authenticate, authorize('admin'), async (req, res, next) => {
  try {
    const targetUserId = req.params.id;
    const { confirm, fallbackRole = 'faculty' } = req.body || {};

    if (confirm !== true && confirm !== 'true') {
      return res.status(400).json({
        success: false,
        message: 'Revoking enterprise administrator privileges requires explicit confirmation (confirm: true).',
        code: 'CONFIRMATION_REQUIRED',
      });
    }

    const allowedFallback = ['faculty', 'student', 'coordinator', 'tpo', 'recruiter'];
    const cleanFallback = allowedFallback.includes((fallbackRole || '').trim().toLowerCase())
      ? fallbackRole.trim().toLowerCase()
      : 'faculty';

    const userRes = await query('SELECT * FROM users WHERE id::text = $1', [targetUserId]);
    if (userRes.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Target user account not found.',
        code: 'USER_NOT_FOUND',
      });
    }

    const targetUser = userRes.rows[0];

    if (targetUser.role !== 'admin') {
      return res.status(400).json({
        success: false,
        message: 'Target user is not an administrator.',
        code: 'NOT_AN_ADMIN',
      });
    }

    // Safety Invariant: Prevent accidental removal of the last usable administrator
    const activeAdminsRes = await query(
      "SELECT COUNT(*) AS count FROM users WHERE role = 'admin' AND status = 'active' AND id != $1",
      [targetUser.id]
    );
    const remainingCount = parseInt(activeAdminsRes.rows[0].count, 10);
    if (remainingCount < 1) {
      return res.status(409).json({
        success: false,
        message: 'Operation rejected: Cannot revoke privileges from the last active College Administrator. The application must retain at least one usable administrator account.',
        code: 'CANNOT_REMOVE_LAST_ADMIN',
      });
    }

    // Downgrade role and increment token_version to immediately invalidate superseded admin tokens
    const updateRes = await query(
      `UPDATE users
       SET role = $1, token_version = token_version + 1, updated_at = NOW()
       WHERE id = $2
       RETURNING id, email, role, status, first_name, last_name, username`,
      [cleanFallback, targetUser.id]
    );

    const updatedUser = updateRes.rows[0];

    await recordAuditLog(
      req.user.id,
      'ADMIN_ROLE_REVOKED',
      'users',
      targetUser.id,
      {
        previousRole: 'admin',
        newRole: cleanFallback,
        targetEmail: targetUser.email,
        revokedBy: req.user.email,
        timestamp: new Date().toISOString(),
      },
      req
    );

    await createNotification(
      targetUser.id,
      'Administrator Privileges Revoked',
      `Your College Administrator privileges have been revoked by the executive administration. Your role has been adjusted to ${cleanFallback}.`,
      'warning'
    );

    return res.status(200).json({
      success: true,
      message: `Administrator privileges revoked for ${targetUser.email}. Account role updated to ${cleanFallback}.`,
      user: updatedUser,
      remainingAdminsCount: remainingCount,
    });
  } catch (err) {
    next(err);
  }
});

/* ══════════════════════════════════════════════════════════
   4. AUDIT LEDGER LOGS
   ══════════════════════════════════════════════════════════ */

/**
 * GET /api/v1/admin/audit-log
 * Real-time institutional governance audit ledger stream
 */
router.get('/audit-log', authenticate, authorize('admin'), async (req, res, next) => {
  try {
    const { limit = 50, offset = 0 } = req.query;

    const auditRes = await query(
      `SELECT a.id, a.action, a.entity_type AS "entityType", a.entity_id AS "entityId",
              a.details, a.ip_address AS "ipAddress", a.created_at AS "createdAt",
              u.first_name AS "actorFirstName", u.last_name AS "actorLastName", u.email AS "actorEmail", u.role AS "actorRole"
       FROM audit_log a
       LEFT JOIN users u ON u.id = a.actor_id
       ORDER BY a.created_at DESC
       LIMIT $1 OFFSET $2`,
      [parseInt(limit, 10), parseInt(offset, 10)]
    ).catch(() => ({ rows: [] }));

    const logs = auditRes.rows.map(row => {
      // Clean details to guarantee zero leakage of passwords or hashes
      let safeDetails = {};
      if (typeof row.details === 'object' && row.details !== null) {
        safeDetails = { ...row.details };
        delete safeDetails.password;
        delete safeDetails.password_hash;
        delete safeDetails.passwordHash;
        delete safeDetails.token;
        delete safeDetails.secret;
      }
      return {
        id: row.id,
        action: row.action,
        entityType: row.entityType,
        entityId: row.entityId,
        details: safeDetails,
        ipAddress: row.ipAddress,
        createdAt: row.createdAt,
        actor: {
          name: [row.actorFirstName, row.actorLastName].filter(Boolean).join(' ') || (row.actorEmail ? row.actorEmail : 'System Operator'),
          email: row.actorEmail || null,
          role: row.actorRole || 'system',
        },
      };
    });

    return res.status(200).json({
      success: true,
      count: logs.length,
      auditLog: logs,
    });
  } catch (err) {
    next(err);
  }
});

/* ══════════════════════════════════════════════════════════
   5. SECURE ADMINISTRATOR REPLACEMENT LIFECYCLE
   ══════════════════════════════════════════════════════════ */

/**
 * GET /api/v1/admin/replace/status
 * Check current administrator accounts and replacement state
 */
router.get('/replace/status', async (req, res, next) => {
  try {
    // Only authorized operators or authenticated admins can inspect admin replacement status
    const isOp = isAuthorizedOperator(req);
    let isAdmin = false;

    if (!isOp) {
      const authHeader = req.headers['authorization'];
      const cookieToken = req.cookies && req.cookies.ci_session;
      const token = (authHeader && authHeader.startsWith('Bearer ')) ? authHeader.substring(7) : cookieToken;
      if (token) {
        try {
          const jwt = require('jsonwebtoken');
          const config = require('../config');
          const decoded = jwt.verify(token, config.jwt.secret);
          if (decoded.role === 'admin') isAdmin = true;
        } catch (e) {}
      }
    }

    if (!isOp && !isAdmin) {
      return res.status(403).json({
        success: false,
        message: 'Access restricted to authorized server operators or authenticated College Administrators.',
        code: 'UNAUTHORIZED_ACCESS',
      });
    }

    const adminsRes = await query(
      `SELECT id, email, username, role, status, first_name AS "firstName", last_name AS "lastName", created_at AS "createdAt", last_login AS "lastLogin"
       FROM users
       WHERE role = 'admin'
       ORDER BY created_at ASC`
    ).catch(() => ({ rows: [] }));

    const tpoRes = await query(
      `SELECT id, email, username, role, status, first_name AS "firstName", last_name AS "lastName", created_at AS "createdAt"
       FROM users
       WHERE role = 'tpo'
       ORDER BY created_at ASC`
    ).catch(() => ({ rows: [] }));

    return res.status(200).json({
      success: true,
      activeAdminsCount: adminsRes.rows.filter(a => a.status === 'active').length,
      admins: adminsRes.rows.map(a => ({
        ...a,
        fullName: `${a.firstName} ${a.lastName}`.trim(),
      })),
      placementOfficers: tpoRes.rows.map(t => ({
        ...t,
        fullName: `${t.firstName} ${t.lastName}`.trim(),
      })),
      pendingReplacement: pendingReplacementState,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/v1/admin/replace/initiate
 * Step 1 of Replacement: Controlled server-side provisioning of new administrator account.
 * Requires authorized operator secret or authenticated College Admin.
 * Protects against concurrent provisioning requests.
 * Keeps existing administrator active until replacement is verified and confirmed.
 */
router.post('/replace/initiate', async (req, res, next) => {
  // Concurrency check
  if (replacementLock) {
    return res.status(409).json({
      success: false,
      message: 'An administrator replacement or provisioning operation is already in progress. Please retry momentarily.',
      code: 'CONCURRENT_PROVISIONING_REQUEST',
    });
  }

  // Authorization check: Operator secret OR authenticated admin
  const isOp = isAuthorizedOperator(req);
  let actingAdmin = null;

  if (!isOp) {
    const authHeader = req.headers['authorization'];
    const cookieToken = req.cookies && req.cookies.ci_session;
    const token = (authHeader && authHeader.startsWith('Bearer ')) ? authHeader.substring(7) : cookieToken;
    if (token) {
      try {
        const jwt = require('jsonwebtoken');
        const config = require('../config');
        const decoded = jwt.verify(token, config.jwt.secret);
        const uRes = await query('SELECT * FROM users WHERE id = $1', [decoded.sub || decoded.id]);
        if (uRes.rows.length > 0 && uRes.rows[0].role === 'admin' && uRes.rows[0].status === 'active') {
          actingAdmin = uRes.rows[0];
        }
      } catch (e) {}
    }
  }

  if (!isOp && !actingAdmin) {
    return res.status(403).json({
      success: false,
      message: 'Unauthorized replacement attempt. Valid operator authorization secret (x-admin-operator-secret) or authenticated College Admin session required.',
      code: 'OPERATOR_UNAUTHORIZED',
    });
  }

  replacementLock = true;
  try {
    const { email, username, accountIdentifier, password, fullName, phone } = req.body || {};

    const cleanEmail = (email || '').trim().toLowerCase();
    const cleanUsername = (username || accountIdentifier || '').trim().toLowerCase();
    const cleanName = (fullName || 'Executive Administrator').trim();

    if (!cleanEmail || !validator.isEmail(cleanEmail)) {
      return res.status(400).json({
        success: false,
        message: 'A valid email address is required for the new administrator.',
        code: 'INVALID_EMAIL',
      });
    }

    if (!cleanUsername || cleanUsername.length < 3) {
      return res.status(400).json({
        success: false,
        message: 'A unique account identifier (username, minimum 3 characters) is required.',
        code: 'INVALID_IDENTIFIER',
      });
    }

    if (!password || typeof password !== 'string' || password.length < 8) {
      return res.status(400).json({
        success: false,
        message: 'Strong password is required (minimum 8 characters).',
        code: 'WEAK_PASSWORD',
      });
    }

    const hasLetter = /[a-zA-Z]/.test(password);
    const hasNumber = /[0-9]/.test(password);
    if (!hasLetter || !hasNumber) {
      return res.status(400).json({
        success: false,
        message: 'Password must contain at least one letter and one number.',
        code: 'WEAK_PASSWORD',
      });
    }

    const result = await transaction(async (client) => {
      // 1. Conflict check: Check whether this exact email or username is already in use by an active administrator
      const dupCheck = await client.query(
        "SELECT id, email, username FROM users WHERE role = 'admin' AND (LOWER(email) = $1 OR LOWER(username) = $2)",
        [cleanEmail, cleanUsername]
      );
      if (dupCheck.rows.length > 0) {
        return {
          aborted: true,
          reason: 'ACCOUNT_ALREADY_EXISTS',
          conflicting: dupCheck.rows[0].email,
        };
      }

      // 2. Hash password securely
      const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);

      // 3. Parse names
      const parts = cleanName.split(/\s+/);
      const firstName = parts[0] || 'College';
      const lastName = parts.slice(1).join(' ') || 'Administrator';

      // 4. Insert new administrator account with active status and token_version = 1
      const userRes = await client.query(
        `INSERT INTO users (
           email, username, password_hash, role, status, first_name, last_name, phone, token_version, created_at, updated_at
         ) VALUES ($1, $2, $3, 'admin', 'active', $4, $5, $6, 1, NOW(), NOW())
         RETURNING id, email, username, role, status, first_name, last_name, created_at`,
        [cleanEmail, cleanUsername, passwordHash, firstName, lastName, phone ? phone.trim() : null]
      );

      const newAdmin = userRes.rows[0];

      // 5. Initialize user settings
      await client.query(
        'INSERT INTO user_settings (user_id) VALUES ($1) ON CONFLICT DO NOTHING',
        [newAdmin.id]
      ).catch(() => {});

      return {
        aborted: false,
        admin: newAdmin,
      };
    });

    if (result.aborted) {
      return res.status(409).json({
        success: false,
        message: `An administrator account with email or identifier "${result.conflicting}" already exists.`,
        code: 'ADMIN_ALREADY_EXISTS',
      });
    }

    pendingReplacementState = {
      newAdminId: result.admin.id,
      email: result.admin.email,
      username: result.admin.username,
      initiatedAt: new Date().toISOString(),
      initiatedBy: actingAdmin ? actingAdmin.email : 'OPERATOR_SECRET',
    };

    await recordAuditLog(
      actingAdmin ? actingAdmin.id : null,
      'ADMIN_REPLACEMENT_INITIATED',
      'users',
      result.admin.id,
      {
        newAdminId: result.admin.id,
        email: result.admin.email,
        username: result.admin.username,
        initiatedBy: actingAdmin ? actingAdmin.email : 'OPERATOR_SECRET',
        note: 'New administrator account provisioned for verification. Previous administrator access remains active until replacement is explicitly confirmed.',
      },
      req
    );

    return res.status(201).json({
      success: true,
      status: 'AWAITING_VERIFICATION_AND_CONFIRMATION',
      message: 'New College Admin account provisioned successfully. Verify authentication with this new account before explicitly confirming replacement.',
      admin: {
        id: result.admin.id,
        email: result.admin.email,
        username: result.admin.username,
        role: result.admin.role,
        status: result.admin.status,
        fullName: `${result.admin.first_name} ${result.admin.last_name}`.trim(),
      },
      provisionalAdmin: {
        id: result.admin.id,
        email: result.admin.email,
        username: result.admin.username,
        role: result.admin.role,
        status: result.admin.status,
        fullName: `${result.admin.first_name} ${result.admin.last_name}`.trim(),
      },
      verificationInstructions: 'Sign in to Campus Inn+ with the new administrator email or username and password to verify access.',
    });
  } catch (err) {
    next(err);
  } finally {
    replacementLock = false;
  }
});

/**
 * POST /api/v1/admin/replace/confirm
 * Step 2 of Replacement: Explicit operator confirmation.
 * Revokes the previous administrator's access only after the new account has been verified.
 * Invalidates all active sessions for the previous administrator.
 * Guarantees that at least one usable administrator remains active.
 */
router.post('/replace/confirm', async (req, res, next) => {
  // Authorization check: Operator secret OR newly authenticated College Admin
  const isOp = isAuthorizedOperator(req);
  let actingUser = null;

  const authHeader = req.headers['authorization'];
  const cookieToken = req.cookies && req.cookies.ci_session;
  const token = (authHeader && authHeader.startsWith('Bearer ')) ? authHeader.substring(7) : cookieToken;
  if (token) {
    try {
      const jwt = require('jsonwebtoken');
      const config = require('../config');
      const decoded = jwt.verify(token, config.jwt.secret);
      const uRes = await query('SELECT * FROM users WHERE id = $1', [decoded.sub || decoded.id]);
      if (uRes.rows.length > 0 && uRes.rows[0].role === 'admin' && uRes.rows[0].status === 'active') {
        actingUser = uRes.rows[0];
      }
    } catch (e) {}
  }

  if (!isOp && !actingUser) {
    return res.status(403).json({
      success: false,
      message: 'Unauthorized. Operator authorization secret or authenticated College Admin session is required to confirm replacement.',
      code: 'OPERATOR_UNAUTHORIZED',
    });
  }

  try {
    const { newAdminId, previousAdminId, previousAdminEmail, confirm } = req.body || {};

    if (confirm !== true && confirm !== 'true') {
      return res.status(400).json({
        success: false,
        message: 'Explicit confirmation (confirm: true) is required to finalize administrator replacement and revoke previous access.',
        code: 'CONFIRMATION_REQUIRED',
      });
    }

    // 1. Resolve new administrator
    const newAdminLookup = newAdminId || (pendingReplacementState && pendingReplacementState.newAdminId) || (actingUser ? actingUser.id : null);
    if (!newAdminLookup) {
      return res.status(400).json({
        success: false,
        message: 'New administrator identifier is required to verify that a replacement account is active.',
        code: 'NEW_ADMIN_REQUIRED',
      });
    }

    const newAdminRes = await query("SELECT * FROM users WHERE (id::text = $1 OR email = $1) AND role = 'admin'", [newAdminLookup]);
    if (newAdminRes.rows.length === 0 || newAdminRes.rows[0].status !== 'active') {
      return res.status(400).json({
        success: false,
        message: 'The new administrator account must exist and be active before previous access can be revoked.',
        code: 'NEW_ADMIN_NOT_VERIFIED',
      });
    }

    const verifiedNewAdmin = newAdminRes.rows[0];

    // 2. Resolve previous administrator to revoke
    let prevAdminRes;
    if (previousAdminId || previousAdminEmail) {
      prevAdminRes = await query(
        "SELECT * FROM users WHERE (id::text = $1 OR email = $1) AND role = 'admin'",
        [previousAdminId || previousAdminEmail]
      );
    } else {
      // If no specific previous admin supplied, target active admins that are NOT the new verified admin
      prevAdminRes = await query(
        "SELECT * FROM users WHERE role = 'admin' AND id != $1 AND status = 'active' ORDER BY created_at ASC",
        [verifiedNewAdmin.id]
      );
    }

    if (prevAdminRes.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'No previous administrator account found to revoke.',
        code: 'PREVIOUS_ADMIN_NOT_FOUND',
      });
    }

    const previousAdmin = prevAdminRes.rows[0];

    if (previousAdmin.id === verifiedNewAdmin.id) {
      return res.status(400).json({
        success: false,
        message: 'Cannot revoke access: The target account to revoke is the new administrator account itself.',
        code: 'INVALID_TARGET_ADMIN',
      });
    }

    // 3. Safety Invariant: Guarantee that at least one usable administrator remains active
    const activeRemainingRes = await query(
      "SELECT COUNT(*) AS count FROM users WHERE role = 'admin' AND status = 'active' AND id != $1",
      [previousAdmin.id]
    );
    const remainingCount = parseInt(activeRemainingRes.rows[0].count, 10);
    if (remainingCount < 1) {
      return res.status(409).json({
        success: false,
        message: 'Replacement aborted: At least one usable College Administrator must remain active in the system.',
        code: 'CANNOT_REMOVE_LAST_ADMIN',
      });
    }

    // 4. Revoke previous administrator access and invalidate all active sessions
    await query(
      `UPDATE users
       SET status = 'suspended', token_version = token_version + 1, updated_at = NOW()
       WHERE id = $1`,
      [previousAdmin.id]
    );

    pendingReplacementState = null;

    await recordAuditLog(
      actingUser ? actingUser.id : null,
      'ADMIN_REPLACEMENT_CONFIRMED',
      'users',
      verifiedNewAdmin.id,
      {
        newAdminId: verifiedNewAdmin.id,
        newAdminEmail: verifiedNewAdmin.email,
        revokedAdminId: previousAdmin.id,
        revokedAdminEmail: previousAdmin.email,
        confirmedBy: actingUser ? actingUser.email : 'OPERATOR_SECRET',
        action: 'Previous administrator access revoked and all active sessions invalidated.',
        timestamp: new Date().toISOString(),
      },
      req
    );

    await createNotification(
      previousAdmin.id,
      'Administrator Access Retired',
      'Your administrator access has been replaced following authorized administrative handover. Sessions have been invalidated.',
      'warning'
    );

    return res.status(200).json({
      success: true,
      message: `Administrator replacement confirmed successfully. Previous administrator (${previousAdmin.email}) access revoked and active sessions invalidated. New administrator (${verifiedNewAdmin.email}) is active.`,
      activeAdminsCount: remainingCount,
      newAdmin: {
        id: verifiedNewAdmin.id,
        email: verifiedNewAdmin.email,
        role: verifiedNewAdmin.role,
        status: verifiedNewAdmin.status,
      },
      revokedAdmin: {
        id: previousAdmin.id,
        email: previousAdmin.email,
        status: 'suspended',
      },
    });
  } catch (err) {
    next(err);
  }
});

/* ══════════════════════════════════════════════════════════
   6. EXISTING ADMINISTRATIVE UTILITIES (PRESERVED)
   ══════════════════════════════════════════════════════════ */

/**
 * GET /api/v1/admin/faculty
 * List all faculty accounts and profiles
 */
router.get('/faculty', authenticate, authorize('admin'), async (req, res, next) => {
  try {
    const facultyRes = await query(
      `SELECT u.id, u.email, u.role, u.status, u.first_name AS "firstName", u.last_name AS "lastName",
              u.phone, u.created_at AS "createdAt", u.last_login AS "lastLogin",
              fp.employee_id AS "employeeId", fp.department, fp.designation, fp.college,
              fp.cabin_number AS "cabinNumber", fp.office_hours AS "officeHours"
       FROM users u
       LEFT JOIN faculty_profiles fp ON fp.user_id = u.id
       WHERE u.role = 'faculty'
       ORDER BY u.created_at DESC`
    );

    return res.status(200).json({
      success: true,
      count: facultyRes.rows.length,
      faculty: facultyRes.rows,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/v1/admin/faculty
 * Administrative provisioning of legitimate faculty member
 */
router.post('/faculty', authenticate, authorize('admin'), validateAdminFacultyRegister, async (req, res, next) => {
  try {
    const {
      email,
      password,
      fullName,
      firstName: reqFirstName,
      lastName: reqLastName,
      employeeId,
      department,
      designation,
      college,
      phone,
      status = 'active',
    } = req.body;

    const cleanEmail = email.trim().toLowerCase();
    const cleanEmpId = employeeId ? employeeId.trim() : null;

    if (cleanEmpId) {
      const existingEmp = await query('SELECT id FROM faculty_profiles WHERE LOWER(employee_id) = LOWER($1)', [cleanEmpId]);
      if (existingEmp.rows.length > 0) {
        return res.status(409).json({
          success: false,
          message: 'A faculty member with this employee ID already exists.',
          code: 'EMPLOYEE_ID_ALREADY_EXISTS',
        });
      }
    }

    let firstName = reqFirstName;
    let lastName = reqLastName;
    if (!firstName && fullName) {
      const parts = fullName.trim().split(/\s+/);
      firstName = parts[0] || 'Faculty';
      lastName = parts.slice(1).join(' ') || 'Member';
    }
    if (!firstName) firstName = 'Faculty';
    if (!lastName) lastName = 'Member';

    const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
    const cleanUsername = cleanEmpId ? cleanEmpId.toLowerCase() : null;

    const userRes = await query(
      `INSERT INTO users (email, password_hash, role, status, first_name, last_name, phone, username, token_version, created_at, updated_at)
       VALUES ($1, $2, 'faculty', $3, $4, $5, $6, $7, 1, NOW(), NOW())
       RETURNING id, email, role, status, first_name, last_name, phone, username, created_at`,
      [cleanEmail, passwordHash, status, firstName, lastName, phone ? phone.trim() : null, cleanUsername]
    );
    const newUser = userRes.rows[0];

    const fpRes = await query(
      `INSERT INTO faculty_profiles (
         user_id, college, department, designation, role_label, employee_id, created_at, updated_at
       ) VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW())
       RETURNING *`,
      [
        newUser.id,
        college || 'MET Institute of Engineering, Nashik',
        department || 'Computer Engineering & IT',
        designation || 'Assistant Professor',
        designation || 'Assistant Professor',
        cleanEmpId,
      ]
    );

    await query('INSERT INTO user_settings (user_id) VALUES ($1) ON CONFLICT DO NOTHING', [newUser.id]).catch(() => {});

    await recordAuditLog(
      req.user.id,
      'FACULTY_PROVISIONED',
      'users',
      newUser.id,
      { email: newUser.email, employeeId: cleanEmpId, department },
      req
    );

    return res.status(201).json({
      success: true,
      message: 'Faculty member provisioned successfully.',
      faculty: {
        id: newUser.id,
        email: newUser.email,
        role: newUser.role,
        status: newUser.status,
        firstName: newUser.first_name,
        lastName: newUser.last_name,
        employeeId: fpRes.rows[0].employee_id,
        department: fpRes.rows[0].department,
        designation: fpRes.rows[0].designation,
        college: fpRes.rows[0].college,
      },
    });
  } catch (err) {
    next(err);
  }
});

/**
 * PATCH /api/v1/admin/faculty/:id/status
 * Administrative status modification for faculty
 */
router.patch('/faculty/:id/status', authenticate, authorize('admin'), async (req, res, next) => {
  try {
    const { status } = req.body;
    const facultyId = req.params.id;

    if (!status || !['active', 'suspended', 'pending'].includes(status.trim().toLowerCase())) {
      return res.status(400).json({
        success: false,
        message: 'Status must be one of: active, suspended, pending.',
        code: 'INVALID_STATUS',
      });
    }

    const cleanStatus = status.trim().toLowerCase();
    const tokenIncrementSql = cleanStatus !== 'active' ? ', token_version = token_version + 1' : '';

    const updateRes = await query(
      `UPDATE users
       SET status = $1 ${tokenIncrementSql}, updated_at = NOW()
       WHERE id::text = $2 AND role = 'faculty'
       RETURNING id, email, role, status, first_name, last_name`,
      [cleanStatus, facultyId]
    );

    if (updateRes.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Faculty account not found.',
        code: 'FACULTY_NOT_FOUND',
      });
    }

    await recordAuditLog(
      req.user.id,
      `FACULTY_STATUS_${cleanStatus.toUpperCase()}`,
      'users',
      updateRes.rows[0].id,
      { email: updateRes.rows[0].email, newStatus: cleanStatus },
      req
    );

    return res.status(200).json({
      success: true,
      message: `Faculty account status updated to ${cleanStatus}.`,
      faculty: updateRes.rows[0],
    });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/v1/admin/census/sync
 * Sync academic census and ledger with University Exam Cell
 */
router.post('/census/sync', authenticate, authorize('admin'), async (req, res, next) => {
  try {
    const studentCountRes = await query('SELECT COUNT(*) AS count FROM student_profiles').catch(() => ({ rows: [{ count: 4820 }] }));
    const count = parseInt(studentCountRes.rows[0].count, 10) || 4820;

    await recordAuditLog(
      req.user.id,
      'CENSUS_SYNCED',
      'student_profiles',
      null,
      { syncedCount: count, ledger: 'SPPU Exam Cell Ledger (MET Nashik)' },
      req
    );

    return res.status(200).json({
      success: true,
      recordsSynced: count,
      syncedWith: 'SPPU Exam Cell Ledger (MET Nashik)',
      syncedAt: new Date().toISOString(),
      timestamp: new Date().toISOString(),
      message: 'Student academic ledger and examination census synchronized successfully.',
    });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/v1/admin/partners/:id/approve
 * Administrative accreditation of campus corporate partner
 */
router.post('/partners/:id/approve', authenticate, authorize('admin'), async (req, res, next) => {
  try {
    const partnerId = req.params.id;
    await query(
      `UPDATE companies SET verification_status = 'approved', status = 'active', updated_at = NOW() WHERE id::text = $1 OR LOWER(name) = LOWER($1)`,
      [partnerId]
    ).catch(() => {});

    await recordAuditLog(
      req.user.id,
      'PARTNER_ACCREDITED',
      'companies',
      null,
      { partner: partnerId },
      req
    );

    return res.status(200).json({
      success: true,
      partner: partnerId,
      status: 'Accredited Partner',
      approvedAt: new Date().toISOString(),
      message: 'Corporate partner verified and accredited.',
    });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/v1/admin/broadcasts
 * Issue campus-wide emergency or recruitment announcement broadcast
 */
router.post('/broadcasts', authenticate, authorize('admin'), async (req, res, next) => {
  try {
    const { title, message, targetRole } = req.body;

    await recordAuditLog(
      req.user.id,
      'BROADCAST_DISPATCHED',
      'broadcasts',
      null,
      { title: title || 'Campus Announcement', targetRole: targetRole || 'all' },
      req
    );

    return res.status(201).json({
      success: true,
      broadcastId: 'BRD-' + Date.now(),
      title: title || 'Campus Announcement',
      targetRole: targetRole || 'all',
      sentAt: new Date().toISOString(),
      message: 'Announcement successfully broadcast to registered portals and notification feeds.',
    });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/v1/admin/provision
 * Authorized Administrator Provisioning of subsequent College Admin or Placement Officer (TPO) accounts
 */
router.post('/provision', authenticate, authorize('admin'), async (req, res, next) => {
  try {
    const { email, password, fullName, firstName: reqFirstName, lastName: reqLastName, role = 'admin', phone, username } = req.body || {};
    const cleanEmail = (email || '').trim().toLowerCase();
    const cleanRole = (role || '').trim().toLowerCase();
    const cleanUsername = username ? username.trim().toLowerCase() : null;

    if (!['admin', 'tpo'].includes(cleanRole)) {
      return res.status(400).json({
        success: false,
        message: 'Role must be either "admin" or "tpo".',
        code: 'INVALID_ROLE',
      });
    }

    if (!cleanEmail || !validator.isEmail(cleanEmail)) {
      return res.status(400).json({
        success: false,
        message: 'A valid email address is required.',
        code: 'INVALID_EMAIL',
      });
    }

    if (!password || typeof password !== 'string' || password.length < 8) {
      return res.status(400).json({
        success: false,
        message: 'Password must be at least 8 characters long.',
        code: 'WEAK_PASSWORD',
      });
    }

    const hasLetter = /[a-zA-Z]/.test(password);
    const hasNumber = /[0-9]/.test(password);
    if (!hasLetter || !hasNumber) {
      return res.status(400).json({
        success: false,
        message: 'Password must contain at least one letter and one number.',
        code: 'WEAK_PASSWORD',
      });
    }

    let firstName = reqFirstName;
    let lastName = reqLastName;
    if (!firstName && fullName) {
      const parts = fullName.trim().split(/\s+/);
      firstName = parts[0] || (cleanRole === 'admin' ? 'Administrator' : 'Officer');
      lastName = parts.slice(1).join(' ') || '';
    }
    if (!firstName) firstName = cleanRole === 'admin' ? 'Administrator' : 'Officer';
    if (lastName === undefined) lastName = '';

    const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);

    const userRes = await query(
      `INSERT INTO users (email, password_hash, role, status, first_name, last_name, phone, username, token_version, created_at, updated_at)
       VALUES ($1, $2, $3, 'active', $4, $5, $6, $7, 1, NOW(), NOW())
       RETURNING id, email, role, status, first_name, last_name, phone, username, created_at`,
      [cleanEmail, passwordHash, cleanRole, firstName, lastName, phone ? phone.trim() : null, cleanUsername]
    );

    const newUser = userRes.rows[0];

    await query('INSERT INTO user_settings (user_id) VALUES ($1) ON CONFLICT DO NOTHING', [newUser.id]).catch(() => {});

    await recordAuditLog(
      req.user.id,
      cleanRole === 'admin' ? 'ADMIN_PROVISIONED' : 'TPO_PROVISIONED',
      'users',
      newUser.id,
      { email: newUser.email, role: cleanRole, provisionedBy: req.user.email },
      req
    );

    return res.status(201).json({
      success: true,
      message: `${cleanRole === 'admin' ? 'College Admin' : 'Placement Officer'} account provisioned successfully.`,
      user: {
        id: newUser.id,
        email: newUser.email,
        role: newUser.role,
        status: newUser.status,
        fullName: `${newUser.first_name} ${newUser.last_name}`.trim(),
      },
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
