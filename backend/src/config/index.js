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

  frontendUrl: process.env.FRONTEND_URL || (process.env.NODE_ENV === 'production'
    ? 'https://campusinn-frontend-9nxrritaj-pranz.vercel.app'
    : 'http://localhost:5500'),

  email: {
    smtpHost: process.env.SMTP_HOST || '',
    smtpPort: parseInt(process.env.SMTP_PORT, 10) || 587,
    smtpUser: process.env.SMTP_USER || '',
    smtpPass: process.env.SMTP_PASS || '',
    emailFrom: process.env.EMAIL_FROM || 'Campus Inn+ <no-reply@campusinn.edu>',
  },

  google: {
    clientId: process.env.GOOGLE_CLIENT_ID || '',
    clientSecret: process.env.GOOGLE_CLIENT_SECRET || '',
    callbackUrl: process.env.GOOGLE_CALLBACK_URL || (process.env.NODE_ENV === 'production'
      ? 'https://campus-inn-backend.onrender.com/api/v1/auth/google/callback'
      : 'http://localhost:3000/api/v1/auth/google/callback'),
  },

  cors: {
    // Explicit trusted origins from config or environment
    origins: [
      'https://campusinn-frontend-9nxrritaj-pranz.vercel.app',
      'https://campus-inn-backend.onrender.com',
      ...(process.env.FRONTEND_URL ? [process.env.FRONTEND_URL] : []),
      ...(process.env.CORS_ORIGIN ? process.env.CORS_ORIGIN.split(',') : [
        'http://localhost:3000',
        'http://localhost:5500',
        'http://localhost:5173',
        'http://127.0.0.1:3000',
        'http://127.0.0.1:5500',
      ]),
    ]
      .map(s => s.trim().replace(/\/+$/, ''))
      .filter(Boolean),
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
    return (process.env.NODE_ENV || this.env) === 'production';
  },

  isDevelopment() {
    return (process.env.NODE_ENV || this.env) === 'development';
  },

  isAllowedOrigin(origin) {
    if (!origin) return true;
    const cleanOrigin = origin.replace(/\/+$/, '').toLowerCase();

    // 1. Exact match with any configured origin
    const directMatch = this.cors.origins.some(o => o.toLowerCase() === cleanOrigin);
    if (directMatch) return true;

    // 2. Any Vercel deployment of this project
    const isVercelDomain = /^https:\/\/(?:[a-z0-9-]+-)?campusinn(?:-[a-z0-9-]+)?\.vercel\.app$/i.test(cleanOrigin)
      || /^https:\/\/campusinn[a-z0-9-]*\.vercel\.app$/i.test(cleanOrigin)
      || /^https:\/\/campus-inn[a-z0-9-]*\.vercel\.app$/i.test(cleanOrigin);
    if (isVercelDomain) return true;

    // 3. Render backend or onrender domains
    const isRenderDomain = /^https:\/\/(?:[a-z0-9-]+-)?campus-inn-backend\.onrender\.com$/i.test(cleanOrigin);
    if (isRenderDomain) return true;

    // 4. Localhost or loopback in development
    if (!this.isProduction()) {
      const isLocalhost = /^http:\/\/(?:localhost|127\.0\.0\.1)(?::\d+)?$/i.test(cleanOrigin);
      if (isLocalhost) return true;
    }

    return false;
  },
};

module.exports = config;
