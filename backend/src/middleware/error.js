/**
 * Campus Inn+ — Global Error & Not-Found Handlers
 */

function notFoundHandler(req, res, next) {
  res.status(404).json({
    success: false,
    message: `Resource not found: ${req.method} ${req.originalUrl}`,
    code: 'NOT_FOUND',
  });
}

function errorHandler(err, req, res, next) {
  const statusCode = err.status || err.statusCode || 500;

  if (process.env.NODE_ENV !== 'production' || statusCode === 500) {
    console.error(`[Error] ${req.method} ${req.originalUrl}:`, err);
  }

  // Handle CORS origins rejected by policy
  if (err.message === 'Not allowed by CORS' || err.code === 'CORS_NOT_ALLOWED') {
    return res.status(403).json({
      success: false,
      message: 'Not allowed by CORS: Origin is not permitted to access this Campus Inn+ resource.',
      code: 'CORS_NOT_ALLOWED',
    });
  }

  // Handle Database connection offline / refused
  const isDbOffline =
    err.code === 'ECONNREFUSED' ||
    err.code === 'ENOTFOUND' ||
    err.code === 'ETIMEDOUT' ||
    (err.message && (err.message.includes('ECONNREFUSED') || err.message.includes('Connection terminated')));

  if (isDbOffline) {
    return res.status(503).json({
      success: false,
      message: 'PostgreSQL database service is offline or unreachable at configured DATABASE_URL. Ensure database service is running and credentials are valid.',
      code: 'DATABASE_OFFLINE',
    });
  }

  // Handle Multer upload errors
  if (err.code === 'LIMIT_FILE_SIZE') {
    return res.status(400).json({
      success: false,
      message: 'File size exceeds allowed limit (5MB max).',
      code: 'FILE_TOO_LARGE',
    });
  }

  // Handle JSON parse errors
  if (err instanceof SyntaxError && err.status === 400 && 'body' in err) {
    return res.status(400).json({
      success: false,
      message: 'Malformed JSON payload in request body.',
      code: 'BAD_REQUEST',
    });
  }

  // Handle PostgreSQL unique constraint violations (code 23505)
  if (err.code === '23505') {
    const detail = `${err.constraint || ''} ${err.detail || ''} ${err.message || ''}`.toLowerCase();
    let message = 'A record with these unique details already exists.';
    let code = 'DUPLICATE_RECORD';
    if (detail.includes('roll')) {
      message = 'A student account with this roll number already exists. Please sign in or verify your roll number.';
      code = 'DUPLICATE_ROLL_NUMBER';
    } else if (detail.includes('email')) {
      message = 'An account with this email address already exists. Please sign in or use a different email.';
      code = 'DUPLICATE_EMAIL';
    } else if (detail.includes('employee_id')) {
      message = 'A faculty member with this employee ID already exists.';
      code = 'DUPLICATE_EMPLOYEE_ID';
    } else if (detail.includes('username')) {
      message = 'An account with this username or identifier already exists.';
      code = 'DUPLICATE_USERNAME';
    }
    return res.status(409).json({
      success: false,
      message,
      code,
    });
  }

  res.status(statusCode).json({
    success: false,
    message: err.message || 'Internal server error occurred.',
    code: err.code || (statusCode === 500 ? 'INTERNAL_SERVER_ERROR' : 'ERROR'),
    ...(process.env.NODE_ENV === 'development' ? { stack: err.stack } : {}),
  });
}

module.exports = {
  notFoundHandler,
  errorHandler,
};
