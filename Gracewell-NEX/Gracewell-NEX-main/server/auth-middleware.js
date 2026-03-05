/**
 * Authentication Middleware & Utilities
 * Handles rate limiting, IP-based tracking, and security features
 */

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

// In-memory store for rate limiting (use Redis in production)
const loginAttempts = new Map();
const resetAttempts = new Map();

const MAX_LOGIN_ATTEMPTS = 7;
const LOCKOUT_DURATION = 5 * 60 * 1000; // 5 minutes
const MAX_RESET_ATTEMPTS = 5;
const RESET_LOCKOUT_DURATION = 10 * 60 * 1000; // 10 minutes

/**
 * Get client IP from request
 */
function getClientIp(req) {
  return req.ip || 
    req.connection.remoteAddress || 
    req.socket.remoteAddress || 
    req.connection.socket.remoteAddress ||
    'unknown';
}

/**
 * Check if login is rate limited
 */
function isLoginRateLimited(identifier) {
  const key = `login:${identifier}`;
  const now = Date.now();
  
  if (!loginAttempts.has(key)) {
    return { limited: false, attempts: 0, remaining: 0 };
  }

  const data = loginAttempts.get(key);
  
  if (now - data.firstAttempt > LOCKOUT_DURATION) {
    loginAttempts.delete(key);
    return { limited: false, attempts: 0, remaining: 0 };
  }

  const attemptsLeft = Math.max(0, MAX_LOGIN_ATTEMPTS - data.count);
  return {
    limited: data.count >= MAX_LOGIN_ATTEMPTS,
    attempts: data.count,
    remaining: attemptsLeft,
    resetTime: new Date(data.firstAttempt + LOCKOUT_DURATION)
  };
}

/**
 * Record login attempt
 */
function recordLoginAttempt(identifier) {
  const key = `login:${identifier}`;
  
  if (!loginAttempts.has(key)) {
    loginAttempts.set(key, {
      count: 1,
      firstAttempt: Date.now()
    });
  } else {
    const data = loginAttempts.get(key);
    data.count++;
  }
}

/**
 * Clear login attempts
 */
function clearLoginAttempts(identifier) {
  const key = `login:${identifier}`;
  loginAttempts.delete(key);
}

/**
 * Check if password reset is rate limited
 */
function isResetRateLimited(email) {
  const key = `reset:${email}`;
  const now = Date.now();
  
  if (!resetAttempts.has(key)) {
    return { limited: false, attempts: 0 };
  }

  const data = resetAttempts.get(key);
  
  if (now - data.firstAttempt > RESET_LOCKOUT_DURATION) {
    resetAttempts.delete(key);
    return { limited: false, attempts: 0 };
  }

  return {
    limited: data.count >= MAX_RESET_ATTEMPTS,
    attempts: data.count,
    resetTime: new Date(data.firstAttempt + RESET_LOCKOUT_DURATION)
  };
}

/**
 * Record password reset attempt
 */
function recordResetAttempt(email) {
  const key = `reset:${email}`;
  
  if (!resetAttempts.has(key)) {
    resetAttempts.set(key, {
      count: 1,
      firstAttempt: Date.now()
    });
  } else {
    const data = resetAttempts.get(key);
    data.count++;
  }
}

/**
 * Clear password reset attempts
 */
function clearResetAttempts(email) {
  const key = `reset:${email}`;
  resetAttempts.delete(key);
}

/**
 * Validate employee ID format
 */
function validateEmployeeIdFormat(id) {
  // Format: GW + sequential number (e.g., GW001, GW1234) - NEW FORMAT
  // OR: Legacy alphanumeric format for backward compatibility (e.g., M001, EMP123)
  const newFormat = /^GW\d{1,4}$/i;     // GW001-GW9999
  const oldFormat = /^[A-Za-z]{1,3}\d{1,4}$/; // Legacy IDs (still accepted)
  return newFormat.test(id.trim()) || oldFormat.test(id.trim());
}

/**
 * Validate password strength
 */
function validatePasswordStrength(password) {
  const checks = {
    length: password.length >= 8,
    uppercase: /[A-Z]/.test(password),
    lowercase: /[a-z]/.test(password),
    number: /\d/.test(password),
    special: /[!@#$%^&*()_+=\[\]{};:'",.<>?/\\|-]/.test(password)
  };

  const score = Object.values(checks).filter(Boolean).length;
  
  return {
    valid: score >= 3, // At least 3 criteria
    score,
    checks,
    message: score < 3 ? 'Password must contain at least 3 of: uppercase, lowercase, numbers, special characters' : ''
  };
}

/**
 * Generate secure password reset token
 */
function generateResetToken() {
  const crypto = require('crypto');
  return crypto.randomBytes(32).toString('hex');
}

/**
 * Verify CAPTCHA (Google reCAPTCHA v3)
 */
async function verifyCaptcha(token) {
  if (!process.env.RECAPTCHA_SECRET_KEY) {
    console.warn('RECAPTCHA_SECRET_KEY not configured, skipping CAPTCHA verification');
    return true; // Skip if not configured
  }

  try {
    const response = await fetch('https://www.google.com/recaptcha/api/siteverify', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: `secret=${process.env.RECAPTCHA_SECRET_KEY}&response=${token}`
    });

    const data = await response.json();
    
    // Score > 0.5 is generally good, < 0.3 is likely a bot
    return data.success && data.score > 0.3;
  } catch (error) {
    console.error('CAPTCHA verification error:', error);
    return false;
  }
}

module.exports = {
  getClientIp,
  isLoginRateLimited,
  recordLoginAttempt,
  clearLoginAttempts,
  isResetRateLimited,
  recordResetAttempt,
  clearResetAttempts,
  validateEmployeeIdFormat,
  validatePasswordStrength,
  generateResetToken,
  verifyCaptcha,
  MAX_LOGIN_ATTEMPTS,
  LOCKOUT_DURATION,
  MAX_RESET_ATTEMPTS,
  RESET_LOCKOUT_DURATION
};
