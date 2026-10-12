/**
 * Campus Inn+ — Application Configuration
 * Loads environment variables and provides typed configuration.
 */
require('dotenv').config();

const config = {
  env: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.PORT, 10) || 3000,

  db: {
    connectionString: process.env.DATABASE_URL || 'postgresql://localhost:5432/campus_inn_db',
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
    max: parseInt(process.env.DB_POOL_MAX, 10) || 20,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 5000,
  },

  jwt: {
    secret: process.env.JWT_SECRET || 'dev-only-insecure-jwt-secret-change-me',
    expiresIn: process.env.JWT_EXPIRES_IN || '24h',
  },

  google: {
    clientId: process.env.GOOGLE_CLIENT_ID || '',
    clientSecret: process.env.GOOGLE_CLIENT_SECRET || '',
    callbackUrl: process.env.GOOGLE_CALLBACK_URL || 'http://localhost:3000/api/v1/auth/google/callback',
  },

  cors: {
    origins: (process.env.CORS_ORIGIN || 'http://localhost:3000')
      .split(',')
      .map(s => s.trim()),
  },

  upload: {
    dir: process.env.UPLOAD_DIR || './uploads',
    maxFileSizeMB: parseInt(process.env.MAX_FILE_SIZE_MB, 10) || 5,
  },

  rateLimit: {
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS, 10) || 15 * 60 * 1000,
    max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS, 10) || 100,
    loginMax: parseInt(process.env.LOGIN_RATE_LIMIT_MAX, 10) || 10,
  },

  cookie: {
    secret: process.env.COOKIE_SECRET || 'dev-only-cookie-secret-change-me',
  },

  isProduction() {
    return this.env === 'production';
  },

  isDevelopment() {
    return this.env === 'development';
  },
};

module.exports = config;
