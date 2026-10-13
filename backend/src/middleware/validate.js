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
 * Unify, trim and validate full name according to universal contract.
 * Accepts legitimate names containing spaces, hyphens, apostrophes, dots, and unicode/international letters.
 * Rejects empty names and names shorter than 2 characters after trimming.
 * Never silently fabricates or hardcodes fallback names.
 */
function resolveAndValidateFullName(rawInput, roleLabel = 'Full name') {
  const { fullName, name, recruiterName, firstName, lastName } = rawInput || {};
  let resolved = '';
  if (typeof fullName === 'string' && fullName.trim()) {
    resolved = fullName.trim();
  } else if (typeof recruiterName === 'string' && recruiterName.trim()) {
    resolved = recruiterName.trim();
  } else if (typeof name === 'string' && name.trim()) {
    resolved = name.trim();
  } else if (firstName && typeof firstName === 'string') {
    resolved = `${firstName.trim()} ${typeof lastName === 'string' ? lastName.trim() : ''}`.trim();
  }

  if (!resolved || resolved.length < 2) {
    return { valid: false, error: `${roleLabel} must be at least 2 characters.` };
  }

  // Accept legitimate names with letters (including unicode \p{L}), spaces, dots, hyphens, apostrophes
  const NAME_PATTERN = /^[\p{L}\p{M}][\p{L}\p{M}\s.'’\-]*[\p{L}\p{M}.]?$/u;
  if (!NAME_PATTERN.test(resolved)) {
    return { valid: false, error: `${roleLabel} must contain valid letters, spaces, hyphens, or apostrophes only.` };
  }

  const parts = resolved.split(/\s+/);
  return {
    valid: true,
    fullName: resolved,
    firstName: parts[0] || '',
    lastName: parts.slice(1).join(' ') || '',
  };
}

/**
 * Validate Student Registration Payload
 */
function validateStudentRegister(req, res, next) {
  const {
    email,
    password,
    phone,
    rollNumber,
    department,
    academicYear,
    semester,
  } = req.body || {};

  const errors = [];

  const nameCheck = resolveAndValidateFullName(req.body, 'Full name');
  if (!nameCheck.valid) {
    errors.push(nameCheck.error);
  } else {
    req.body.fullName = nameCheck.fullName;
    req.body.firstName = nameCheck.firstName;
    req.body.lastName = nameCheck.lastName;
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

  const nameCheck = resolveAndValidateFullName(req.body, 'Full name');
  if (!nameCheck.valid) {
    errors.push(nameCheck.error);
  } else {
    req.body.fullName = nameCheck.fullName;
    req.body.firstName = nameCheck.firstName;
    req.body.lastName = nameCheck.lastName;
  }

  if (!email || !validateEmail(email)) {
    errors.push('A valid email address is required.');
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

/**
 * Validate Event/Club Coordinator Registration Payload
 */
function validateCoordinatorRegister(req, res, next) {
  const {
    fullName,
    email,
    password,
    department,
    clubName,
  } = req.body || {};

  const errors = [];

  const nameCheck = resolveAndValidateFullName(req.body, 'Full name');
  if (!nameCheck.valid) {
    errors.push(nameCheck.error);
  } else {
    req.body.fullName = nameCheck.fullName;
    req.body.firstName = nameCheck.firstName;
    req.body.lastName = nameCheck.lastName;
  }

  if (!email || !validateEmail(email)) {
    errors.push('A valid email address is required.');
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
 * Validate Company/HR Recruiter Registration Payload
 */
function validateRecruiterRegister(req, res, next) {
  const {
    fullName,
    recruiterName,
    email,
    password,
    companyName,
    designation,
  } = req.body || {};

  const errors = [];
  const nameCheck = resolveAndValidateFullName(req.body, 'Recruiter name');
  if (!nameCheck.valid) {
    errors.push(nameCheck.error);
  } else {
    req.body.fullName = nameCheck.fullName;
    req.body.firstName = nameCheck.firstName;
    req.body.lastName = nameCheck.lastName;
  }

  if (!email || !validateEmail(email)) {
    errors.push('A valid corporate work email address is required.');
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

  if (!companyName || typeof companyName !== 'string' || companyName.trim().length < 2) {
    errors.push('Company name is required.');
  }

  if (!designation || typeof designation !== 'string' || designation.trim().length < 2) {
    errors.push('Designation / Job title is required.');
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
  validateCoordinatorRegister,
  validateRecruiterRegister,
  validateLogin,
  validateForgotPassword,
  validateResetPassword,
};


