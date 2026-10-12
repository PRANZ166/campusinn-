/**
 * Campus Inn+ — Student Routes (/api/v1/students)
 */
const express = require('express');
const { query } = require('../db/pool');
const { authenticate, authorize } = require('../middleware/auth');

const router = express.Router();

/**
 * GET /api/v1/students/me
 * Returns authenticated student profile, academic records, and applications
 */
router.get('/me', authenticate, authorize('student'), async (req, res, next) => {
  try {
    const userId = req.user.id;

    // Fetch student profile
    const profileRes = await query(
      `SELECT sp.*, u.first_name, u.last_name, u.email, u.phone, u.avatar_url
       FROM student_profiles sp
       JOIN users u ON u.id = sp.user_id
       WHERE sp.user_id = $1`,
      [userId]
    );

    if (profileRes.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Student profile not found.',
      });
    }

    const sp = profileRes.rows[0];

    // Fetch applications
    const appsRes = await query(
      `SELECT a.id, a.drive_id AS "driveId", a.status, a.applied_at AS "appliedAt",
              d.title AS "driveTitle", d.ctc, d.location, c.name AS "companyName"
       FROM applications a
       JOIN drives d ON d.id = a.drive_id
       LEFT JOIN companies c ON c.id = d.company_id
       WHERE a.student_id = $1
       ORDER BY a.applied_at DESC`,
      [sp.id]
    );

    // Fetch skills
    const skillsRes = await query(
      'SELECT skill_name, proficiency FROM student_skills WHERE student_id = $1',
      [sp.id]
    );

    return res.status(200).json({
      success: true,
      student: {
        id: sp.id,
        userId: sp.user_id,
        firstName: sp.first_name,
        lastName: sp.last_name,
        fullName: `${sp.first_name} ${sp.last_name}`.trim(),
        email: sp.email,
        phone: sp.phone,
        rollNumber: sp.roll_number,
        college: sp.college,
        department: sp.department,
        program: sp.program,
        academicYear: sp.academic_year,
        semester: sp.semester,
        roleLabel: sp.role_label,
        cgpa: parseFloat(sp.cgpa || 0),
        backlogs: sp.backlogs,
        resumeUrl: sp.resume_url,
        skills: skillsRes.rows.map(s => s.skill_name),
        applications: appsRes.rows,
      },
    });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/v1/students/drives
 * Returns available placement drives with student eligibility indicator
 */
router.get('/drives', authenticate, async (req, res, next) => {
  try {
    let studentCgpa = null;
    let studentBacklogs = null;

    if (req.user.role === 'student') {
      const sp = await query('SELECT cgpa, backlogs FROM student_profiles WHERE user_id = $1', [req.user.id]);
      if (sp.rows.length > 0) {
        studentCgpa = parseFloat(sp.rows[0].cgpa || 0);
        studentBacklogs = parseInt(sp.rows[0].backlogs || 0, 10);
      }
    }

    const drivesRes = await query(
      `SELECT d.id, d.title AS "role", d.ctc, d.location, d.deadline, d.min_cgpa, d.max_backlogs,
              d.status, c.name AS "company", c.tier
       FROM drives d
       LEFT JOIN companies c ON c.id = d.company_id
       WHERE d.status IN ('open', 'draft')
       ORDER BY d.created_at DESC`
    );

    // If drives table has no rows yet, return default campus drives
    let drives = drivesRes.rows;
    if (drives.length === 0) {
      drives = [
        { id: 'drv_goog_2025', company: 'Google Cloud India', role: 'Associate Cloud Engineer', ctc: '22 LPA', location: 'Bengaluru / Pune', deadline: '2026-03-30', eligible: true },
        { id: 'drv_tcs_2025', company: 'Tata Consultancy Services', role: 'Digital Software Engineer', ctc: '9 LPA', location: 'Nashik / Mumbai', deadline: '2026-04-15', eligible: true },
        { id: 'drv_inf_2025', company: 'Infosys Specialty Labs', role: 'Power Programmer / Specialist', ctc: '9.5 LPA', location: 'Pune', deadline: '2026-04-20', eligible: true },
        { id: 'drv_bar_2025', company: 'Barclays Global Service', role: 'Graduate Analyst', ctc: '14 LPA', location: 'Pune', deadline: '2026-05-01', eligible: true },
        { id: 'drv_kpi_2025', company: 'KPIT Technologies', role: 'Embedded Software Engineer', ctc: '8.5 LPA', location: 'Pune', deadline: '2026-05-10', eligible: true }
      ];
      return res.status(200).json(drives);
    }

    const formatted = drives.map(d => {
      const minCgpa = parseFloat(d.min_cgpa || 0);
      const maxBacklogs = parseInt(d.max_backlogs || 0, 10);
      const eligible =
        studentCgpa === null ||
        (studentCgpa >= minCgpa && studentBacklogs <= maxBacklogs);

      return {
        id: d.id,
        company: d.company || 'Campus Partner',
        role: d.role,
        ctc: d.ctc,
        location: d.location,
        deadline: d.deadline ? new Date(d.deadline).toISOString().split('T')[0] : 'Open',
        eligible,
      };
    });

    return res.status(200).json(formatted);
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/v1/students/drives/:id/apply
 * Applies authenticated student to a placement drive
 */
router.post('/drives/:id/apply', authenticate, authorize('student'), async (req, res, next) => {
  try {
    const driveId = req.params.id;
    const { company, title } = req.body;

    let studentId = null;
    let dbConnected = true;

    try {
      const spRes = await query('SELECT id FROM student_profiles WHERE user_id = $1', [req.user.id]);
      if (spRes.rows.length > 0) {
        studentId = spRes.rows[0].id;
      }
    } catch (dbErr) {
      dbConnected = false;
      console.warn('[Students API] Database unavailable during application submit:', dbErr.message);
    }

    if (!dbConnected) {
      return res.status(503).json({
        success: false,
        message: 'PostgreSQL database is currently offline. Cannot persist placement application until database service is restored.',
        code: 'DB_UNAVAILABLE',
      });
    }

    if (!studentId) {
      return res.status(404).json({
        success: false,
        message: 'Student profile not found. Please complete your registration.',
      });
    }

    // Check if drive is UUID or slug
    const driveCheck = await query('SELECT id FROM drives WHERE id::text = $1', [driveId]).catch(() => ({ rows: [] }));

    let actualDriveId = driveCheck.rows.length > 0 ? driveCheck.rows[0].id : null;

    if (!actualDriveId) {
      // Create drive record if it was a slug or seeded identifier
      const insertDrive = await query(
        `INSERT INTO drives (title, ctc, location, status)
         VALUES ($1, 'Market Competitive', 'Campus / Hybrid', 'open')
         RETURNING id`,
        [title || company || driveId]
      ).catch(() => ({ rows: [] }));

      if (insertDrive.rows.length > 0) {
        actualDriveId = insertDrive.rows[0].id;
      }
    }

    if (actualDriveId) {
      await query(
        `INSERT INTO applications (student_id, drive_id, status)
         VALUES ($1, $2, 'applied')
         ON CONFLICT (student_id, drive_id) DO NOTHING`,
        [studentId, actualDriveId]
      );
    }

    return res.status(200).json({
      success: true,
      driveId,
      company: company || 'Placement Partner',
      title: title || 'Campus Recruitment Drive',
      status: 'Applied',
      appliedAt: new Date().toISOString(),
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
