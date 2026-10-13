/**
 * Campus Inn+ — Authentication & Authorization Middleware
 * Verifies JWT tokens from Authorization: Bearer <token> or ci_session cookie.
 * Provides role-based access control (RBAC).
 */
const jwt = require('jsonwebtoken');
const config = require('../config');
const { query } = require('../db/pool');

/**
 * Extract token from request header or cookies
 */
function extractToken(req) {
  const authHeader = req.headers['authorization'];
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return authHeader.substring(7).trim();
  }
  if (req.cookies && req.cookies.ci_session) {
    return req.cookies.ci_session;
  }
  return null;
}

/**
 * Require valid JWT authentication
 */
async function authenticate(req, res, next) {
  const token = extractToken(req);

  if (!token) {
    return res.status(401).json({
      success: false,
      message: 'Authentication required. No token provided.',
      code: 'AUTH_REQUIRED',
    });
  }

  try {
    const decoded = jwt.verify(token, config.jwt.secret);

    // Verify user in database if DB is reachable
    try {
      const result = await query(
        'SELECT id, email, role, status, first_name AS "firstName", last_name AS "lastName", phone, avatar_url AS "avatarUrl", token_version AS "tokenVersion" FROM users WHERE id = $1',
        [decoded.sub || decoded.id]
      );

      if (result.rows.length === 0) {
        return res.status(401).json({
          success: false,
          message: 'Account not found or deleted.',
          code: 'USER_NOT_FOUND',
        });
      }

      const user = result.rows[0];

      // Check token version to invalidate superseded sessions after administrative changes
      const userTokenVersion = user.tokenVersion !== undefined ? user.tokenVersion : user.token_version;
      if (decoded.tokenVersion && userTokenVersion && decoded.tokenVersion < userTokenVersion) {
        return res.status(401).json({
          success: false,
          message: 'Session has been invalidated following administrative role or security updates. Please log in again.',
          code: 'SESSION_REVOKED',
        });
      }

      if (user.status !== 'active') {
        return res.status(403).json({
          success: false,
          message: user.status === 'pending'
            ? 'Your account registration is pending institutional verification or administrator approval.'
            : `Account is ${user.status}. Access denied.`,
          code: user.status === 'pending' ? 'ACCOUNT_PENDING' : 'ACCOUNT_SUSPENDED',
        });
      }

      req.user = user;
    } catch (dbErr) {
      console.warn('[Auth Middleware] Database query warning (running with token payload):', dbErr.message);
      // Database connection error (e.g. ECONNREFUSED)
      // When JWT signature is valid, populate req.user from verified JWT claims rather than kicking user out with 401
      req.user = {
        id: decoded.sub || decoded.id,
        email: decoded.email,
        role: decoded.role,
        status: 'active',
        firstName: decoded.firstName || 'Campus',
        lastName: decoded.lastName || 'User',
      };
    }

    req.token = token;
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({
        success: false,
        message: 'Session expired. Please log in again.',
        code: 'TOKEN_EXPIRED',
      });
    }
    return res.status(401).json({
      success: false,
      message: 'Invalid or malformed authentication token.',
      code: 'TOKEN_INVALID',
    });
  }
}

/**
 * Optional authentication — populates req.user if token is present, does not reject if missing
 */
async function optionalAuth(req, res, next) {
  const token = extractToken(req);
  if (!token) {
    return next();
  }

  try {
    const decoded = jwt.verify(token, config.jwt.secret);
    const result = await query(
      'SELECT id, email, role, status, first_name AS "firstName", last_name AS "lastName", phone, avatar_url AS "avatarUrl" FROM users WHERE id = $1',
      [decoded.sub || decoded.id]
    );
    if (result.rows.length > 0 && result.rows[0].status === 'active') {
      req.user = result.rows[0];
      req.token = token;
    }
  } catch (e) {
    // ignore invalid token in optional auth
  }
  next();
}

/**
 * Role-based authorization middleware factory
 * @param  {...string} allowedRoles - 'student', 'faculty', 'admin', 'tpo', 'coordinator', 'recruiter'
 */
function authorize(...allowedRoles) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required before authorization check.',
        code: 'UNAUTHENTICATED',
      });
    }

    // Admin role automatically has access to all routes unless explicitly restricted
    if (req.user.role === 'admin' || allowedRoles.includes(req.user.role)) {
      return next();
    }

    return res.status(403).json({
      success: false,
      message: `Forbidden: role '${req.user.role}' is not authorized to access this resource. Required: [${allowedRoles.join(', ')}]`,
      code: 'FORBIDDEN',
    });
  };
}

module.exports = {
  extractToken,
  authenticate,
  optionalAuth,
  authorize,
};
