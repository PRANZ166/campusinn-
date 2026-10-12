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
  const { identifier, password, role } = req.body;

  if (!identifier || typeof identifier !== 'string' || !identifier.trim()) {
    return res.status(400).json({
      success: false,
      message: 'Identifier (email, roll number, or institutional ID) is required.',
      code: 'MISSING_IDENTIFIER',
    });
  }

  if (!password || typeof password !== 'string' || !password) {
    return res.status(400).json({
      success: false,
      message: 'Password is required.',
      code: 'MISSING_PASSWORD',
    });
  }

  if (role && (typeof role !== 'string' || !['student', 'faculty', 'admin', 'tpo', 'coordinator', 'recruiter'].includes(role.trim().toLowerCase()))) {
    return res.status(400).json({
      success: false,
      message: 'Invalid role specified.',
      code: 'INVALID_ROLE',
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

/**
 * Validate Faculty Self-Registration Payload
 */
function validateFacultyRegister(req, res, next) {
  const {
    fullName,
    email,
    password,
    employeeId,
    department,
  } = req.body || {};

  const errors = [];

  if (!fullName || typeof fullName !== 'string' || fullName.trim().length < 2) {
    errors.push('Full name must be at least 2 characters.');
  }

  if (!email || !validateEmail(email)) {
    errors.push('A valid institutional email address is required.');
  } else {
    const cleanEmail = email.trim().toLowerCase();
    const isInstitutional = /@(?:[a-zA-Z0-9-]+\.)*(?:met\.edu|campus\.edu\.in|edu\.in|ac\.in|edu)$/i.test(cleanEmail);
    if (!isInstitutional) {
      return res.status(400).json({
        success: false,
        message: 'Faculty registration requires an accredited institutional email address (e.g., @met.edu, @campus.edu.in).',
        code: 'INVALID_INSTITUTIONAL_EMAIL',
      });
    }
  }

  if (!password || typeof password !== 'string' || password.length < 8) {
    errors.push('Password must be at least 8 characters long.');
  } else {
    const hasLetter = /[a-zA-Z]/.test(password);
    const hasNumber = /[0-9]/.test(password);
    if (!hasLetter || !hasNumber) {
      errors.push('Password must contain at least one letter and one number.');
    }
  }

  if (!employeeId || typeof employeeId !== 'string' || employeeId.trim().length < 2) {
    errors.push('Institutional Employee ID is required.');
  }

  if (!department || typeof department !== 'string' || department.trim().length < 2) {
    errors.push('Academic Department is required.');
  }

  if (errors.length > 0) {
    return res.status(400).json({
      success: false,
      message: errors.join(' '),
      code: 'VALIDATION_FAILED',
      errors,
    });
  }

  next();
}

/**
 * Validate Admin Provisioning of Faculty Payload
 */
function validateAdminFacultyRegister(req, res, next) {
  const { email, password, firstName, fullName } = req.body || {};
  const errors = [];

  if (!email || !validateEmail(email)) {
    errors.push('A valid email address is required.');
  }

  if (!password || typeof password !== 'string' || password.length < 8) {
    errors.push('Password must be at least 8 characters long.');
  }

  const hasName = (firstName && firstName.trim()) || (fullName && fullName.trim());
  if (!hasName) {
    errors.push('Faculty name is required.');
  }

  if (errors.length > 0) {
    return res.status(400).json({
      success: false,
      message: errors.join(' '),
      code: 'VALIDATION_FAILED',
      errors,
    });
  }

  next();
}

module.exports = {
  validateEmail,
  sanitizeString,
  validateStudentRegister,
  validateFacultyRegister,
  validateAdminFacultyRegister,
  validateLogin,
  validateForgotPassword,
  validateResetPassword,
};

