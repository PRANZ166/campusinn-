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

  // Handle Database connection offline / refused
  if (err.code === 'ECONNREFUSED' || (err.message && err.message.includes('ECONNREFUSED'))) {
    return res.status(503).json({
      success: false,
      message: 'PostgreSQL database service is offline or unreachable at the configured DATABASE_URL (localhost:5432). Start the PostgreSQL service or update credentials in .env to restore database features.',
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
