/**
 * Campus Inn+ — Production Express Server Application
 * Features:
 * - Helmet for HTTP security headers
 * - CORS support
 * - JSON and URL-encoded body parsing
 * - Cookie parser
 * - Rate limiting
 * - Full REST API mounting under /api/v1
 * - Protected portal route guard matching original serve.js behavior
 * - Static file serving of existing HTML, CSS, and JS frontend
 */
const express = require('express');
const path = require('path');
const fs = require('fs');
const helmet = require('helmet');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const rateLimit = require('express-rate-limit');
const jwt = require('jsonwebtoken');

const config = require('./config');
const { errorHandler, notFoundHandler } = require('./middleware/error');

// Import routes
const authRoutes = require('./routes/auth');
const studentRoutes = require('./routes/students');
const eventRoutes = require('./routes/events');
const facultyRoutes = require('./routes/faculty');
const tpoRoutes = require('./routes/tpo');
const recruiterRoutes = require('./routes/recruiter');
const coordinatorRoutes = require('./routes/coordinator');
const adminRoutes = require('./routes/admin');

const app = express();

// Path to separated frontend directory (where static HTML, CSS, JS files live)
const FRONTEND_DIR = fs.existsSync(path.resolve(__dirname, '..', '..', 'frontend'))
  ? path.resolve(__dirname, '..', '..', 'frontend')
  : path.resolve(__dirname, '..', '..');

// 1. Security Headers (configured to allow Tailwind CDN & inline scripts of existing templates)
app.use(
  helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false,
  })
);

// 2. CORS
app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (like mobile apps, curl, or same-origin)
      if (!origin || config.cors.origins.includes(origin) || config.isDevelopment()) {
        callback(null, true);
      } else {
        callback(new Error('Not allowed by CORS'));
      }
    },
    credentials: true,
  })
);

// 3. Body parsers & Cookie parser
app.use(express.json({ limit: '5mb' }));
app.use(express.urlencoded({ extended: true, limit: '5mb' }));
app.use(cookieParser(config.cookie.secret));

// 4. Rate Limiting for Auth routes
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: config.isDevelopment() ? 1000 : config.rateLimit.loginMax,
  message: {
    success: false,
    message: 'Too many authentication attempts. Please try again after 15 minutes.',
    code: 'RATE_LIMIT_EXCEEDED',
  },
  standardHeaders: true,
  legacyHeaders: false,
});
app.use('/api/v1/auth/login', authLimiter);
app.use('/api/v1/auth/register', authLimiter);

// 5. Protected Portals Route Guard (Exact parity with js/serve.js)
const PROTECTED_PORTALS = {
  '/index.html': ['student', 'faculty', 'admin', 'tpo', 'coordinator', 'recruiter'],
  '/student.html': ['student', 'admin'],
  '/faculty.html': ['faculty', 'admin'],
  '/placement.html': ['tpo', 'admin'],
  '/admin.html': ['admin'],
  '/coordinator.html': ['coordinator', 'admin'],
  '/company.html': ['recruiter', 'admin'],
};

const ROLE_DASHBOARDS = {
  student: '/student.html',
  faculty: '/faculty.html',
  tpo: '/placement.html',
  admin: '/admin.html',
  coordinator: '/coordinator.html',
  recruiter: '/company.html',
};

// Root URL ("/") redirect: unauthenticated -> login.html, authenticated -> serve index.html
app.get('/', (req, res) => {
  const token = req.cookies.ci_session;
  if (!token) {
    return res.redirect('/login.html');
  }
  try {
    jwt.verify(token, config.jwt.secret);
    return res.sendFile(path.join(FRONTEND_DIR, 'index.html'));
  } catch (e) {
    return res.redirect('/login.html');
  }
});

// Route guard middleware for HTML portal pages
app.use((req, res, next) => {
  const allowedRoles = PROTECTED_PORTALS[req.path];
  if (!allowedRoles) {
    return next();
  }

  const token = req.cookies.ci_session;
  if (!token) {
    return res.redirect('/login.html');
  }

  try {
    const decoded = jwt.verify(token, config.jwt.secret);
    if (decoded.role === 'admin' || allowedRoles.includes(decoded.role)) {
      return next();
    }
    // Unauthorized for this specific portal, send to their own portal
    return res.redirect(ROLE_DASHBOARDS[decoded.role] || '/login.html');
  } catch (err) {
    return res.redirect('/login.html');
  }
});

// 6. Mount REST API Routes
app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/students', studentRoutes);
app.use('/api/v1/events', eventRoutes);
app.use('/api/v1/faculty', facultyRoutes);
app.use('/api/v1/tpo', tpoRoutes);
app.use('/api/v1/recruiter', recruiterRoutes);
app.use('/api/v1/coordinator', coordinatorRoutes);
app.use('/api/v1/admin', adminRoutes);

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.status(200).json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    env: config.env,
  });
});

// 7. Static file serving for Frontend Assets
app.use(express.static(FRONTEND_DIR, { index: false }));

// 8. 404 & Global Error Handling for APIs
app.use('/api', notFoundHandler);
app.use(errorHandler);

module.exports = app;
