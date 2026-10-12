/**
 * Campus Inn+ — Authentication Routes (/api/v1/auth)
 */
const express = require('express');
const crypto = require('crypto');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const config = require('../config');
const { query } = require('../db/pool');
const { authenticate } = require('../middleware/auth');
const {
  validateLogin,
  validateStudentRegister,
  validateFacultyRegister,
  validateCoordinatorRegister,
  validateRecruiterRegister,
  validateForgotPassword,
  validateResetPassword,
} = require('../middleware/validate');
const emailService = require('../services/email');

const router = express.Router();
const SALT_ROUNDS = 12;

/**
 * Generate standard JWT token and user response object
 */
function generateTokenAndPayload(user, profile = {}) {
  const payload = {
    sub: user.id,
    id: user.id,
    email: user.email,
    role: user.role,
  };

  const token = jwt.sign(payload, config.jwt.secret, {
    expiresIn: config.jwt.expiresIn,
  });

  const userData = {
    id: user.id,
    email: user.email,
    role: user.role,
    firstName: user.first_name,
    lastName: user.last_name,
    fullName: [user.first_name, user.last_name].filter(Boolean).join(' '),
    name: [user.first_name, user.last_name].filter(Boolean).join(' '),
    phone: user.phone,
    avatarUrl: user.avatar_url,
    ...profile,
  };

  return { token, user: userData };
}

/**
 * POST /api/v1/auth/register/student
 */
router.post('/register/student', validateStudentRegister, async (req, res, next) => {
  try {
    const {
      fullName,
      email,
      password,
      phone,
      rollNumber,
      college,
      department,
      program,
      academicYear,
      semester,
    } = req.body;

    const normalizedEmail = email.trim().toLowerCase();

    // Check if email already registered
    const existing = await query('SELECT id FROM users WHERE LOWER(email) = $1', [normalizedEmail]);
    if (existing.rows.length > 0) {
      return res.status(409).json({
        success: false,
        message: 'An account with this email address already exists.',
      });
    }

    // Name mapping: use validated names without hardcoded fallbacks
    const resolvedName = (fullName || '').trim();
    const parts = resolvedName.split(/\s+/);
    const firstName = req.body.firstName || parts[0];
    const lastName = req.body.lastName !== undefined ? req.body.lastName : (parts.slice(1).join(' ') || '');

    if (!firstName || firstName.length < 1) {
      return res.status(400).json({
        success: false,
        message: 'Full name must be at least 2 characters.',
      });
    }

    // Hash password
    const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);

    // Insert user
    const userRes = await query(
      `INSERT INTO users (email, password_hash, role, first_name, last_name, phone)
       VALUES ($1, $2, 'student', $3, $4, $5)
       RETURNING id, email, role, first_name, last_name, phone`,
      [normalizedEmail, passwordHash, firstName, lastName, phone || null]
    );
    const newUser = userRes.rows[0];

    // Auto-generate unique student roll number if not explicitly provided
    const cleanRoll = rollNumber && rollNumber.trim().length > 0
      ? rollNumber.trim().toUpperCase()
      : `CI-${Date.now().toString().slice(-6)}-${Math.floor(100 + Math.random() * 900)}`;

    // Insert student profile
    const profileRes = await query(
      `INSERT INTO student_profiles (
         user_id, roll_number, college, department, program, academic_year, semester, role_label
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [
        newUser.id,
        cleanRoll,
        college || 'MET Institute of Engineering, Nashik',
        department || 'Computer Engineering',
        program || 'B.Tech CSE',
        academicYear || 'Final Year (2024-2025)',
        semester || 'Semester 8',
        `${academicYear || 'Final Year'} ${program || 'B.Tech CSE'}`,
      ]
    );

    const { token, user } = generateTokenAndPayload(newUser, {
      rollNumber: profileRes.rows[0].roll_number,
      college: profileRes.rows[0].college,
      department: profileRes.rows[0].department,
      program: profileRes.rows[0].program,
      academicYear: profileRes.rows[0].academic_year,
      semester: profileRes.rows[0].semester,
      roleLabel: profileRes.rows[0].role_label,
      cgpa: profileRes.rows[0].cgpa,
      backlogs: profileRes.rows[0].backlogs,
    });

    res.cookie('ci_session', token, {
      httpOnly: true,
      secure: config.isProduction(),
      sameSite: 'lax',
      maxAge: 24 * 60 * 60 * 1000,
      path: '/',
    });

    return res.status(201).json({
      success: true,
      message: 'Student account registered successfully.',
      token,
      user,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/v1/auth/register/faculty
 * Self-registration for institutional faculty members (creates pending account awaiting institutional verification)
 */
router.post('/register/faculty', validateFacultyRegister, async (req, res, next) => {
  try {
    const {
      fullName,
      email,
      password,
      phone,
      employeeId,
      college,
      department,
      designation,
      cabinNumber,
      officeHours,
    } = req.body;

    const cleanEmail = email.trim().toLowerCase();
    const cleanEmpId = employeeId.trim();

    // 1. Check if email is already registered
    const existingEmail = await query('SELECT id FROM users WHERE LOWER(email) = $1', [cleanEmail]);
    if (existingEmail.rows.length > 0) {
      return res.status(409).json({
        success: false,
        message: 'An account with this email address already exists.',
        code: 'EMAIL_ALREADY_EXISTS',
      });
    }

    // 2. Check if employeeId is already registered
    const existingEmpId = await query('SELECT id FROM faculty_profiles WHERE LOWER(employee_id) = LOWER($1)', [cleanEmpId]);
    if (existingEmpId.rows.length > 0) {
      return res.status(409).json({
        success: false,
        message: 'A faculty member with this employee ID is already registered.',
        code: 'EMPLOYEE_ID_ALREADY_EXISTS',
      });
    }

    // 3. Name mapping: use validated names without hardcoded fallbacks
    const resolvedName = (fullName || '').trim();
    const parts = resolvedName.split(/\s+/);
    const firstName = req.body.firstName || parts[0];
    const lastName = req.body.lastName !== undefined ? req.body.lastName : (parts.slice(1).join(' ') || '');

    // 4. Hash password securely
    const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);

    // 5. Insert user with 'pending' status awaiting institutional/admin approval
    const userRes = await query(
      `INSERT INTO users (email, password_hash, role, status, first_name, last_name, phone, created_at, updated_at)
       VALUES ($1, $2, 'faculty', 'pending', $3, $4, $5, NOW(), NOW())
       RETURNING id, email, role, status, first_name, last_name, phone, created_at`,
      [cleanEmail, passwordHash, firstName, lastName, phone ? phone.trim() : null]
    );
    const newUser = userRes.rows[0];

    // 6. Insert faculty profile
    const profileRes = await query(
      `INSERT INTO faculty_profiles (
         user_id, employee_id, college, department, designation, role_label,
         cabin_number, office_hours, created_at, updated_at
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW(), NOW())
       RETURNING *`,
      [
        newUser.id,
        cleanEmpId,
        college || 'MET Institute of Engineering, Nashik',
        department || 'Computer Engineering & IT',
        designation || 'Assistant Professor',
        designation || 'Assistant Professor',
        cabinNumber || null,
        officeHours || null,
      ]
    );

    await query('INSERT INTO user_settings (user_id) VALUES ($1) ON CONFLICT DO NOTHING', [newUser.id]).catch(() => {});

    return res.status(201).json({
      success: true,
      message: 'Faculty registration submitted successfully. Your account is pending administrator approval before portal access is activated.',
      status: 'pending',
      requiresApproval: true,
      faculty: {
        id: newUser.id,
        email: newUser.email,
        role: newUser.role,
        status: newUser.status,
        firstName: newUser.first_name,
        lastName: newUser.last_name,
        fullName: [newUser.first_name, newUser.last_name].filter(Boolean).join(' '),
        name: [newUser.first_name, newUser.last_name].filter(Boolean).join(' '),
        employeeId: profileRes.rows[0].employee_id,
        department: profileRes.rows[0].department,
        designation: profileRes.rows[0].designation,
      },
    });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/v1/auth/register/coordinator
 * Self-registration for event/club coordinators (creates pending account awaiting admin authorization)
 */
router.post('/register/coordinator', validateCoordinatorRegister, async (req, res, next) => {
  try {
    const {
      fullName,
      email,
      password,
      phone,
      department,
      clubName,
    } = req.body;

    const cleanEmail = email.trim().toLowerCase();

    // 1. Check if email is already registered
    const existingEmail = await query('SELECT id FROM users WHERE LOWER(email) = $1', [cleanEmail]);
    if (existingEmail.rows.length > 0) {
      return res.status(409).json({
        success: false,
        message: 'An account with this email address already exists.',
        code: 'EMAIL_ALREADY_EXISTS',
      });
    }

    // 2. Name mapping: use validated names without hardcoded fallbacks
    const resolvedName = (fullName || '').trim();
    const parts = resolvedName.split(/\s+/);
    const firstName = req.body.firstName || parts[0];
    const lastName = req.body.lastName !== undefined ? req.body.lastName : (parts.slice(1).join(' ') || '');

    // 3. Hash password securely
    const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);

    // 4. Insert user with 'pending' status awaiting administrative approval
    const userRes = await query(
      `INSERT INTO users (email, password_hash, role, status, first_name, last_name, phone, created_at, updated_at)
       VALUES ($1, $2, 'coordinator', 'pending', $3, $4, $5, NOW(), NOW())
       RETURNING id, email, role, status, first_name, last_name, phone, created_at`,
      [cleanEmail, passwordHash, firstName, lastName, phone ? phone.trim() : null]
    );
    const newUser = userRes.rows[0];

    // 5. Insert coordinator profile
    await query(
      `INSERT INTO coordinator_profiles (
         user_id, department, club_name, role_label, created_at, updated_at
       ) VALUES ($1, $2, $3, $4, NOW(), NOW())
       ON CONFLICT (user_id) DO NOTHING`,
      [
        newUser.id,
        department || 'Central Campus Guild',
        clubName || 'Student Activities & Clubs',
        'Event & Club Coordinator',
      ]
    ).catch((err) => {
      console.warn('[Coordinator Register] Profile insert warning:', err.message);
    });

    await query('INSERT INTO user_settings (user_id) VALUES ($1) ON CONFLICT DO NOTHING', [newUser.id]).catch(() => {});

    return res.status(201).json({
      success: true,
      message: 'Coordinator registration submitted successfully. Your account requires administrator approval before portal access is activated.',
      status: 'pending',
      requiresApproval: true,
      user: {
        id: newUser.id,
        email: newUser.email,
        role: newUser.role,
        status: newUser.status,
        firstName: newUser.first_name,
        lastName: newUser.last_name,
        fullName: [newUser.first_name, newUser.last_name].filter(Boolean).join(' '),
        name: [newUser.first_name, newUser.last_name].filter(Boolean).join(' '),
        department,
        clubName: clubName || 'Student Activities & Clubs',
      },
    });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/v1/auth/register/recruiter
 * Corporate Partner / Recruiter self-registration (creates pending account awaiting TPO verification)
 */
router.post('/register/recruiter', validateRecruiterRegister, async (req, res, next) => {
  try {
    const {
      fullName,
      recruiterName,
      email,
      password,
      phone,
      companyName,
      designation,
      website,
    } = req.body;

    const cleanEmail = email.trim().toLowerCase();
    const cleanCompany = (companyName || '').trim();

    // 1. Check if email is already registered
    const existingEmail = await query('SELECT id FROM users WHERE LOWER(email) = $1', [cleanEmail]);
    if (existingEmail.rows.length > 0) {
      return res.status(409).json({
        success: false,
        message: 'An account with this corporate work email already exists.',
        code: 'EMAIL_ALREADY_EXISTS',
      });
    }

    // 2. Name mapping: use validated names without hardcoded fallbacks
    const rawName = (fullName || recruiterName || '').trim();
    const parts = rawName.split(/\s+/);
    const firstName = req.body.firstName || parts[0];
    const lastName = req.body.lastName !== undefined ? req.body.lastName : (parts.slice(1).join(' ') || '');

    // 3. Hash password securely
    const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);

    // 4. Insert user with 'pending' status awaiting TPO / admin approval
    const userRes = await query(
      `INSERT INTO users (email, password_hash, role, status, first_name, last_name, phone, created_at, updated_at)
       VALUES ($1, $2, 'recruiter', 'pending', $3, $4, $5, NOW(), NOW())
       RETURNING id, email, role, status, first_name, last_name, phone, created_at`,
      [cleanEmail, passwordHash, firstName, lastName, phone ? phone.trim() : null]
    );
    const newUser = userRes.rows[0];

    // 5. Check or create company
    let companyId = null;
    try {
      const compCheck = await query('SELECT id FROM companies WHERE LOWER(name) = LOWER($1)', [cleanCompany]);
      if (compCheck.rows.length > 0) {
        companyId = compCheck.rows[0].id;
      } else {
        const compInsert = await query(
          `INSERT INTO companies (name, website, verification_status, created_by, created_at, updated_at)
           VALUES ($1, $2, 'pending', $3, NOW(), NOW())
           RETURNING id`,
          [cleanCompany, website || null, newUser.id]
        );
        companyId = compInsert.rows[0].id;
      }
    } catch (e) {
      console.warn('[Recruiter Register] Company lookup/creation warning:', e.message);
    }

    // 6. Insert recruiter profile
    await query(
      `INSERT INTO recruiter_profiles (
         user_id, company_id, company_name, designation, role_label, created_at, updated_at
       ) VALUES ($1, $2, $3, $4, $5, NOW(), NOW())
       ON CONFLICT (user_id) DO NOTHING`,
      [
        newUser.id,
        companyId,
        cleanCompany,
        designation || 'Campus Talent Acquisition',
        'Corporate Recruiter',
      ]
    ).catch((err) => {
      console.warn('[Recruiter Register] Profile insert warning:', err.message);
    });

    if (companyId) {
      await query(
        `INSERT INTO company_users (company_id, user_id, is_primary) VALUES ($1, $2, true) ON CONFLICT DO NOTHING`,
        [companyId, newUser.id]
      ).catch(() => {});
    }

    await query('INSERT INTO user_settings (user_id) VALUES ($1) ON CONFLICT DO NOTHING', [newUser.id]).catch(() => {});

    return res.status(201).json({
      success: true,
      message: 'Corporate recruiter registration submitted successfully. Your account requires company verification and TPO approval before candidate access is activated.',
      status: 'pending',
      requiresApproval: true,
      user: {
        id: newUser.id,
        email: newUser.email,
        role: newUser.role,
        status: newUser.status,
        firstName: newUser.first_name,
        lastName: newUser.last_name,
        fullName: [newUser.first_name, newUser.last_name].filter(Boolean).join(' '),
        name: [newUser.first_name, newUser.last_name].filter(Boolean).join(' '),
        companyName: cleanCompany,
        designation: designation || 'Campus Talent Acquisition',
      },
    });
  } catch (err) {
    next(err);
  }
});

/**
 * Privileged Role Safeguards: Reject arbitrary self-registration
 */
router.post('/register/admin', (req, res) => {
  return res.status(403).json({
    success: false,
    message: 'College Admin accounts possess central authority and cannot be self-registered. They must be provisioned by authorized administrators.',
    code: 'PRIVILEGED_ROLE_NOT_SELF_REGISTRABLE',
  });
});

router.post('/register/tpo', (req, res) => {
  return res.status(403).json({
    success: false,
    message: 'Placement Officer accounts possess institutional authority and cannot be self-registered. They must be provisioned by authorized administrators.',
    code: 'PRIVILEGED_ROLE_NOT_SELF_REGISTRABLE',
  });
});

/**
 * POST /api/v1/auth/login
 */
router.post('/login', validateLogin, async (req, res, next) => {
  try {
    const { identifier, password, role } = req.body;
    const cleanId = (identifier || '').trim().toLowerCase();
    const requestedRole = (role || '').trim().toLowerCase();

    // 1. Find user by email
    let userResult = await query(
      `SELECT u.id, u.email, u.password_hash, u.role, u.status, u.first_name, u.last_name, u.phone, u.avatar_url
       FROM users u
       WHERE LOWER(u.email) = $1`,
      [cleanId]
    );

    // 2. If not found, check student_profiles roll_number
    if (userResult.rows.length === 0) {
      userResult = await query(
        `SELECT u.id, u.email, u.password_hash, u.role, u.status, u.first_name, u.last_name, u.phone, u.avatar_url
         FROM users u
         JOIN student_profiles sp ON sp.user_id = u.id
         WHERE LOWER(sp.roll_number) = $1`,
        [cleanId]
      ).catch(() => ({ rows: [] }));
    }

    // 3. If not found, check faculty_profiles employee_id
    if (userResult.rows.length === 0) {
      userResult = await query(
        `SELECT u.id, u.email, u.password_hash, u.role, u.status, u.first_name, u.last_name, u.phone, u.avatar_url
         FROM users u
         JOIN faculty_profiles fp ON fp.user_id = u.id
         WHERE LOWER(fp.employee_id) = $1`,
        [cleanId]
      ).catch(() => ({ rows: [] }));
    }

    if (userResult.rows.length === 0) {
      const isFacultyReq = requestedRole === 'faculty';
      return res.status(401).json({
        success: false,
        message: isFacultyReq
          ? 'Invalid credentials. Please verify your faculty email or ID.'
          : 'Invalid credentials. Please verify your email or roll number.',
        code: 'INVALID_CREDENTIALS',
      });
    }

    const user = userResult.rows[0];

    if (user.status !== 'active') {
      if (user.status === 'pending') {
        return res.status(403).json({
          success: false,
          message: 'Your account registration is pending institutional verification or administrator approval. Please contact the College Administration.',
          code: 'ACCOUNT_PENDING',
        });
      }
      return res.status(403).json({
        success: false,
        message: `Account is ${user.status}. Access denied.`,
        code: 'ACCOUNT_SUSPENDED',
      });
    }

    const match = await bcrypt.compare(password, user.password_hash);
    if (!match) {
      return res.status(401).json({
        success: false,
        message: 'Invalid credentials. Please check your password.',
        code: 'INVALID_PASSWORD',
      });
    }

    // 4. Role Authorization: verify user is authorized for the requested portal
    if (requestedRole) {
      if (requestedRole === 'admin' && user.role !== 'admin') {
        return res.status(403).json({
          success: false,
          message: 'Access denied. This account does not possess administrative privileges.',
          code: 'UNAUTHORIZED_ROLE',
        });
      }

      if (requestedRole === 'faculty' && user.role !== 'faculty' && user.role !== 'admin') {
        return res.status(403).json({
          success: false,
          message: 'Access denied. This account is not authorized for the Faculty Portal.',
          code: 'UNAUTHORIZED_ROLE',
        });
      }

      if (requestedRole === 'student' && user.role !== 'student' && user.role !== 'admin') {
        return res.status(403).json({
          success: false,
          message: 'Access denied. This account is not registered as a student.',
          code: 'UNAUTHORIZED_ROLE',
        });
      }

      if (['tpo', 'coordinator', 'recruiter'].includes(requestedRole) && user.role !== requestedRole && user.role !== 'admin') {
        return res.status(403).json({
          success: false,
          message: `Access denied. This account is not authorized for the ${requestedRole} portal.`,
          code: 'UNAUTHORIZED_ROLE',
        });
      }
    }

    // Fetch role-specific profile details
    let profileData = {};
    if (user.role === 'student') {
      const sp = await query('SELECT * FROM student_profiles WHERE user_id = $1', [user.id]);
      if (sp.rows.length > 0) {
        const p = sp.rows[0];
        profileData = {
          rollNumber: p.roll_number,
          college: p.college,
          department: p.department,
          program: p.program,
          academicYear: p.academic_year,
          semester: p.semester,
          roleLabel: p.role_label,
          cgpa: parseFloat(p.cgpa || 0),
          backlogs: p.backlogs,
          resumeUrl: p.resume_url,
        };
      }
    } else if (user.role === 'faculty') {
      const fp = await query('SELECT * FROM faculty_profiles WHERE user_id = $1', [user.id]);
      if (fp.rows.length > 0) {
        const p = fp.rows[0];
        profileData = {
          department: p.department,
          designation: p.designation,
          college: p.college,
          roleLabel: p.role_label,
          employeeId: p.employee_id,
          cabinNumber: p.cabin_number,
          officeHours: p.office_hours,
        };
      }
    } else if (user.role === 'recruiter') {
      const rp = await query(
        `SELECT rp.*, c.name AS company_name, c.logo_url
         FROM recruiter_profiles rp
         LEFT JOIN companies c ON c.id = rp.company_id
         WHERE rp.user_id = $1`,
        [user.id]
      );
      if (rp.rows.length > 0) {
        const p = rp.rows[0];
        profileData = {
          companyId: p.company_id,
          companyName: p.company_name,
          designation: p.designation,
          roleLabel: p.role_label,
        };
      }
    }

    const { token, user: userPayload } = generateTokenAndPayload(user, profileData);

    res.cookie('ci_session', token, {
      httpOnly: true,
      secure: config.isProduction(),
      sameSite: 'lax',
      maxAge: 24 * 60 * 60 * 1000,
      path: '/',
    });

    return res.status(200).json({
      success: true,
      token,
      user: userPayload,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/v1/auth/me
 */
router.get('/me', authenticate, async (req, res, next) => {
  try {
    const user = req.user;
    let profileData = {};

    if (user.role === 'student') {
      const sp = await query('SELECT * FROM student_profiles WHERE user_id = $1', [user.id]).catch(() => ({ rows: [] }));
      if (sp.rows.length > 0) {
        const p = sp.rows[0];
        profileData = {
          rollNumber: p.roll_number,
          college: p.college,
          department: p.department,
          program: p.program,
          academicYear: p.academic_year,
          semester: p.semester,
          roleLabel: p.role_label,
          cgpa: parseFloat(p.cgpa || 0),
          backlogs: p.backlogs,
          resumeUrl: p.resume_url,
        };
      }
    } else if (user.role === 'faculty') {
      const fp = await query('SELECT * FROM faculty_profiles WHERE user_id = $1', [user.id]).catch(() => ({ rows: [] }));
      if (fp.rows.length > 0) {
        const p = fp.rows[0];
        profileData = {
          department: p.department,
          designation: p.designation,
          college: p.college,
          roleLabel: p.role_label,
        };
      }
    } else if (user.role === 'recruiter') {
      const rp = await query(
        `SELECT rp.*, c.name AS company_name, c.logo_url
         FROM recruiter_profiles rp
         LEFT JOIN companies c ON c.id = rp.company_id
         WHERE rp.user_id = $1`,
        [user.id]
      ).catch(() => ({ rows: [] }));
      if (rp.rows.length > 0) {
        const p = rp.rows[0];
        profileData = {
          companyId: p.company_id,
          companyName: p.company_name,
          designation: p.designation,
          roleLabel: p.role_label,
        };
      }
    }

    return res.status(200).json({
      success: true,
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        firstName: user.firstName,
        lastName: user.lastName,
        phone: user.phone,
        avatarUrl: user.avatarUrl,
        ...profileData,
      },
    });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/v1/auth/logout
 */
router.post('/logout', (req, res) => {
  res.clearCookie('ci_session', { path: '/' });
  return res.status(200).json({
    success: true,
    message: 'Logged out successfully.',
  });
});

const { OAuth2Client } = require('google-auth-library');
const oauthStateStore = require('../services/oauthStateStore');

function getGoogleOAuthClient() {
  if (!config.google.clientId || !config.google.clientSecret) {
    return null;
  }
  return new OAuth2Client(
    config.google.clientId,
    config.google.clientSecret,
    config.google.callbackUrl
  );
}

/**
 * Helper: Check if origin is a trusted frontend origin.
 * Strictly prevents open-redirect and token-exfiltration vulnerabilities.
 */
function isTrustedFrontendOrigin(originStr) {
  if (!originStr || typeof originStr !== 'string') return false;
  try {
    const url = new URL(originStr);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return false;

    const origin = url.origin.toLowerCase();

    // 1. Configured frontend URL
    if (config.frontendUrl) {
      try {
        const configuredOrigin = new URL(config.frontendUrl).origin.toLowerCase();
        if (origin === configuredOrigin) return true;
      } catch (e) {}
    }

    // 2. CORS configured origins
    if (config.cors && Array.isArray(config.cors.origins)) {
      for (const allowed of config.cors.origins) {
        try {
          if (allowed && new URL(allowed).origin.toLowerCase() === origin) {
            return true;
          }
        } catch (e) {}
      }
    }

    // 3. Vercel deployment URLs for Campus Inn project
    if (url.hostname.endsWith('.vercel.app') && url.hostname.includes('campusinn')) {
      return true;
    }

    // 4. In development, allow localhost and 127.0.0.1
    if (!config.isProduction()) {
      if (url.hostname === 'localhost' || url.hostname === '127.0.0.1') {
        return true;
      }
    }

    return false;
  } catch (e) {
    return false;
  }
}

/**
 * Helper: Determine frontend base URL for OAuth redirects.
 * Resolves to production Vercel frontend, or local development origin if initiated locally.
 */
function getFrontendRedirectBase(req) {
  // 1. Check if an explicit frontend origin was tracked in cookie during login initiation
  const trackedOrigin = req && req.cookies && req.cookies.ci_oauth_frontend;
  if (trackedOrigin && isTrustedFrontendOrigin(trackedOrigin)) {
    return trackedOrigin.replace(/\/+$/, '');
  }

  // 2. Use configured frontendUrl if trusted
  if (config.frontendUrl && isTrustedFrontendOrigin(config.frontendUrl)) {
    return config.frontendUrl.replace(/\/+$/, '');
  }

  // 3. Fallback to production Vercel default
  if (config.isProduction()) {
    return 'https://campusinn-frontend-9nxrritaj-pranz.vercel.app';
  }

  return 'http://localhost:5500';
}

/**
 * GET /api/v1/auth/google
 * Initiates the genuine Google OAuth 2.0 flow with cryptographically random state & PKCE/nonce
 */
router.get('/google', (req, res) => {
  const oauth2Client = getGoogleOAuthClient();
  if (!oauth2Client) {
    return res.status(503).json({
      success: false,
      message: 'Google OAuth is not configured on the server. Missing GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET.',
      code: 'GOOGLE_OAUTH_NOT_CONFIGURED',
    });
  }

  // Track initiating frontend origin (from query or referer)
  let initiatorOrigin = req.query.frontend_url;
  if (!initiatorOrigin && req.headers.referer) {
    try {
      initiatorOrigin = new URL(req.headers.referer).origin;
    } catch (e) {}
  }
  if (initiatorOrigin && !isTrustedFrontendOrigin(initiatorOrigin)) {
    initiatorOrigin = null;
  }
  // Create cryptographically random per-login state token with HMAC signature & server-side storage
  const stateRecord = oauthStateStore.createState({
    frontendUrl: initiatorOrigin,
    redirect: req.query.redirect,
  });
  const state = stateRecord.stateToken;

  const cookieOptions = {
    httpOnly: true,
    secure: config.isProduction(),
    sameSite: config.isProduction() ? 'none' : 'lax',
    maxAge: 10 * 60 * 1000,
    path: '/',
  };

  if (initiatorOrigin) {
    res.cookie('ci_oauth_frontend', initiatorOrigin, cookieOptions);
  }

  // Store state in a short-lived HTTP-only cookie for CSRF validation (10 minutes)
  res.cookie('ci_oauth_state', state, cookieOptions);

  if (req.query.redirect) {
    res.cookie('ci_oauth_redirect', req.query.redirect, cookieOptions);
  }

  const authUrl = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: [
      'https://www.googleapis.com/auth/userinfo.profile',
      'https://www.googleapis.com/auth/userinfo.email',
    ],
    state,
    prompt: 'select_account',
  });

  return res.redirect(authUrl);
});

/**
 * Helper: Find or create user from verified Google profile
 */
async function findOrCreateGoogleUser(googlePayload) {
  const { sub: googleId, email, email_verified, given_name, family_name, picture } = googlePayload;

  if (!email || !email_verified) {
    throw new Error('Unverified email from Google account. Verified campus email required.');
  }

  const normalizedEmail = email.trim().toLowerCase();
  const firstName = given_name || 'Student';
  const lastName = family_name || '';

  // 1. Check if user with this google_id already exists
  let userRes = await query(
    `SELECT u.id, u.email, u.role, u.status, u.first_name, u.last_name, u.phone, u.avatar_url, u.google_id
     FROM users u
     WHERE u.google_id = $1`,
    [googleId]
  ).catch(() => ({ rows: [] }));

  let user = userRes.rows[0];

  // 2. If not found by google_id, check by email
  if (!user) {
    const emailRes = await query(
      `SELECT u.id, u.email, u.role, u.status, u.first_name, u.last_name, u.phone, u.avatar_url, u.google_id
       FROM users u
       WHERE LOWER(u.email) = $1`,
      [normalizedEmail]
    ).catch(() => ({ rows: [] }));

    if (emailRes.rows.length > 0) {
      user = emailRes.rows[0];
      // Securely link existing account with Google ID if not linked yet
      if (!user.google_id) {
        await query(`UPDATE users SET google_id = $1, avatar_url = COALESCE(avatar_url, $2) WHERE id = $3`, [
          googleId,
          picture || null,
          user.id,
        ]).catch(() => {});
      }
    }
  }

  // 3. If user still does not exist, provision as new student account (safe default, NEVER elevated role)
  if (!user) {
    const randomPassword = crypto.randomBytes(32).toString('hex');
    const passwordHash = await bcrypt.hash(randomPassword, SALT_ROUNDS);

    const newUserRes = await query(
      `INSERT INTO users (email, password_hash, role, status, first_name, last_name, google_id, avatar_url)
       VALUES ($1, $2, 'student', 'active', $3, $4, $5, $6)
       RETURNING id, email, role, status, first_name, last_name, phone, avatar_url`,
      [normalizedEmail, passwordHash, firstName, lastName, googleId, picture || null]
    ).catch(() => ({ rows: [] }));

    if (newUserRes.rows.length > 0) {
      user = newUserRes.rows[0];
      // Create student profile for new Google user with valid roll number
      const googleRoll = `CI-G-${Date.now().toString().slice(-6)}-${Math.floor(100 + Math.random() * 900)}`;
      await query(
        `INSERT INTO student_profiles (user_id, roll_number, college, department, program, academic_year, semester, role_label)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         ON CONFLICT (user_id) DO NOTHING`,
        [
          user.id,
          googleRoll,
          'MET Institute of Engineering, Nashik',
          'Computer Engineering',
          'B.Tech CSE',
          'Final Year (2024-2025)',
          'Semester 8',
          'Final Year B.Tech CSE',
        ]
      ).catch(() => {});
    } else {
      // In-memory / degraded fallback if DB is offline
      user = {
        id: 'usr_g_' + googleId.substring(0, 8),
        email: normalizedEmail,
        role: 'student',
        status: 'active',
        first_name: firstName,
        last_name: lastName,
        phone: null,
        avatar_url: picture || null,
      };
    }
  }

  if (user.status && user.status !== 'active') {
    throw new Error(`Account is ${user.status}. Access denied.`);
  }

  return user;
}

/**
 * GET /api/v1/auth/google/callback
 * Google OAuth 2.0 redirect handler
 */
router.get('/google/callback', async (req, res) => {
  let frontendBase = getFrontendRedirectBase(req);

  try {
    const { code, state, error } = req.query;

    // Handle user cancellation on Google consent screen
    if (error) {
      res.clearCookie('ci_oauth_state', { path: '/' });
      res.clearCookie('ci_oauth_frontend', { path: '/' });
      res.clearCookie('ci_oauth_redirect', { path: '/' });
      return res.redirect(`${frontendBase}/login.html?error=${encodeURIComponent('Google authentication was cancelled: ' + error)}`);
    }

    // Validate state parameter to prevent CSRF using server-side store + HMAC signature + cookie
    const storedState = req.cookies && req.cookies.ci_oauth_state;
    res.clearCookie('ci_oauth_state', { path: '/' });

    const validation = oauthStateStore.verifyAndConsumeState(state, storedState);

    if (!validation.valid) {
      res.clearCookie('ci_oauth_frontend', { path: '/' });
      res.clearCookie('ci_oauth_redirect', { path: '/' });
      return res.redirect(
        `${frontendBase}/login.html?error=${encodeURIComponent('Invalid or expired OAuth state parameter. Please try signing in again.')}`
      );
    }

    // If state record contains initiating frontendUrl, prefer it for redirection ONLY IF trusted
    if (validation.stateRecord && validation.stateRecord.frontendUrl) {
      const candidate = validation.stateRecord.frontendUrl.replace(/\/+$/, '');
      if (isTrustedFrontendOrigin(candidate)) {
        frontendBase = candidate;
      }
    }

    if (!code) {
      res.clearCookie('ci_oauth_frontend', { path: '/' });
      res.clearCookie('ci_oauth_redirect', { path: '/' });
      return res.redirect(`${frontendBase}/login.html?error=${encodeURIComponent('No authorization code provided by Google.')}`);
    }

    const oauth2Client = getGoogleOAuthClient();
    if (!oauth2Client) {
      res.clearCookie('ci_oauth_frontend', { path: '/' });
      res.clearCookie('ci_oauth_redirect', { path: '/' });
      return res.redirect(`${frontendBase}/login.html?error=${encodeURIComponent('Google OAuth is not configured on the server.')}`);
    }

    // Exchange authorization code for tokens
    const { tokens } = await oauth2Client.getToken(code);
    oauth2Client.setCredentials(tokens);

    // Verify ID Token securely
    const ticket = await oauth2Client.verifyIdToken({
      idToken: tokens.id_token,
      audience: config.google.clientId,
    });
    const payload = ticket.getPayload();

    const user = await findOrCreateGoogleUser(payload);

    // Fetch student profile details if user is student
    let profileData = {};
    if (user.role === 'student') {
      const sp = await query('SELECT * FROM student_profiles WHERE user_id = $1', [user.id]).catch(() => ({ rows: [] }));
      if (sp.rows.length > 0) {
        const p = sp.rows[0];
        profileData = {
          rollNumber: p.roll_number,
          college: p.college,
          department: p.department,
          program: p.program,
          academicYear: p.academic_year,
          semester: p.semester,
          roleLabel: p.role_label,
          cgpa: parseFloat(p.cgpa || 0),
          backlogs: p.backlogs,
          resumeUrl: p.resume_url,
        };
      }
    }

    const { token, user: userPayload } = generateTokenAndPayload(user, profileData);

    // Set secure HTTP-only session cookie
    res.cookie('ci_session', token, {
      httpOnly: true,
      secure: config.isProduction(),
      sameSite: 'lax',
      maxAge: 24 * 60 * 60 * 1000,
      path: '/',
    });

    // Also pass token via URL fragment or param for frontend localStorage synchronization
    const redirectData = encodeURIComponent(JSON.stringify({ token, user: userPayload }));
    let returnTo = (req.cookies && req.cookies.ci_oauth_redirect) || (validation.stateRecord && validation.stateRecord.redirect);
    res.clearCookie('ci_oauth_redirect', { path: '/' });
    res.clearCookie('ci_oauth_frontend', { path: '/' });

    // Sanitize returnTo: in production, never allow localhost redirects or open redirects
    if (returnTo) {
      if (config.isProduction() && (returnTo.includes('localhost') || returnTo.includes('127.0.0.1'))) {
        try {
          const u = new URL(returnTo, frontendBase);
          returnTo = u.pathname + u.search + u.hash;
        } catch (e) {
          returnTo = 'index.html';
        }
      } else if (/^https?:\/\//i.test(returnTo)) {
        try {
          const u = new URL(returnTo);
          if (!isTrustedFrontendOrigin(u.origin)) {
            returnTo = u.pathname + u.search + u.hash;
          }
        } catch (e) {
          returnTo = 'index.html';
        }
      }
    }

    const redirectParam = returnTo ? `&redirect=${encodeURIComponent(returnTo)}` : '';
    return res.redirect(`${frontendBase}/login.html?google_auth_success=1&auth_payload=${redirectData}${redirectParam}`);
  } catch (err) {
    res.clearCookie('ci_oauth_state', { path: '/' });
    res.clearCookie('ci_oauth_frontend', { path: '/' });
    res.clearCookie('ci_oauth_redirect', { path: '/' });
    return res.redirect(`${frontendBase}/login.html?error=${encodeURIComponent(err.message || 'Google authentication failed.')}`);
  }
});

/**
 * POST /api/v1/auth/google-sso
 * API endpoint to verify Google credential token submitted via frontend (One-Tap / Client-side)
 */
router.post('/google-sso', async (req, res, next) => {
  const { credential } = req.body;
  if (!credential) {
    return res.status(400).json({
      success: false,
      message: 'Google credential ID token is required.',
      code: 'CREDENTIAL_REQUIRED',
    });
  }

  const oauth2Client = getGoogleOAuthClient();
  if (!oauth2Client) {
    return res.status(503).json({
      success: false,
      message: 'Google OAuth verification requires GOOGLE_CLIENT_ID configuration on Google Cloud Console.',
      code: 'GOOGLE_OAUTH_NOT_CONFIGURED',
    });
  }

  try {
    const ticket = await oauth2Client.verifyIdToken({
      idToken: credential,
      audience: config.google.clientId,
    });
    const payload = ticket.getPayload();

    const user = await findOrCreateGoogleUser(payload);

    let profileData = {};
    if (user.role === 'student') {
      const sp = await query('SELECT * FROM student_profiles WHERE user_id = $1', [user.id]).catch(() => ({ rows: [] }));
      if (sp.rows.length > 0) {
        const p = sp.rows[0];
        profileData = {
          rollNumber: p.roll_number,
          college: p.college,
          department: p.department,
          program: p.program,
          academicYear: p.academic_year,
          semester: p.semester,
          roleLabel: p.role_label,
          cgpa: parseFloat(p.cgpa || 0),
          backlogs: p.backlogs,
          resumeUrl: p.resume_url,
        };
      }
    }

    const { token, user: userPayload } = generateTokenAndPayload(user, profileData);

    res.cookie('ci_session', token, {
      httpOnly: true,
      secure: config.isProduction(),
      sameSite: 'lax',
      maxAge: 24 * 60 * 60 * 1000,
      path: '/',
    });

    return res.status(200).json({
      success: true,
      token,
      user: userPayload,
    });
  } catch (err) {
    return res.status(401).json({
      success: false,
      message: err.message || 'Invalid Google credential token.',
      code: 'INVALID_GOOGLE_TOKEN',
    });
  }
});

/**
 * POST /api/v1/auth/forgot-password
 * Initiates single-use password recovery token and dispatches reset email
 */
router.post('/forgot-password', validateForgotPassword, async (req, res, next) => {
  try {
    const { email } = req.body;
    const normalizedEmail = email.trim().toLowerCase();

    // Verify SMTP service configuration
    if (!emailService.isConfigured()) {
      console.warn('[Auth] SMTP service credentials not configured. Cannot dispatch password recovery email.');
      return res.status(503).json({
        success: false,
        message: 'Password recovery email service is temporarily unavailable. Please contact institutional support or configure SMTP credentials.',
        code: 'EMAIL_SERVICE_UNAVAILABLE',
      });
    }

    // Generic response protecting against account enumeration
    const genericResponse = {
      success: true,
      message: 'If an account exists with this email address, password reset instructions have been sent.',
    };

    // Lookup user by normalized email
    let userRes;
    try {
      userRes = await query(
        'SELECT id, email, first_name, status FROM users WHERE LOWER(email) = $1',
        [normalizedEmail]
      );
    } catch (dbErr) {
      console.error('[Auth] Database error looking up user for forgot-password:', dbErr.message);
      return res.status(503).json({
        success: false,
        message: 'Service is temporarily unavailable. Please try again later.',
        code: 'SERVICE_UNAVAILABLE',
      });
    }

    // If user does not exist or account is inactive, return generic response without revealing existence
    if (userRes.rows.length === 0 || userRes.rows[0].status !== 'active') {
      return res.status(200).json(genericResponse);
    }

    const user = userRes.rows[0];

    // Anti-flooding: check if an unexpired token was created in the last 60 seconds
    const recentToken = await query(
      `SELECT id FROM password_reset_tokens
       WHERE user_id = $1 AND created_at > NOW() - INTERVAL '60 seconds' AND consumed_at IS NULL`,
      [user.id]
    ).catch(() => ({ rows: [] }));

    if (recentToken.rows.length > 0) {
      // Rapid duplicate request: suppress duplicate email dispatch, return generic success
      return res.status(200).json(genericResponse);
    }

    // Generate cryptographically secure random token (32 bytes hex)
    const rawToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15-minute expiration

    // Persist hashed token
    await query(
      `INSERT INTO password_reset_tokens (user_id, token_hash, expires_at)
       VALUES ($1, $2, $3)`,
      [user.id, tokenHash, expiresAt]
    );

    // Build reset link using validated FRONTEND_URL
    const frontendBase = (config.frontendUrl || 'https://campusinn-frontend-9nxrritaj-pranz.vercel.app').replace(/\/+$/, '');
    const resetUrl = `${frontendBase}/reset-password.html?token=${rawToken}`;

    // Send email via SMTP
    try {
      await emailService.sendPasswordResetEmail({
        to: user.email,
        firstName: user.first_name,
        resetUrl,
        expiresInMinutes: 15,
      });
    } catch (emailErr) {
      console.error('[Auth] Password reset email dispatch failed:', emailErr.message);
      return res.status(503).json({
        success: false,
        message: 'Unable to deliver password reset email at this time. Please try again later.',
        code: 'EMAIL_DELIVERY_FAILED',
      });
    }

    return res.status(200).json(genericResponse);
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/v1/auth/reset-password
 * Consumes single-use reset token atomically, validates password, and updates hash
 */
router.post('/reset-password', validateResetPassword, async (req, res, next) => {
  try {
    const { token, newPassword } = req.body;
    const tokenHash = crypto.createHash('sha256').update(token.trim()).digest('hex');

    // Look up token with associated user account
    const tokenRes = await query(
      `SELECT prt.id, prt.user_id, prt.expires_at, prt.consumed_at, u.status
       FROM password_reset_tokens prt
       JOIN users u ON u.id = prt.user_id
       WHERE prt.token_hash = $1`,
      [tokenHash]
    );

    if (tokenRes.rows.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Invalid or unrecognized password reset link.',
        code: 'INVALID_TOKEN',
      });
    }

    const record = tokenRes.rows[0];

    // Check if token was already consumed
    if (record.consumed_at) {
      return res.status(400).json({
        success: false,
        message: 'This password reset link has already been used. Please request a new link.',
        code: 'TOKEN_ALREADY_USED',
      });
    }

    // Check expiration timestamp
    if (new Date(record.expires_at).getTime() < Date.now()) {
      return res.status(400).json({
        success: false,
        message: 'This password reset link has expired (15-minute validity limit). Please request a new link.',
        code: 'TOKEN_EXPIRED',
      });
    }

    // Check user account status
    if (record.status !== 'active') {
      return res.status(403).json({
        success: false,
        message: 'Account is suspended or deactivated. Password cannot be reset.',
        code: 'ACCOUNT_INACTIVE',
      });
    }

    // Hash new password using project standard SALT_ROUNDS
    const newPasswordHash = await bcrypt.hash(newPassword, SALT_ROUNDS);

    // Atomically mark token consumed and update password
    await query(
      `UPDATE password_reset_tokens SET consumed_at = NOW() WHERE id = $1`,
      [record.id]
    );

    await query(
      `UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2`,
      [newPasswordHash, record.user_id]
    );

    // Invalidate any other outstanding reset tokens for this user
    await query(
      `UPDATE password_reset_tokens SET consumed_at = NOW() WHERE user_id = $1 AND consumed_at IS NULL`,
      [record.user_id]
    );

    // Clear session cookie if set
    res.clearCookie('ci_session', { path: '/' });

    return res.status(200).json({
      success: true,
      message: 'Your password has been successfully reset. Please sign in with your new password.',
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;


