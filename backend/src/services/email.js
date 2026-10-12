/**
 * Campus Inn+ — Secure Email Delivery Service
 * Manages SMTP email dispatch for password recovery and notifications.
 */
const nodemailer = require('nodemailer');
const config = require('../config');

/**
 * Check if SMTP credentials and host are fully configured
 * @returns {boolean}
 */
function isConfigured() {
  const { smtpHost, smtpUser, smtpPass } = config.email;
  return Boolean(
    smtpHost &&
    smtpHost.trim() &&
    smtpUser &&
    smtpUser.trim() &&
    smtpPass &&
    smtpPass.trim()
  );
}

/**
 * Mask email address for safe audit logging
 * Example: "priya.sharma@example.com" -> "pr***@example.com"
 */
function maskEmail(email) {
  if (!email || typeof email !== 'string') return 'unknown';
  const parts = email.split('@');
  if (parts.length !== 2) return '***';
  const local = parts[0];
  const domain = parts[1];
  const visible = local.length > 2 ? local.slice(0, 2) : local.slice(0, 1);
  return `${visible}***@${domain}`;
}

/**
 * Create a reusable nodemailer transport using verified config
 */
function createTransport() {
  if (!isConfigured()) {
    const err = new Error('SMTP service is not configured. Missing SMTP_HOST, SMTP_USER, or SMTP_PASS.');
    err.code = 'SMTP_NOT_CONFIGURED';
    throw err;
  }

  return nodemailer.createTransport({
    host: config.email.smtpHost,
    port: config.email.smtpPort,
    secure: config.email.smtpPort === 465, // true for port 465, false for 587/25
    auth: {
      user: config.email.smtpUser,
      pass: config.email.smtpPass,
    },
    connectionTimeout: 10000,
    greetingTimeout: 10000,
    socketTimeout: 15000,
  });
}

/**
 * Send Password Reset Email with Campus Inn+ branding and security headers
 *
 * @param {Object} options
 * @param {string} options.to - Recipient email address
 * @param {string} [options.firstName] - Recipient's first name
 * @param {string} options.resetUrl - Secure password reset link
 * @param {number} [options.expiresInMinutes=15] - Token lifetime in minutes
 * @returns {Promise<Object>} Delivery report
 */
async function sendPasswordResetEmail({ to, firstName, resetUrl, expiresInMinutes = 15 }) {
  if (!to) {
    const err = new Error('Recipient email is required.');
    err.code = 'INVALID_RECIPIENT';
    throw err;
  }

  if (!resetUrl) {
    const err = new Error('Password reset URL is required.');
    err.code = 'INVALID_RESET_URL';
    throw err;
  }

  const recipientName = (firstName || 'Campus Inn+ User').trim();
  const transporter = createTransport();

  const htmlBody = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Reset Your Campus Inn+ Password</title>
</head>
<body style="margin: 0; padding: 0; background-color: #faf8ff; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #131b2e;">
  <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color: #faf8ff; padding: 40px 10px;">
    <tr>
      <td align="center">
        <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="max-width: 560px; background-color: #ffffff; border-radius: 16px; border: 1px solid #dae2fd; box-shadow: 0 4px 20px rgba(83,0,183,0.06); overflow: hidden;">
          <!-- Header Banner -->
          <tr>
            <td style="background-color: #5300b7; padding: 32px 36px; text-align: left;">
              <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%">
                <tr>
                  <td>
                    <div style="display: inline-block; font-size: 22px; font-weight: 800; color: #ffffff; letter-spacing: -0.5px;">
                      CAMPUS INN<span style="color: #ebddff;">+</span>
                    </div>
                    <div style="font-size: 11px; text-transform: uppercase; color: #dac5ff; letter-spacing: 1.5px; margin-top: 4px; font-weight: 600;">
                      Connect. Manage. Grow.
                    </div>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Main Content -->
          <tr>
            <td style="padding: 36px 36px 28px 36px;">
              <h1 style="margin: 0 0 16px 0; font-size: 22px; font-weight: 700; color: #131b2e; letter-spacing: -0.3px;">
                Password Reset Request
              </h1>
              <p style="margin: 0 0 18px 0; font-size: 15px; line-height: 1.6; color: #4a4455;">
                Hello <strong>${recipientName}</strong>,
              </p>
              <p style="margin: 0 0 24px 0; font-size: 15px; line-height: 1.6; color: #4a4455;">
                We received a request to reset your password for your <strong>Campus Inn+</strong> collegiate account. Click the button below to choose a new password:
              </p>

              <!-- CTA Button -->
              <table role="presentation" border="0" cellpadding="0" cellspacing="0" style="margin: 28px 0;">
                <tr>
                  <td align="center" style="border-radius: 10px; background-color: #5300b7;">
                    <a href="${resetUrl}" target="_blank" style="display: inline-block; padding: 14px 32px; font-size: 15px; font-weight: 700; color: #ffffff; text-decoration: none; border-radius: 10px; background-color: #5300b7;">
                      Reset Password
                    </a>
                  </td>
                </tr>
              </table>

              <!-- Expiry Alert -->
              <div style="background-color: #f2f3ff; border-left: 4px solid #5300b7; padding: 14px 16px; border-radius: 6px; margin: 24px 0;">
                <p style="margin: 0; font-size: 13px; line-height: 1.5; color: #131b2e;">
                  ⏱ <strong>Security Notice:</strong> This single-use link is valid for <strong>${expiresInMinutes} minutes</strong> only. Once used or expired, a new request will be required.
                </p>
              </div>

              <!-- Fallback Direct Link -->
              <p style="margin: 20px 0 0 0; font-size: 12px; line-height: 1.5; color: #7b7486;">
                If the button above does not work, copy and paste this link into your browser:
              </p>
              <p style="margin: 6px 0 20px 0; font-size: 12px; line-height: 1.4; word-break: break-all;">
                <a href="${resetUrl}" style="color: #5300b7; text-decoration: underline;">${resetUrl}</a>
              </p>

              <!-- Safety Notice -->
              <div style="border-top: 1px solid #eaedff; padding-top: 20px; margin-top: 28px;">
                <p style="margin: 0; font-size: 13px; line-height: 1.5; color: #5e5c6e;">
                  If you did not request this password reset, you can safely ignore this email. Your current password remains secure and unchanged.
                </p>
              </div>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background-color: #eaedff; padding: 20px 36px; text-align: center; border-top: 1px solid #dae2fd;">
              <p style="margin: 0 0 6px 0; font-size: 12px; color: #7b7486;">
                Campus Inn+ Unified Academic & Placement Ecosystem
              </p>
              <p style="margin: 0; font-size: 11px; color: #7b7486;">
                MET Bhujbal Knowledge City, Adgaon, Nashik • Maharashtra 422003
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `.trim();

  const textBody = `
Campus Inn+ — Password Reset Request

Hello ${recipientName},

We received a request to reset your password for your Campus Inn+ collegiate account.

Please use the link below to choose a new password:
${resetUrl}

This link is valid for ${expiresInMinutes} minutes and can only be used once.

If you did not request a password reset, you can safely ignore this email. Your password remains unchanged.

Campus Inn+ • Connect. Manage. Grow.
  `.trim();

  try {
    const info = await transporter.sendMail({
      from: config.email.emailFrom,
      to,
      subject: 'Reset your Campus Inn+ password',
      text: textBody,
      html: htmlBody,
    });

    console.log(`[Email Service] Password reset email sent to ${maskEmail(to)} (messageId: ${info.messageId})`);
    return { success: true, messageId: info.messageId };
  } catch (err) {
    console.error(`[Email Service] Delivery failure to ${maskEmail(to)}:`, err.message);
    const deliveryErr = new Error('Email delivery failed.');
    deliveryErr.code = 'SMTP_DELIVERY_FAILED';
    deliveryErr.originalMessage = err.message;
    throw deliveryErr;
  }
}

module.exports = {
  isConfigured,
  maskEmail,
  sendPasswordResetEmail,
};
