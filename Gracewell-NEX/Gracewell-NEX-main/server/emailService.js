const nodemailer = require('nodemailer');

/**
 * Email Service using Nodemailer
 * Supports Gmail, Outlook, custom SMTP, and development console logging
 */

// Determine transport configuration
const createConsoleTransport = () => ({
  __transportMode: 'console',
  sendMail: async (mailOptions) => {
    console.log('\n========== EMAIL (DEV MODE) ==========');
    console.log('To:', mailOptions.to);
    console.log('Subject:', mailOptions.subject);
    console.log('---');
    console.log(mailOptions.html || mailOptions.text);
    console.log('=====================================\n');
    return { accepted: [mailOptions.to], messageId: `console-${Date.now()}` };
  }
});

const getTransporter = () => {
  const emailService = (process.env.EMAIL_SERVICE || '').toLowerCase();
  const emailUser = process.env.EMAIL_USER;
  const emailPassword = process.env.EMAIL_PASSWORD;
  const smtpHost = process.env.SMTP_HOST;
  const smtpPort = process.env.SMTP_PORT;
  const smtpSecure = process.env.SMTP_SECURE === 'true';

  // Development mode: log to console only
  if (process.env.NODE_ENV !== 'production' && !emailUser && !smtpHost) {
    console.log('[EMAIL_SERVICE] Running in development mode - emails will be logged to console');
    return createConsoleTransport();
  }

  // Custom SMTP configuration (takes precedence)
  if (smtpHost && smtpPort) {
    console.log(`[EMAIL_SERVICE] Configuring custom SMTP: ${smtpHost}:${smtpPort}`);
    return nodemailer.createTransport({
      host: smtpHost,
      port: parseInt(smtpPort),
      secure: smtpSecure,
      auth: emailUser && emailPassword ? {
        user: emailUser,
        pass: emailPassword
      } : undefined
    });
  }

  // Gmail configuration
  if (emailService === 'gmail' && emailUser && emailPassword) {
    console.log('[EMAIL_SERVICE] Configuring Gmail SMTP');
    return nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: emailUser,
        pass: emailPassword // Use App Password from Gmail
      }
    });
  }

  // Outlook/Office365 configuration
  if (emailService === 'outlook' && emailUser && emailPassword) {
    console.log('[EMAIL_SERVICE] Configuring Outlook SMTP');
    return nodemailer.createTransport({
      host: 'smtp.office365.com',
      port: 587,
      secure: false,
      auth: {
        user: emailUser,
        pass: emailPassword
      }
    });
  }

  // Sendgrid configuration
  if (emailService === 'sendgrid' && emailPassword) {
    console.log('[EMAIL_SERVICE] Configuring SendGrid SMTP');
    return nodemailer.createTransport({
      host: 'smtp.sendgrid.net',
      port: 587,
      secure: false,
      auth: {
        user: 'apikey',
        pass: emailPassword
      }
    });
  }

  // Default: development console transport
  console.warn('[EMAIL_SERVICE] No email service configured, using console logging');
  return createConsoleTransport();
};

const transporter = getTransporter();
const isRealEmailConfigured = () => transporter.__transportMode !== 'console';

/**
 * Send password reset email
 * @param {string} email - Recipient email
 * @param {string} resetToken - Reset token or link
 * @param {string} resetLink - Full reset link URL
 */
const sendPasswordResetEmail = async (email, resetToken, resetLink) => {
  try {
    const mailOptions = {
      from: process.env.EMAIL_FROM || process.env.EMAIL_USER || 'noreply@gracewell.com',
      to: email,
      subject: 'Gracewell NEXUS - Password Reset Request',
      html: `
        <h2>Password Reset Request</h2>
        <p>You requested to reset your password for your Gracewell NEXUS account.</p>
        <p>Click the button below to reset your password:</p>
        <a href="${resetLink}" style="background-color: #007bff; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px; display: inline-block;">
          Reset Password
        </a>
        <p>Or copy this link:</p>
        <p><code>${resetLink}</code></p>
        <p>This link expires in 1 hour.</p>
        <p>If you didn't request a password reset, you can ignore this email.</p>
        <hr/>
        <small>Gracewell NEXUS Attendance System</small>
      `,
      text: `
Password Reset Request

You requested to reset your password for your Gracewell NEXUS account.

Reset Password: ${resetLink}

This link expires in 1 hour.

If you didn't request a password reset, you can ignore this email.

Gracewell NEXUS Attendance System
      `
    };

    const result = await transporter.sendMail(mailOptions);
    console.log('[EMAIL_SERVICE] Password reset email sent to:', email);
    return {
      success: true,
      delivered: isRealEmailConfigured(),
      mode: isRealEmailConfigured() ? 'smtp' : 'console',
      messageId: result.messageId
    };
  } catch (error) {
    console.error('[EMAIL_SERVICE] Failed to send password reset email:', error);
    return { success: false, error: error.message };
  }
};

/**
 * Send email verification email
 * @param {string} email - Recipient email
 * @param {string} verificationLink - Full verification link URL
 * @param {string} employeeName - Employee name for personalization
 */
const sendEmailVerificationEmail = async (email, verificationLink, employeeName = 'User') => {
  try {
    const mailOptions = {
      from: process.env.EMAIL_FROM || process.env.EMAIL_USER || 'noreply@gracewell.com',
      to: email,
      subject: 'Gracewell NEXUS - Verify Your Email',
      html: `
        <h2>Email Verification Required</h2>
        <p>Hello ${employeeName},</p>
        <p>Welcome to Gracewell NEXUS! Please verify your email address to activate your account.</p>
        <p>Click the button below to verify your email:</p>
        <a href="${verificationLink}" style="background-color: #28a745; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px; display: inline-block;">
          Verify Email
        </a>
        <p>Or copy this link:</p>
        <p><code>${verificationLink}</code></p>
        <p>This link expires in 24 hours.</p>
        <hr/>
        <small>Gracewell NEXUS Attendance System</small>
      `,
      text: `
Email Verification Required

Hello ${employeeName},

Welcome to Gracewell NEXUS! Please verify your email address to activate your account.

Verify Email: ${verificationLink}

This link expires in 24 hours.

Gracewell NEXUS Attendance System
      `
    };

    const result = await transporter.sendMail(mailOptions);
    console.log('[EMAIL_SERVICE] Verification email sent to:', email);
    return {
      success: true,
      delivered: isRealEmailConfigured(),
      mode: isRealEmailConfigured() ? 'smtp' : 'console',
      messageId: result.messageId
    };
  } catch (error) {
    console.error('[EMAIL_SERVICE] Failed to send verification email:', error);
    return { success: false, error: error.message };
  }
};

/**
 * Send generic email
 * @param {string} to - Recipient email
 * @param {string} subject - Email subject
 * @param {string} htmlContent - HTML email content
 * @param {string} textContent - Plain text email content (optional)
 */
const sendEmail = async (to, subject, htmlContent, textContent = null) => {
  try {
    const mailOptions = {
      from: process.env.EMAIL_FROM || process.env.EMAIL_USER || 'noreply@gracewell.com',
      to,
      subject,
      html: htmlContent,
      text: textContent || htmlContent.replace(/<[^>]*>/g, '')
    };

    const result = await transporter.sendMail(mailOptions);
    console.log('[EMAIL_SERVICE] Email sent to:', to);
    return {
      success: true,
      delivered: isRealEmailConfigured(),
      mode: isRealEmailConfigured() ? 'smtp' : 'console',
      messageId: result.messageId
    };
  } catch (error) {
    console.error('[EMAIL_SERVICE] Failed to send email:', error);
    return { success: false, error: error.message };
  }
};

/**
 * Send OTP via email
 * @param {string} email - Recipient email
 * @param {string} otp - One-time password code
 * @param {number} expiryMinutes - OTP expiry time in minutes
 */
const sendOTPEmail = async (email, otp, expiryMinutes = 10) => {
  try {
    const mailOptions = {
      from: process.env.EMAIL_FROM || process.env.EMAIL_USER || 'noreply@gracewell.com',
      to: email,
      subject: 'Gracewell NEXUS - Your One-Time Password',
      html: `
        <h2>One-Time Password (OTP)</h2>
        <p>Your OTP code is:</p>
        <h1 style="font-size: 32px; letter-spacing: 5px; margin: 20px 0;">${otp}</h1>
        <p>This code expires in ${expiryMinutes} minutes.</p>
        <p>Do not share this code with anyone.</p>
        <hr/>
        <small>Gracewell NEXUS Attendance System</small>
      `,
      text: `
One-Time Password (OTP)

Your OTP code is: ${otp}

This code expires in ${expiryMinutes} minutes.

Do not share this code with anyone.

Gracewell NEXUS Attendance System
      `
    };

    const result = await transporter.sendMail(mailOptions);
    console.log('[EMAIL_SERVICE] OTP sent to:', email);
    return {
      success: true,
      delivered: isRealEmailConfigured(),
      mode: isRealEmailConfigured() ? 'smtp' : 'console',
      messageId: result.messageId
    };
  } catch (error) {
    console.error('[EMAIL_SERVICE] Failed to send OTP email:', error);
    return { success: false, error: error.message };
  }
};

/**
 * Test email configuration
 * @param {string} testEmail - Email to send test to
 */
const testEmailConfiguration = async (testEmail = null) => {
  try {
    const recipientEmail = testEmail || process.env.EMAIL_USER || 'test@example.com';
    const result = await sendEmail(
      recipientEmail,
      'Gracewell NEXUS - Email Configuration Test',
      `
        <h2>Email Service Test Successful!</h2>
        <p>Your Gracewell NEXUS email service is configured and working correctly.</p>
        <p>Service Provider: ${process.env.EMAIL_SERVICE || 'Custom SMTP'}</p>
        <p>Timestamp: ${new Date().toISOString()}</p>
      `
    );
    return result;
  } catch (error) {
    console.error('[EMAIL_SERVICE] Test failed:', error);
    return { success: false, error: error.message };
  }
};

module.exports = {
  sendPasswordResetEmail,
  sendEmailVerificationEmail,
  sendEmail,
  sendOTPEmail,
  testEmailConfiguration,
  isRealEmailConfigured,
  transporter
};
