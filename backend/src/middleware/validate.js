/**
 * Campus Inn+ — Input Validation Middleware & Helpers
 */
const validator = require('validator');

function validateEmail(email) {
  return typeof email === 'string' && validator.isEmail(email.trim());
}

function sanitizeString(str) {
  if (typeof str !== 'string') return '';
  return str.trim();
}

/**
 * Validate Student Registration Payload
 */
function validateStudentRegister(req, res, next) {
  const {
    fullName,
    email,
    password,
    phone,
    rollNumber,
    department,
    academicYear,
    semester,
  } = req.body;

  const errors = [];

  if (!fullName || typeof fullName !== 'string' || fullName.trim().length < 2) {
    errors.push('Full name must be at least 2 characters.');
  }

  if (!email || !validateEmail(email)) {
    errors.push('A valid email address is required.');
  }

  if (!password || typeof password !== 'string' || password.length < 6) {
    errors.push('Password must be at least 6 characters.');
  }

  if (errors.length > 0) {
    return res.status(400).json({
      success: false,
      message: errors.join(' '),
      errors,
    });
  }

  next();
}

/**
 * Validate Login Payload
 */
function validateLogin(req, res, next) {
  const { identifier, password } = req.body;

  if (!identifier || typeof identifier !== 'string' || !identifier.trim()) {
    return res.status(400).json({
      success: false,
      message: 'Identifier (email or roll number) is required.',
    });
  }

  if (!password || typeof password !== 'string' || !password) {
    return res.status(400).json({
      success: false,
      message: 'Password is required.',
    });
  }

  next();
}

/**
 * Validate Forgot Password Payload
 */
function validateForgotPassword(req, res, next) {
  const { email } = req.body || {};

  if (!email || typeof email !== 'string' || !validateEmail(email)) {
    return res.status(400).json({
      success: false,
      message: 'A valid email address is required.',
      code: 'INVALID_EMAIL',
    });
  }

  next();
}

/**
 * Validate Reset Password Payload
 */
function validateResetPassword(req, res, next) {
  const { token, newPassword, confirmPassword } = req.body || {};

  if (!token || typeof token !== 'string' || token.trim().length < 16) {
    return res.status(400).json({
      success: false,
      message: 'A valid password reset token is required.',
      code: 'INVALID_TOKEN',
    });
  }

  if (!newPassword || typeof newPassword !== 'string' || newPassword.length < 8) {
    return res.status(400).json({
      success: false,
      message: 'New password must be at least 8 characters long.',
      code: 'WEAK_PASSWORD',
    });
  }

  const hasLetter = /[a-zA-Z]/.test(newPassword);
  const hasNumber = /[0-9]/.test(newPassword);
  if (!hasLetter || !hasNumber) {
    return res.status(400).json({
      success: false,
      message: 'Password must contain at least one letter and one number.',
      code: 'WEAK_PASSWORD',
    });
  }

  if (newPassword !== confirmPassword) {
    return res.status(400).json({
      success: false,
      message: 'Passwords do not match.',
      code: 'PASSWORD_MISMATCH',
    });
  }

  next();
}

module.exports = {
  validateEmail,
  sanitizeString,
  validateStudentRegister,
  validateLogin,
  validateForgotPassword,
  validateResetPassword,
};

