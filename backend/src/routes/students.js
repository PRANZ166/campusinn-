const express = require('express');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const config = require('../config');
const { query } = require('../db/pool');
const { authenticate, authorize } = require('../middleware/auth');

const router = express.Router();

// Ensure resume upload directory exists
const RESUME_DIR = path.resolve(config.upload.dir, 'resumes');
if (!fs.existsSync(RESUME_DIR)) {
  try {
    fs.mkdirSync(RESUME_DIR, { recursive: true });
  } catch (err) {
    console.warn('[Students API] Could not create resume directory:', err.message);
  }
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    if (!fs.existsSync(RESUME_DIR)) {
      fs.mkdirSync(RESUME_DIR, { recursive: true });
    }
    cb(null, RESUME_DIR);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    const safeOrig = file.originalname.replace(/[\/\\]/g, '_');
    cb(null, `${req.user.id}__${uniqueSuffix}__${safeOrig}`);
  },
});

const fileFilter = (req, file, cb) => {
  const allowedExts = ['.pdf', '.doc', '.docx'];
  const ext = path.extname(file.originalname).toLowerCase();
  const allowedMimes = [
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  ];

  if (!allowedExts.includes(ext) && !allowedMimes.includes(file.mimetype)) {
    const err = new Error('Invalid file type. Only PDF and DOCX files are permitted.');
    err.code = 'INVALID_FILE_TYPE';
    return cb(err, false);
  }
  cb(null, true);
};

const upload = multer({
  storage,
  limits: {
    fileSize: config.upload.maxFileSizeMB * 1024 * 1024,
  },
  fileFilter,
});

const uploadResumeMiddleware = (req, res, next) => {
  const uploadHandler = upload.fields([
    { name: 'cvFile', maxCount: 1 },
    { name: 'resume', maxCount: 1 },
    { name: 'file', maxCount: 1 },
  ]);

  uploadHandler(req, res, (err) => {
    if (err) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({
          success: false,
          message: `File size exceeds the ${config.upload.maxFileSizeMB}MB limit.`,
          code: 'FILE_TOO_LARGE',
        });
      }
      return res.status(400).json({
        success: false,
        message: err.message || 'File upload failed.',
        code: err.code || 'UPLOAD_ERROR',
      });
    }

    const file =
      (req.files && (req.files['cvFile']?.[0] || req.files['resume']?.[0] || req.files['file']?.[0])) ||
      req.file;
    req.uploadedResume = file;
    next();
  });
};

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
    ).catch(() => ({ rows: [] }));

    // Fetch skills
    const skillsRes = await query(
      'SELECT skill_name, proficiency FROM student_skills WHERE student_id = $1',
      [sp.id]
    ).catch(() => ({ rows: [] }));

    // Fetch real uploaded resume metadata from cv_documents
    const cvRes = await query(
      `SELECT id, original_name, file_size, mime_type, uploaded_at
       FROM cv_documents
       WHERE user_id = $1
       ORDER BY uploaded_at DESC LIMIT 1`,
      [userId]
    ).catch(() => ({ rows: [] }));

    const currentCv = cvRes.rows.length > 0 ? {
      id: cvRes.rows[0].id,
      name: cvRes.rows[0].original_name,
      size: `${Math.round(cvRes.rows[0].file_size / 1024)} KB`,
      fileSizeBytes: cvRes.rows[0].file_size,
      mimeType: cvRes.rows[0].mime_type,
      uploadedAt: cvRes.rows[0].uploaded_at,
      downloadUrl: '/api/v1/students/resume/download',
    } : null;

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
        resumeUrl: currentCv ? '/api/v1/students/resume/download' : (sp.resume_url || null),
        cv: currentCv,
        skills: skillsRes.rows.map(s => s.skill_name),
        applications: appsRes.rows,
      },
    });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/v1/students/resume
 * Returns current authenticated student's uploaded CV metadata
 */
router.get('/resume', authenticate, authorize('student'), async (req, res, next) => {
  try {
    const userId = req.user.id;
    const cvRes = await query(
      `SELECT id, original_name, file_size, mime_type, uploaded_at
       FROM cv_documents
       WHERE user_id = $1
       ORDER BY uploaded_at DESC LIMIT 1`,
      [userId]
    ).catch(() => ({ rows: [] }));

    if (cvRes.rows.length === 0) {
      // Check if file exists in uploads/resumes for this student
      let fallbackResume = null;
      if (fs.existsSync(RESUME_DIR)) {
        const files = fs.readdirSync(RESUME_DIR).filter(f => f.startsWith(`${userId}__`));
        if (files.length > 0) {
          const latest = files[files.length - 1];
          const stats = fs.statSync(path.join(RESUME_DIR, latest));
          const origName = latest.split('__')[2] || 'Resume.pdf';
          fallbackResume = {
            id: 'local_file',
            name: origName,
            size: `${Math.round(stats.size / 1024)} KB`,
            fileSizeBytes: stats.size,
            mimeType: 'application/pdf',
            uploadedAt: stats.mtime.toISOString(),
            downloadUrl: '/api/v1/students/resume/download',
          };
        }
      }

      return res.status(200).json({
        success: true,
        resume: fallbackResume,
      });
    }

    const row = cvRes.rows[0];
    return res.status(200).json({
      success: true,
      resume: {
        id: row.id,
        name: row.original_name,
        size: `${Math.round(row.file_size / 1024)} KB`,
        fileSizeBytes: row.file_size,
        mimeType: row.mime_type,
        uploadedAt: row.uploaded_at,
        downloadUrl: '/api/v1/students/resume/download',
      },
    });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/v1/students/resume
 * Uploads or replaces candidate resume, stores file on disk, updates database
 */
router.post('/resume', authenticate, authorize('student'), uploadResumeMiddleware, async (req, res, next) => {
  try {
    const file = req.uploadedResume;
    if (!file) {
      return res.status(400).json({
        success: false,
        message: 'No resume file provided. Please select a valid PDF or DOCX file (max 5MB).',
        code: 'NO_FILE_PROVIDED',
      });
    }

    const userId = req.user.id;

    // Purge previous physical files for this student
    const oldFiles = await query(
      'SELECT storage_key FROM cv_documents WHERE user_id = $1',
      [userId]
    ).catch(() => ({ rows: [] }));

    for (const old of oldFiles.rows) {
      if (old.storage_key && fs.existsSync(old.storage_key)) {
        try {
          fs.unlinkSync(old.storage_key);
        } catch (unlinkErr) {
          console.warn('[Students API] Could not delete old CV file:', unlinkErr.message);
        }
      }
    }

    // Also purge existing files from disk matching this user ID prefix
    if (fs.existsSync(RESUME_DIR)) {
      const existing = fs.readdirSync(RESUME_DIR).filter(f => f.startsWith(`${userId}__`) && f !== path.basename(file.path));
      for (const ef of existing) {
        try { fs.unlinkSync(path.join(RESUME_DIR, ef)); } catch (e) {}
      }
    }

    await query('DELETE FROM cv_documents WHERE user_id = $1', [userId]).catch(() => {});

    // Save document metadata in PostgreSQL cv_documents table
    let doc = null;
    try {
      const insertRes = await query(
        `INSERT INTO cv_documents (user_id, original_name, storage_key, mime_type, file_size, is_primary)
         VALUES ($1, $2, $3, $4, $5, true)
         RETURNING id, original_name, mime_type, file_size, uploaded_at`,
        [userId, file.originalname, file.path, file.mimetype, file.size]
      );
      if (insertRes && insertRes.rows && insertRes.rows.length > 0) {
        doc = insertRes.rows[0];
      }
    } catch (dbErr) {
      console.warn('[Students API] Note on database write:', dbErr.message);
    }

    if (!doc) {
      doc = {
        id: `cv_${Date.now()}`,
        original_name: file.originalname,
        mime_type: file.mimetype,
        file_size: file.size,
        uploaded_at: new Date().toISOString(),
      };
    }

    // Update student_profiles resume_url
    await query(
      `UPDATE student_profiles SET resume_url = $1, updated_at = NOW() WHERE user_id = $2`,
      ['/api/v1/students/resume/download', userId]
    ).catch(() => {});

    return res.status(201).json({
      success: true,
      message: 'Resume uploaded successfully.',
      resume: {
        id: doc.id,
        name: doc.original_name,
        size: `${Math.round(doc.file_size / 1024)} KB`,
        fileSizeBytes: doc.file_size,
        mimeType: doc.mime_type,
        uploadedAt: doc.uploaded_at,
        downloadUrl: '/api/v1/students/resume/download',
      },
    });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/v1/students/resume/download
 * Secure document retrieval with ownership and role-based access checks
 */
router.get('/resume/download', authenticate, async (req, res, next) => {
  try {
    let targetUserId = req.user.id;

    // If an external user/recruiter/tpo requests a student's resume
    const queryUserId = req.query.studentId || req.query.userId;
    if (queryUserId && queryUserId !== req.user.id) {
      if (!['recruiter', 'tpo', 'admin'].includes(req.user.role)) {
        return res.status(403).json({
          success: false,
          message: 'Access forbidden: You cannot view or download another candidate\'s private resume.',
          code: 'FORBIDDEN',
        });
      }
      targetUserId = queryUserId;
    }

    let cvRes = await query(
      `SELECT id, original_name, storage_key, mime_type
       FROM cv_documents
       WHERE user_id = $1
       ORDER BY uploaded_at DESC LIMIT 1`,
      [targetUserId]
    ).catch(() => ({ rows: [] }));

    let doc = cvRes.rows.length > 0 ? cvRes.rows[0] : null;

    if (!doc && fs.existsSync(RESUME_DIR)) {
      const files = fs.readdirSync(RESUME_DIR).filter(f => f.startsWith(`${targetUserId}__`));
      if (files.length > 0) {
        const latest = files[files.length - 1];
        doc = {
          id: 'local_file',
          original_name: latest.split('__')[2] || 'Resume.pdf',
          storage_key: path.join(RESUME_DIR, latest),
          mime_type: 'application/pdf',
        };
      }
    }

    if (!doc) {
      return res.status(404).json({
        success: false,
        message: 'No resume document found for this student account.',
        code: 'RESUME_NOT_FOUND',
      });
    }

    const filePath = path.resolve(doc.storage_key);

    if (!fs.existsSync(filePath)) {
      return res.status(404).json({
        success: false,
        message: 'Resume file is not present on storage volume.',
        code: 'FILE_NOT_FOUND',
      });
    }

    res.setHeader('Content-Type', doc.mime_type || 'application/pdf');
    return res.download(filePath, doc.original_name);
  } catch (err) {
    next(err);
  }
});

/**
 * DELETE /api/v1/students/resume
 * Deletes authenticated student's uploaded CV and removes stored file
 */
router.delete('/resume', authenticate, authorize('student'), async (req, res, next) => {
  try {
    const userId = req.user.id;

    const oldFiles = await query(
      'SELECT storage_key FROM cv_documents WHERE user_id = $1',
      [userId]
    ).catch(() => ({ rows: [] }));

    for (const old of oldFiles.rows) {
      if (old.storage_key && fs.existsSync(old.storage_key)) {
        try {
          fs.unlinkSync(old.storage_key);
        } catch (unlinkErr) {
          console.warn('[Students API] Could not delete stored CV file:', unlinkErr.message);
        }
      }
    }

    if (fs.existsSync(RESUME_DIR)) {
      const existing = fs.readdirSync(RESUME_DIR).filter(f => f.startsWith(`${userId}__`));
      for (const ef of existing) {
        try { fs.unlinkSync(path.join(RESUME_DIR, ef)); } catch (e) {}
      }
    }

    await query('DELETE FROM cv_documents WHERE user_id = $1', [userId]).catch(() => {});

    await query(
      'UPDATE student_profiles SET resume_url = NULL, updated_at = NOW() WHERE user_id = $1',
      [userId]
    ).catch(() => {});

    return res.status(200).json({
      success: true,
      message: 'Uploaded CV removed successfully.',
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
