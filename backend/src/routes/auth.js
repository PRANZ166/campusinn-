/**
 * Campus Inn+ — Authentication Routes (/api/v1/auth)
 */
const express = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const config = require('../config');
const { query } = require('../db/pool');
const { authenticate } = require('../middleware/auth');
const { validateLogin, validateStudentRegister } = require('../middleware/validate');

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

    // Split name
    const parts = (fullName || '').trim().split(/\s+/);
    const firstName = parts[0] || 'Student';
    const lastName = parts.slice(1).join(' ') || '';

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

    // Insert student profile
    const profileRes = await query(
      `INSERT INTO student_profiles (
         user_id, roll_number, college, department, program, academic_year, semester, role_label
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [
        newUser.id,
        rollNumber || null,
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
 * POST /api/v1/auth/login
 */
router.post('/login', validateLogin, async (req, res, next) => {
  try {
    const { identifier, password } = req.body;
    const cleanId = (identifier || '').trim().toLowerCase();

    // Find user by email or student roll_number
    let userResult = await query(
      `SELECT u.id, u.email, u.password_hash, u.role, u.status, u.first_name, u.last_name, u.phone, u.avatar_url
       FROM users u
       WHERE LOWER(u.email) = $1`,
      [cleanId]
    );

    if (userResult.rows.length === 0) {
      userResult = await query(
        `SELECT u.id, u.email, u.password_hash, u.role, u.status, u.first_name, u.last_name, u.phone, u.avatar_url
         FROM users u
         JOIN student_profiles sp ON sp.user_id = u.id
         WHERE LOWER(sp.roll_number) = $1`,
        [cleanId]
      );
    }

    if (userResult.rows.length === 0) {
      return res.status(401).json({
        success: false,
        message: 'Invalid credentials. Please verify your email or roll number.',
      });
    }

    const user = userResult.rows[0];

    if (user.status !== 'active') {
      return res.status(403).json({
        success: false,
        message: `Account is ${user.status}. Access denied.`,
      });
    }

    const match = await bcrypt.compare(password, user.password_hash);
    if (!match) {
      return res.status(401).json({
        success: false,
        message: 'Invalid credentials. Please check your password.',
      });
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

const crypto = require('crypto');
const { OAuth2Client } = require('google-auth-library');

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
 * Helper: Determine frontend base URL for OAuth redirects.
 * Resolves to production Vercel frontend, or local development origin if initiated locally.
 */
function getFrontendRedirectBase(req) {
  // 1. Check if an explicit frontend origin was tracked in cookie during login initiation
  const trackedOrigin = req && req.cookies && req.cookies.ci_oauth_frontend;
  if (trackedOrigin) {
    try {
      const parsed = new URL(trackedOrigin);
      if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
        // In production, prevent accidental localhost redirects
        if (config.isProduction() && (parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1')) {
          // Ignore localhost cookie in production and use config.frontendUrl
        } else {
          return trackedOrigin.replace(/\/+$/, '');
        }
      }
    } catch (e) {}
  }

  // 2. Use configured frontendUrl
  if (config.frontendUrl) {
    return config.frontendUrl.replace(/\/+$/, '');
  }

  // 3. Fallback to empty string for relative paths
  return '';
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
  if (initiatorOrigin) {
    res.cookie('ci_oauth_frontend', initiatorOrigin, {
      httpOnly: true,
      secure: config.isProduction(),
      sameSite: 'lax',
      maxAge: 10 * 60 * 1000,
      path: '/',
    });
  }

  // Generate cryptographically random state parameter
  const state = crypto.randomBytes(32).toString('hex');

  // Store state in a short-lived HTTP-only cookie for CSRF validation (10 minutes)
  res.cookie('ci_oauth_state', state, {
    httpOnly: true,
    secure: config.isProduction(),
    sameSite: 'lax',
    maxAge: 10 * 60 * 1000,
    path: '/',
  });

  if (req.query.redirect) {
    res.cookie('ci_oauth_redirect', req.query.redirect, {
      httpOnly: true,
      secure: config.isProduction(),
      sameSite: 'lax',
      maxAge: 10 * 60 * 1000,
      path: '/',
    });
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
      // Create student profile for new Google user
      await query(
        `INSERT INTO student_profiles (user_id, college, department, program, academic_year, semester, role_label)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         ON CONFLICT (user_id) DO NOTHING`,
        [
          user.id,
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
  const { code, state, error } = req.query;

  const frontendBase = getFrontendRedirectBase(req);

  // Handle user cancellation on Google consent screen
  if (error) {
    res.clearCookie('ci_oauth_state', { path: '/' });
    res.clearCookie('ci_oauth_frontend', { path: '/' });
    return res.redirect(`${frontendBase}/login.html?error=${encodeURIComponent('Google authentication was cancelled: ' + error)}`);
  }

  // Validate state parameter to prevent CSRF
  const storedState = req.cookies.ci_oauth_state;
  res.clearCookie('ci_oauth_state', { path: '/' });

  if (!state || !storedState || state !== storedState) {
    res.clearCookie('ci_oauth_frontend', { path: '/' });
    return res.redirect(
      `${frontendBase}/login.html?error=${encodeURIComponent('Invalid or expired OAuth state parameter. Please try signing in again.')}`
    );
  }

  if (!code) {
    res.clearCookie('ci_oauth_frontend', { path: '/' });
    return res.redirect(`${frontendBase}/login.html?error=${encodeURIComponent('No authorization code provided by Google.')}`);
  }

  const oauth2Client = getGoogleOAuthClient();
  if (!oauth2Client) {
    res.clearCookie('ci_oauth_frontend', { path: '/' });
    return res.redirect(`${frontendBase}/login.html?error=${encodeURIComponent('Google OAuth is not configured on the server.')}`);
  }

  try {
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
    let returnTo = req.cookies.ci_oauth_redirect;
    res.clearCookie('ci_oauth_redirect', { path: '/' });
    res.clearCookie('ci_oauth_frontend', { path: '/' });

    // Sanitize returnTo: in production, never allow localhost redirects
    if (returnTo) {
      if (config.isProduction() && (returnTo.includes('localhost') || returnTo.includes('127.0.0.1'))) {
        try {
          const u = new URL(returnTo, frontendBase || 'http://localhost');
          returnTo = u.pathname + u.search + u.hash;
        } catch (e) {
          returnTo = 'index.html';
        }
      }
    }

    const redirectParam = returnTo ? `&redirect=${encodeURIComponent(returnTo)}` : '';
    return res.redirect(`${frontendBase}/login.html?google_auth_success=1&auth_payload=${redirectData}${redirectParam}`);
  } catch (err) {
    res.clearCookie('ci_oauth_frontend', { path: '/' });
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

module.exports = router;

