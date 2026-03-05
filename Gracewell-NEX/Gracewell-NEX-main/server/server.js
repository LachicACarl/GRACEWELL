const path = require('path');
const fs = require('fs');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const { createClient } = require('@supabase/supabase-js');
const crypto = require('crypto');
const PDFDocument = require('pdfkit');
const ExcelJS = require('exceljs');
const QRCode = require('qrcode');
const db = require('./database');
const authMiddleware = require('./auth-middleware');

const app = express();
const PORT = process.env.PORT || 4000;
const JWT_SECRET = process.env.JWT_SECRET || (process.env.NODE_ENV !== 'production' ? 'dev-jwt-secret-change-me' : null);

if (!JWT_SECRET) {
  throw new Error('JWT_SECRET is required in production');
}

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Multer for file uploads
const upload = multer({ 
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 } // 5MB
});

// Supabase client (optional, for image storage)
const supabaseKey = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY;
const supabase = process.env.SUPABASE_URL && supabaseKey
  ? createClient(process.env.SUPABASE_URL, supabaseKey)
  : null;

const uploadQrToSupabase = async (qrCode, employeeId) => {
  if (!supabase) {
    throw new Error('Supabase storage not configured');
  }

  const bucket = process.env.SUPABASE_BUCKET || 'attendance-images';
  const fileName = `qr-codes/${employeeId}-${Date.now()}.png`;
  const pngBuffer = await QRCode.toBuffer(qrCode, { type: 'png', width: 300, margin: 1 });

  const { error: uploadError } = await supabase.storage
    .from(bucket)
    .upload(fileName, pngBuffer, {
      contentType: 'image/png',
      upsert: true
    });

  if (uploadError) {
    throw new Error(uploadError.message || 'Failed to upload QR code');
  }

  const { data: publicData } = supabase.storage.from(bucket).getPublicUrl(fileName);
  if (!publicData?.publicUrl) {
    throw new Error('Failed to get public QR URL');
  }

  return publicData.publicUrl;
};

const uploadEmployeePhotoToSupabase = async (file, employeeCode) => {
  if (!supabase) {
    throw new Error('Supabase storage not configured');
  }

  const bucket = process.env.SUPABASE_PROFILE_BUCKET || process.env.SUPABASE_BUCKET || 'profile-images';
  const extension = file.mimetype === 'image/png' ? 'png' : 'jpg';
  const fileName = `employees/${employeeCode}-${Date.now()}.${extension}`;

  const { error: uploadError } = await supabase.storage
    .from(bucket)
    .upload(fileName, file.buffer, {
      contentType: file.mimetype,
      upsert: true
    });

  if (uploadError) {
    throw new Error(uploadError.message || 'Failed to upload employee photo');
  }

  const { data: publicData } = supabase.storage.from(bucket).getPublicUrl(fileName);
  if (!publicData?.publicUrl) {
    throw new Error('Failed to get public photo URL');
  }

  return publicData.publicUrl;
};

const getCorrectionProofBucket = () => process.env.SUPABASE_CORRECTION_BUCKET || process.env.SUPABASE_BUCKET || 'attendance-images';

const extractStoragePathFromUrl = (proofUrl, bucket) => {
  if (!proofUrl) return null;
  try {
    const parsed = new URL(proofUrl);
    const pathName = decodeURIComponent(parsed.pathname || '');
    const patterns = [
      `/storage/v1/object/public/${bucket}/`,
      `/storage/v1/object/sign/${bucket}/`,
      `/object/public/${bucket}/`,
      `/object/sign/${bucket}/`
    ];

    for (const pattern of patterns) {
      const index = pathName.indexOf(pattern);
      if (index !== -1) {
        const raw = pathName.slice(index + pattern.length);
        const cleaned = raw.startsWith('/') ? raw.slice(1) : raw;
        return cleaned || null;
      }
    }
  } catch (err) {
    return null;
  }
  return null;
};

const createCorrectionProofSignedUrl = async (proofData = {}, options = {}) => {
  if (!supabase) {
    return { signedUrl: null, error: 'Supabase storage not configured' };
  }

  const bucket = proofData.proofBucket || getCorrectionProofBucket();
  const expiresIn = Number(options.expiresIn || 60 * 15);
  let filePath = proofData.proofPath || proofData.filePath || null;

  if (!filePath && proofData.proofUrl) {
    filePath = extractStoragePathFromUrl(proofData.proofUrl, bucket);
  }

  if (!filePath) {
    return { signedUrl: null, error: 'Proof file path is missing', bucket, filePath: null };
  }

  const signedOptions = {};
  if (options.download) {
    signedOptions.download = options.downloadFileName || `proof-${Date.now()}.jpg`;
  }

  const { data, error } = await supabase.storage
    .from(bucket)
    .createSignedUrl(filePath, expiresIn, signedOptions);

  if (error || !data?.signedUrl) {
    return { signedUrl: null, error: error?.message || 'Failed to generate signed URL', bucket, filePath };
  }

  return { signedUrl: data.signedUrl, error: null, bucket, filePath, expiresIn };
};

const buildEmployeeName = (employee) => {
  if (!employee) return '';
  return [employee.first_name, employee.middle_name, employee.last_name].filter(Boolean).join(' ');
};

const resolvePdfUnicodeFonts = () => {
  const candidates = [
    {
      regular: path.join(process.env.WINDIR || 'C:\\Windows', 'Fonts', 'arial.ttf'),
      bold: path.join(process.env.WINDIR || 'C:\\Windows', 'Fonts', 'arialbd.ttf')
    },
    {
      regular: path.join(process.env.WINDIR || 'C:\\Windows', 'Fonts', 'segoeui.ttf'),
      bold: path.join(process.env.WINDIR || 'C:\\Windows', 'Fonts', 'segoeuib.ttf')
    },
    {
      regular: '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',
      bold: '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf'
    },
    {
      regular: '/usr/share/fonts/truetype/noto/NotoSans-Regular.ttf',
      bold: '/usr/share/fonts/truetype/noto/NotoSans-Bold.ttf'
    }
  ];

  for (const set of candidates) {
    if (fs.existsSync(set.regular)) {
      return {
        regular: set.regular,
        bold: fs.existsSync(set.bold) ? set.bold : set.regular
      };
    }
  }

  return null;
};

const configurePdfFonts = (doc) => {
  const unicodeFontSet = resolvePdfUnicodeFonts();
  if (unicodeFontSet) {
    try {
      doc.registerFont('ReportRegular', unicodeFontSet.regular);
      doc.registerFont('ReportBold', unicodeFontSet.bold);
      return { regular: 'ReportRegular', bold: 'ReportBold', pesoSign: '₱' };
    } catch (error) {
      console.warn('Unicode font registration failed:', error?.message || error);
    }
  }

  return { regular: 'Helvetica', bold: 'Helvetica-Bold', pesoSign: 'PHP ' };
};

const formatPesoAmount = (value, pesoSign = '₱') => `${pesoSign}${(parseFloat(value) || 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const resolveReportLogoPath = () => {
  const candidates = [
    path.join(__dirname, '..', 'src', 'assets', 'nexus-logo.png'),
    path.join(__dirname, '..', 'public', 'nexus-logo.png')
  ];

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }

  return null;
};

/**
 * Generate next sequential GW employee code
 * Returns format: GW003, GW004, ..., GW9999
 * GW001 = Super Admin, GW002 = Admin, GW003+ = Employees
 */
const getNextEmployeeCode = async () => {
  try {
    // Get highest existing GW code
    const { data: employees, error } = await db
      .from('employees')
      .select('employee_code')
      .ilike('employee_code', 'GW%')
      .order('employee_code', { ascending: false })
      .limit(1);

    let nextNumber = 3; // Start from 3 (GW001=SuperAdmin, GW002=Admin)
    if (!error && employees && employees.length > 0) {
      // Extract number from last code (e.g., "GW123" -> 123)
      const lastCode = employees[0].employee_code;
      const match = lastCode.match(/^GW(\d+)$/i);
      if (match) {
        const lastNumber = parseInt(match[1], 10);
        // Ensure we don't go below 3
        nextNumber = Math.max(3, lastNumber + 1);
      }
    }

    // Pad with zeros to 3 digits minimum (GW003, GW004, etc.)
    const paddedNumber = String(nextNumber).padStart(3, '0');
    return `GW${paddedNumber}`;
  } catch (err) {
    console.error('Error generating next employee code:', err);
    throw new Error('Failed to generate employee code');
  }
};

const pickAccount = (employee) => {
  if (!employee) return null;
  if (Array.isArray(employee.user_accounts)) {
    return employee.user_accounts[0] || null;
  }
  return employee.user_accounts || null;
};

const getEmployeeByCode = async (employeeCode) => {
  // Normalize: uppercase and trim
  const normalizedCode = String(employeeCode || '').trim().toUpperCase();
  if (!normalizedCode) {
    return { employee: null, account: null, roleName: null, departmentName: null };
  }

  // First try: exact match (case-insensitive via ilike) with exact value
  const { data, error } = await db
    .from('employees')
    .select('employee_id, employee_code, first_name, middle_name, last_name, email_address, contact_number, profile_image_url, position, record_status, department_id, departments:department_id(department_name), user_accounts (user_id, username, password_hash, role_id, account_status, last_login, roles:role_id(role_name))')
    .ilike('employee_code', normalizedCode)
    .single();

  if (error || !data) {
    console.log(`[Employee Lookup] Employee not found: ${normalizedCode}`, error?.message);
    return { employee: null, account: null, roleName: null, departmentName: null };
  }

  console.log(`[Employee Lookup] Found: ${normalizedCode} -> ${data.employee_code}`);

  const account = pickAccount(data);
  const roleName = account?.roles?.role_name || null;
  const departmentName = data.departments?.department_name || null;

  return { employee: data, account, roleName, departmentName };
};

const getEmployeeByEmail = async (email) => {
  const normalizedEmail = String(email || '').trim().toLowerCase();
  if (!normalizedEmail) {
    return { employee: null, account: null, roleName: null, departmentName: null };
  }

  const { data, error } = await db
    .from('employees')
    .select('employee_id, employee_code, first_name, middle_name, last_name, email_address, contact_number, profile_image_url, position, record_status, department_id, departments:department_id(department_name), user_accounts (user_id, username, password_hash, role_id, account_status, last_login, roles:role_id(role_name))')
    .ilike('email_address', normalizedEmail)
    .single();

  if (error || !data) {
    return { employee: null, account: null, roleName: null, departmentName: null };
  }

  const account = pickAccount(data);
  const roleName = account?.roles?.role_name || null;
  const departmentName = data.departments?.department_name || null;

  return { employee: data, account, roleName, departmentName };
};

// ========== TIMEZONE UTILITIES ==========
// Standardized timezone handling for Asia/Manila (UTC+8)

const MANILA_TIMEZONE = 'Asia/Manila';

/**
 * Get current date in Manila timezone as YYYY-MM-DD
 * Uses Intl.DateTimeFormat for accurate timezone handling
 * @returns {string} - Date string in YYYY-MM-DD format
 */
const getManilaDateString = () => {
  const now = new Date();
  const formatter = new Intl.DateTimeFormat('en-CA', { // en-CA gives YYYY-MM-DD format
    timeZone: MANILA_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  });
  return formatter.format(now);
};

/**
 * Get current time in Manila timezone as HH:MM:SS
 * Uses Intl.DateTimeFormat for accurate timezone handling
 * @returns {string} - Time string in HH:MM:SS format (24-hour)
 */
const getManilaTimeString = () => {
  const now = new Date();
  const formatter = new Intl.DateTimeFormat('en-GB', { // en-GB gives 24-hour format
    timeZone: MANILA_TIMEZONE,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  });
  
  // formatter.format() returns "HH:MM:SS" in en-GB locale
  const parts = formatter.formatToParts(now);
  const hour = parts.find(p => p.type === 'hour').value;
  const minute = parts.find(p => p.type === 'minute').value;
  const second = parts.find(p => p.type === 'second').value;
  
  return `${hour}:${minute}:${second}`;
};

/**
 * Convert a Date object to HH:MM:SS in Manila timezone
 * Uses Intl.DateTimeFormat for accurate timezone handling
 * @param {Date} date - Date object
 * @returns {string} - Time string in HH:MM:SS format (24-hour)
 */
const toManilaTimeString = (date) => {
  const formatter = new Intl.DateTimeFormat('en-GB', {
    timeZone: MANILA_TIMEZONE,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  });
  
  const parts = formatter.formatToParts(date);
  const hour = parts.find(p => p.type === 'hour').value;
  const minute = parts.find(p => p.type === 'minute').value;
  const second = parts.find(p => p.type === 'second').value;
  
  return `${hour}:${minute}:${second}`;
};

/**
 * Format date and time strings into ISO 8601 datetime with Manila timezone offset
 * @param {string} dateString - Date in YYYY-MM-DD format
 * @param {string} timeString - Time in HH:MM:SS format
 * @returns {string} - ISO datetime with timezone: YYYY-MM-DDTHH:MM:SS+08:00
 */
const formatDateTimeWithTimezone = (dateString, timeString) => {
  if (!dateString || !timeString) return null;
  return `${dateString}T${timeString}+08:00`;
};

// ========== END TIMEZONE UTILITIES ==========

/**
 * JWT Middleware - Verify token and extract role claim
 * =====================================================
 * Role Hierarchy: super_admin > admin > manager > employee > qr_scanner
 * 
 * JWT Claims:
 *   - role: User role (super_admin, admin, manager, employee, qr_scanner)
 *   - employeeId: Employee ID (int)
 *   - employeeCode: Employee code (string, uppercase)
 *   - userId: User account ID
 *   - purpose: Token purpose (e.g., 'attendance')
 *   - exp: Expiration time (auto-set by jwt.sign)
 */
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ message: 'Access token required' });
  }

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) {
      console.error('[JWT Verification] Token validation failed:', err.message);
      return res.status(403).json({ message: 'Invalid or expired token' });
    }
    
    // Verify role claim exists (REQUIRED for role-based redirects)
    if (!user.role) {
      console.error('[JWT Verification] Missing role claim in token:', Object.keys(user));
      return res.status(403).json({ message: 'Invalid token: missing role claim' });
    }
    
    req.user = user;
    next();
  });
};

/**
 * Role-Based Access Control Middleware
 * ====================================
 * Validates user role and enforces role hierarchy
 * Usage: app.post('/protected-route', authenticateToken, enforceRole('admin'), handler)
 * 
 * Role Hierarchy:
 *   super_admin (highest) → admin → manager → employee → qr_scanner (lowest)
 */
const enforceRole = (requiredRole) => {
  return (req, res, next) => {
    const userRole = req.user?.role;
    
    if (!userRole) {
      return res.status(403).json({ message: 'Unauthorized: No role in token' });
    }

    // Define role hierarchy and allowed roles for each requirement
    const roleHierarchy = {
      'super_admin': ['super_admin', 'admin', 'manager', 'employee', 'qr_scanner'],
      'admin': ['admin', 'manager', 'employee', 'qr_scanner'],
      'manager': ['manager', 'employee'],
      'employee': ['employee'],
      'qr_scanner': ['qr_scanner', 'admin', 'super_admin']
    };

    const allowedRoles = roleHierarchy[requiredRole] || [];
    
    if (!allowedRoles.includes(userRole)) {
      console.error(`[Access Control] User role '${userRole}' denied access to '${requiredRole}' resource`);
      return res.status(403).json({ 
        message: 'Unauthorized',
        userRole,
        requiredRole,
        reason: `Role '${userRole}' cannot access '${requiredRole}' resources`
      });
    }
    
    next();
  };
};

// ========== AUTH ROUTES ==========

// Check employee role by ID (no auth required)
app.post('/auth/check-employee', async (req, res) => {
  const { employeeId } = req.body;
  const normalizedEmployeeId = String(employeeId || '').trim().toUpperCase();

  if (!normalizedEmployeeId) {
    return res.status(400).json({ message: 'Employee ID is required' });
  }

  try {
    const { employee, account, roleName } = await getEmployeeByCode(normalizedEmployeeId);

    if (!employee || !account || !roleName) {
      return res.status(401).json({ message: 'Employee ID not found' });
    }

    res.json({
      found: true,
      role: roleName,
      name: buildEmployeeName(employee),
      status: account.account_status || employee.record_status,
      requiresPassword: roleName !== 'employee'
    });
  } catch (err) {
    return res.status(500).json({ message: 'Database error' });
  }
});

// Login
app.post('/auth/login', async (req, res) => {
  const { employeeId, password, captchaToken } = req.body;
  const normalizedEmployeeId = String(employeeId || '').trim().toUpperCase();
  const clientIp = req.ip || req.connection.remoteAddress || 'unknown';

  if (!JWT_SECRET) {
    return res.status(500).send('Database error: JWT secret is not configured');
  }

  // Validate employee ID format
  if (!normalizedEmployeeId || !authMiddleware.validateEmployeeIdFormat(normalizedEmployeeId)) {
    return res.status(400).json({ message: 'ID not recognized' });
  }

  // Check rate limiting
  const rateLimitCheck = authMiddleware.isLoginRateLimited(normalizedEmployeeId);
  if (rateLimitCheck.limited) {
    // Log rate limit exceeded
    const { error: auditError } = await db.from('audit_logs').insert({
      action: 'LOGIN_RATE_LIMIT_EXCEEDED',
      module: 'authentication',
      notes: JSON.stringify({
        employeeId: normalizedEmployeeId,
        clientIp,
        timestamp: new Date().toISOString()
      })
    });
    if (auditError) {
      console.error('Audit log error:', auditError);
    }

    return res.status(429).json({ 
      message: `Too many login attempts. Please try again later.`,
      retryAfter: Math.ceil((rateLimitCheck.resetTime - Date.now()) / 1000)
    });
  }

  if (rateLimitCheck.attempts >= 3) {
    if (!captchaToken) {
      return res.status(400).json({ message: 'CAPTCHA required after multiple failed attempts' });
    }

    const captchaValid = await authMiddleware.verifyCaptcha(captchaToken);
    if (!captchaValid) {
      try {
        await db.from('audit_logs').insert({
          action: 'LOGIN_CAPTCHA_FAILED',
          module: 'authentication',
          notes: JSON.stringify({
            employeeId,
            clientIp,
            timestamp: new Date().toISOString()
          })
        });
      } catch (auditErr) {
        console.error('Audit log error:', auditErr);
      }

      return res.status(400).json({ message: 'CAPTCHA verification failed' });
    }
  }

  try {
    const { employee, account, roleName, departmentName } = await getEmployeeByCode(normalizedEmployeeId);

    if (!employee || !account || !roleName) {
      authMiddleware.recordLoginAttempt(normalizedEmployeeId);
      
      // Log failed login attempt
      const { error: auditError } = await db.from('audit_logs').insert({
        action: 'LOGIN_FAILED',
        module: 'authentication',
        notes: JSON.stringify({
          employeeId: normalizedEmployeeId,
          clientIp,
          reason: 'Invalid credentials or inactive account',
          timestamp: new Date().toISOString()
        })
      });
      if (auditError) {
        console.error('Audit log error:', auditError);
      }

      return res.status(401).json({ message: 'Invalid credentials or inactive account' });
    }

    if (account.account_status && account.account_status.toUpperCase() !== 'ACTIVE') {
      authMiddleware.recordLoginAttempt(normalizedEmployeeId);
      
      // Log inactive account attempt
      const { error: auditError } = await db.from('audit_logs').insert({
        action: 'LOGIN_INACTIVE_ACCOUNT',
        module: 'authentication',
        notes: JSON.stringify({
          employeeId: normalizedEmployeeId,
          clientIp,
          accountStatus: account.account_status,
          timestamp: new Date().toISOString()
        })
      });
      if (auditError) {
        console.error('Audit log error:', auditError);
      }

      return res.status(401).json({ message: 'Account is inactive' });
    }

    // Check email verification - enforce for admin/manager, allow for employees QR mode
    const isEmailVerified = Boolean(employee.email_verified_at);
    
    // TEMPORARILY DISABLED FOR TESTING - will re-enable after email setup complete
    if (false && !isEmailVerified && (roleName === 'admin' || roleName === 'super_admin' || roleName === 'manager' || (roleName === 'employee' && password))) {
      // For non-QR logins, enforce email verification
      console.log(`[EMAIL_VERIFY] Blocking login for unverified email: ${employee.email_address} (Role: ${roleName})`);
      
      // Log email verification required
      const { error: auditError } = await db.from('audit_logs').insert({
        action: 'LOGIN_EMAIL_NOT_VERIFIED',
        module: 'authentication',
        notes: JSON.stringify({
          employeeId: normalizedEmployeeId,
          email: employee.email_address,
          role: roleName,
          clientIp,
          timestamp: new Date().toISOString()
        })
      });
      if (auditError) {
        console.error('Audit log error:', auditError);
      }

      return res.status(403).json({ 
        code: 'EMAIL_NOT_VERIFIED',
        message: 'Please verify your email to continue. Check your inbox for verification link or request a new one.',
        email: employee.email_address,
        requiresVerification: true
      });
    }

    // For employees: allow login without password (QR attendance mode)
    if (roleName === 'employee' && (!password || password === '')) {
      authMiddleware.clearLoginAttempts(normalizedEmployeeId);
      
      const today = new Date().toISOString().split('T')[0];
      let hasCheckedInToday = false;
      try {
        const { data: attendanceRows } = await db
          .from('attendance')
          .select('check_in_time')
          .eq('employee_id', employee.employee_id)
          .eq('attendance_date', today)
          .limit(1);

        hasCheckedInToday = Boolean(attendanceRows && attendanceRows[0]?.check_in_time);
      } catch (attendanceError) {
        console.error('Attendance lookup error:', attendanceError);
      }

      const safeEmployeeId = String(employee.employee_id);
      const safeUserId = account.user_id ? String(account.user_id) : null;
      
      // Validate role before creating token (REQUIRED for redirect consistency)
      const validRoles = ['super_admin', 'admin', 'manager', 'employee', 'qr_scanner'];
      if (!validRoles.includes(roleName)) {
        console.error(`[Token Generation] Invalid role for attendance login: ${roleName}`);
        return res.status(500).json({ message: 'Invalid role configuration' });
      }
      
      const token = jwt.sign(
        {
          employeeId: safeEmployeeId,
          employeeCode: employee.employee_code,
          userId: safeUserId,
          role: roleName,
          purpose: 'attendance'
        },
        JWT_SECRET,
        { expiresIn: process.env.JWT_EXPIRES_IN || '24h' }
      );

      // Log successful login
      const { error: auditError } = await db.from('audit_logs').insert({
        user_id: safeUserId,
        action: 'LOGIN_SUCCESS',
        module: 'authentication',
        notes: JSON.stringify({
          employeeId: normalizedEmployeeId,
          role: roleName,
          clientIp,
          loginMode: 'attendance',
          timestamp: new Date().toISOString()
        })
      });
      if (auditError) {
        console.error('Audit log error:', auditError);
      }

      return res.json({
        accessToken: token,
        user: {
          employeeId: employee.employee_code,
          employeeName: buildEmployeeName(employee),
          userRole: roleName,
          email: employee.email_address,
          status: account.account_status || employee.record_status,
          profileImage: employee.profile_image_url || null,
          profile_image_url: employee.profile_image_url || null,
          isAttendanceMode: !hasCheckedInToday
        }
      });
    }

    // For admin/manager or when password is provided: require password verification
    if (!password || password === '') {
      authMiddleware.recordLoginAttempt(normalizedEmployeeId);
      return res.status(401).json({ message: 'Password is required' });
    }

    if (!account.password_hash) {
      authMiddleware.recordLoginAttempt(normalizedEmployeeId);
      return res.status(401).json({ message: 'Password not set for this account' });
    }

    const passwordValid = bcrypt.compareSync(password, account.password_hash);
    if (!passwordValid) {
      authMiddleware.recordLoginAttempt(normalizedEmployeeId);
      
      // Log failed password
      const { error: auditError } = await db.from('audit_logs').insert({
        action: 'LOGIN_INVALID_PASSWORD',
        module: 'authentication',
        notes: JSON.stringify({
          employeeId: normalizedEmployeeId,
          clientIp,
          attempt: authMiddleware.isLoginRateLimited(normalizedEmployeeId).attempts,
          timestamp: new Date().toISOString()
        })
      });
      if (auditError) {
        console.error('Audit log error:', auditError);
      }

      return res.status(401).json({ message: 'Invalid credentials' });
    }

    authMiddleware.clearLoginAttempts(normalizedEmployeeId);
    const safeEmployeeId = String(employee.employee_id);
    const safeUserId = account.user_id ? String(account.user_id) : null;
    
    // Validate role before creating token (REQUIRED for redirect consistency)
    const validRoles = ['super_admin', 'admin', 'manager', 'employee', 'qr_scanner'];
    if (!validRoles.includes(roleName)) {
      console.error(`[Token Generation] Invalid role for password login: ${roleName}`);
      return res.status(500).json({ message: 'Invalid role configuration' });
    }
    
    const token = jwt.sign(
      {
        employeeId: safeEmployeeId,
        employeeCode: employee.employee_code,
        userId: safeUserId,
        role: roleName
      },
      JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || '24h' }
    );

    // Log successful login
    const { error: auditError } = await db.from('audit_logs').insert({
      user_id: safeUserId,
      action: 'LOGIN_SUCCESS',
      module: 'authentication',
      notes: JSON.stringify({
        employeeId: normalizedEmployeeId,
        role: roleName,
        clientIp,
        loginMode: 'password',
        timestamp: new Date().toISOString()
      })
    });
    if (auditError) {
      console.error('Audit log error:', auditError);
    }

    // Update last login
    const { error: lastLoginError } = await db.from('user_accounts')
      .update({ last_login: new Date().toISOString() })
      .eq('user_id', account.user_id);
    if (lastLoginError) {
      console.error('Last login update error:', lastLoginError);
    }

    res.json({
      accessToken: token,
      user: {
        employeeId: employee.employee_code,
        employeeName: buildEmployeeName(employee),
        userRole: roleName,
        email: employee.email_address,
        status: account.account_status || employee.record_status,
        profileImage: employee.profile_image_url || null,
        profile_image_url: employee.profile_image_url || null
      }
    });
  } catch (err) {
    console.error('Login error:', err);
    const detail = err?.message || String(err);
    return res.status(500).send(`Database error: ${detail}`);
  }
});

// Attendance QR Login - Employee ID only (no password required)
app.post('/auth/qr-login', async (req, res) => {
  const { employeeId } = req.body;
  const normalizedEmployeeId = String(employeeId || '').trim().toUpperCase();

  if (!normalizedEmployeeId) {
    return res.status(400).json({ message: 'Employee ID is required' });
  }

  try {
    const { employee, account, roleName } = await getEmployeeByCode(normalizedEmployeeId);

    if (!employee || !account || !roleName) {
      return res.status(401).json({ message: 'Employee ID not found or inactive' });
    }

    if (account.account_status && account.account_status.toUpperCase() !== 'ACTIVE') {
      return res.status(401).json({ message: 'Employee ID not found or inactive' });
    }

    // Generate temporary attendance session token
    const safeEmployeeId = String(employee.employee_id);
    const safeUserId = account.user_id ? String(account.user_id) : null;
    const token = jwt.sign(
      {
        employeeId: safeEmployeeId,
        employeeCode: employee.employee_code,
        userId: safeUserId,
        role: roleName,
        purpose: 'attendance'
      },
      JWT_SECRET,
      { expiresIn: '30m' } // Short expiry for attendance session
    );

    res.json({
      success: true,
      accessToken: token,
      user: {
        employeeId: employee.employee_code,
        employeeName: buildEmployeeName(employee),
        userRole: roleName,
        qrCode: null,
        qrImageUrl: null
      }
    });
  } catch (err) {
    return res.status(500).json({ message: 'Database error', error: err.message });
  }
});

// QR Scanner Login - Separate login for QR001 and other QR Scanner admins
// Uses username and password (not employee ID)
app.post('/auth/qr-scanner-login', async (req, res) => {
  const { username, password } = req.body;
  const normalizedUsername = String(username || '').trim().toUpperCase();
  const clientIp = req.ip || req.connection.remoteAddress || 'unknown';

  if (!normalizedUsername || !password) {
    return res.status(400).json({ message: 'Username and password are required' });
  }

  try {
    // Get user account by username
    const { data: accountData, error: accountError } = await db
      .from('user_accounts')
      .select('user_id, username, password_hash, role_id, account_status, roles:role_id(role_name), employee_id')
      .eq('username', normalizedUsername)
      .single();

    if (accountError || !accountData) {
      // Log failed login attempt
      const { error: auditError } = await db.from('audit_logs').insert({
        action: 'QR_SCANNER_LOGIN_FAILED',
        module: 'authentication',
        notes: JSON.stringify({
          username: normalizedUsername,
          clientIp,
          reason: 'User not found',
          timestamp: new Date().toISOString()
        })
      });
      if (auditError) console.error('Audit log error:', auditError);

      return res.status(401).json({ message: 'Invalid username or password' });
    }

    // Check if account is active
    if (accountData.account_status && accountData.account_status.toUpperCase() !== 'ACTIVE') {
      const { error: auditError } = await db.from('audit_logs').insert({
        action: 'QR_SCANNER_LOGIN_INACTIVE_ACCOUNT',
        module: 'authentication',
        notes: JSON.stringify({
          username: normalizedUsername,
          clientIp,
          accountStatus: accountData.account_status,
          timestamp: new Date().toISOString()
        })
      });
      if (auditError) console.error('Audit log error:', auditError);

      return res.status(401).json({ message: 'Account is inactive' });
    }

    // Check if role is qr_scanner
    const roleName = accountData?.roles?.role_name;
    if (roleName !== 'qr_scanner') {
      const { error: auditError } = await db.from('audit_logs').insert({
        action: 'QR_SCANNER_LOGIN_UNAUTHORIZED',
        module: 'authentication',
        notes: JSON.stringify({
          username: normalizedUsername,
          role: roleName,
          clientIp,
          reason: 'User is not a QR Scanner',
          timestamp: new Date().toISOString()
        })
      });
      if (auditError) console.error('Audit log error:', auditError);

      return res.status(403).json({ message: 'Unauthorized. QR Scanner credentials required.' });
    }

    // Verify password
    const passwordMatch = bcrypt.compareSync(password, accountData.password_hash);
    if (!passwordMatch) {
      await db.from('audit_logs').insert({
        action: 'QR_SCANNER_LOGIN_FAILED',
        module: 'authentication',
        notes: JSON.stringify({
          username: normalizedUsername,
          clientIp,
          reason: 'Invalid password',
          timestamp: new Date().toISOString()
        })
      }).then(({ error: auditError }) => {
        if (auditError) console.error('Audit log error:', auditError);
      });

      return res.status(401).json({ message: 'Invalid username or password' });
    }

    // Get employee details
    const { data: employee, error: empError } = await db
      .from('employees')
      .select('employee_id, employee_code, first_name, middle_name, last_name, email_address, profile_image_url')
      .eq('employee_id', accountData.employee_id)
      .single();

    if (empError || !employee) {
      return res.status(500).json({ message: 'Employee record not found' });
    }

    // Generate JWT token for QR Scanner
    const safeEmployeeId = String(employee.employee_id);
    const safeUserId = String(accountData.user_id);
    const token = jwt.sign(
      {
        employeeId: safeEmployeeId,
        employeeCode: employee.employee_code,
        userId: safeUserId,
        role: 'qr_scanner',
        purpose: 'qr_scanning'
      },
      JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || '8h' }
    );

    // Log successful QR Scanner login
    await db.from('audit_logs').insert({
      user_id: safeUserId,
      action: 'QR_SCANNER_LOGIN_SUCCESS',
      module: 'authentication',
      notes: JSON.stringify({
        username: normalizedUsername,
        clientIp,
        timestamp: new Date().toISOString()
      })
    }).then(({ error: auditError }) => {
      if (auditError) console.error('Audit log error:', auditError);
    });

    // Update last login
    await db.from('user_accounts')
      .update({ last_login: new Date().toISOString() })
      .eq('user_id', safeUserId)
      .then(({ error: updateError }) => {
        if (updateError) console.error('Last login update error:', updateError);
      });

    res.json({
      accessToken: token,
      user: {
        employeeId: employee.employee_code,
        employeeCode: employee.employee_code,
        employeeName: buildEmployeeName(employee),
        userRole: 'qr_scanner',
        email: employee.email_address,
        profileImage: employee.profile_image_url || null,
        profile_image_url: employee.profile_image_url || null,
        isQRScanner: true
      }
    });
  } catch (err) {
    console.error('QR Scanner login error:', err);
    return res.status(500).json({ message: 'Server error', error: err.message });
  }
});

// Forgot password - request OTP via Supabase Auth
app.post('/auth/request-otp', async (req, res) => {
  const { email } = req.body;
  const clientIp = req.ip || req.connection.remoteAddress || 'unknown';

  if (!email) {
    return res.status(400).json({ message: 'Email is required' });
  }

  // Check rate limiting for OTP requests
  const resetLimitCheck = authMiddleware.isResetRateLimited(email);
  if (resetLimitCheck.limited) {
    // Log rate limit exceeded
    try {
      await db.from('audit_logs').insert({
        action: 'OTP_REQUEST_RATE_LIMIT_EXCEEDED',
        module: 'authentication',
        notes: JSON.stringify({
          email,
          clientIp,
          timestamp: new Date().toISOString()
        })
      });
    } catch (auditErr) {
      console.error('Audit log error:', auditErr);
    }

    return res.status(429).json({ 
      message: 'Too many OTP requests. Please try again later.',
      retryAfter: Math.ceil((resetLimitCheck.resetTime - Date.now()) / 1000)
    });
  }

  try {
    const { employee, account } = await getEmployeeByEmail(email);

    if (!employee || !account) {
      // Log not found (but don't reveal if email exists)
      try {
        await db.from('audit_logs').insert({
          action: 'OTP_REQUEST_NOT_FOUND',
          module: 'authentication',
          notes: JSON.stringify({
            email,
            clientIp,
            timestamp: new Date().toISOString()
          })
        });
      } catch (auditErr) {
        console.error('Audit log error:', auditErr);
      }

      // Security: Don't reveal if email exists
      return res.json({ success: true, message: 'If email exists, OTP has been sent' });
    }

    if (account.account_status && account.account_status.toUpperCase() !== 'ACTIVE') {
      // Log inactive account (but don't reveal)
      try {
        await db.from('audit_logs').insert({
          action: 'OTP_REQUEST_INACTIVE_ACCOUNT',
          module: 'authentication',
          notes: JSON.stringify({
            email,
            clientIp,
            accountStatus: account.account_status,
            timestamp: new Date().toISOString()
          })
        });
      } catch (auditErr) {
        console.error('Audit log error:', auditErr);
      }

      return res.json({ success: true, message: 'If email exists, OTP has been sent' });
    }

    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseKey) {
      return res.status(500).json({ message: 'Supabase auth not configured' });
    }

    const response = await fetch(`${supabaseUrl}/auth/v1/otp`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: supabaseKey,
        Authorization: `Bearer ${supabaseKey}`
      },
      body: JSON.stringify({
        email: employee.email_address,
        create_user: true
      })
    });

    if (!response.ok) {
      const text = await response.text();
      
      // Log OTP send failure
      try {
        await db.from('audit_logs').insert({
          action: 'OTP_REQUEST_FAILED',
          module: 'authentication',
          notes: JSON.stringify({
            email,
            clientIp,
            error: text,
            timestamp: new Date().toISOString()
          })
        });
      } catch (auditErr) {
        console.error('Audit log error:', auditErr);
      }

      return res.status(500).json({ message: text || 'Failed to send OTP' });
    }

    authMiddleware.recordResetAttempt(email);

    // Log successful OTP request
    try {
      await db.from('audit_logs').insert({
        action: 'OTP_REQUEST_SUCCESS',
        module: 'authentication',
        notes: JSON.stringify({
          email,
          clientIp,
          timestamp: new Date().toISOString()
        })
      });
    } catch (auditErr) {
      console.error('Audit log error:', auditErr);
    }

    return res.json({ success: true, message: 'OTP sent to email' });
  } catch (err) {
    // Log unexpected error
    try {
      await db.from('audit_logs').insert({
        action: 'OTP_REQUEST_ERROR',
        module: 'authentication',
        notes: JSON.stringify({
          email,
          clientIp,
          error: err.message,
          timestamp: new Date().toISOString()
        })
      });
    } catch (auditErr) {
      console.error('Audit log error:', auditErr);
    }

    return res.status(500).json({ message: 'Database error', error: err.message });
  }
});

// Password reset link - request secure one-time link
app.post('/auth/request-password-reset-link', async (req, res) => {
  const { email, captchaToken } = req.body;
  const clientIp = req.ip || req.connection.remoteAddress || 'unknown';

  if (!email) {
    return res.status(400).json({ message: 'Email is required' });
  }

  const resetLimitCheck = authMiddleware.isResetRateLimited(email);
  if (resetLimitCheck.limited) {
    try {
      await db.from('audit_logs').insert({
        action: 'PASSWORD_RESET_RATE_LIMIT_EXCEEDED',
        module: 'authentication',
        notes: JSON.stringify({
          email,
          clientIp,
          timestamp: new Date().toISOString()
        })
      });
    } catch (auditErr) {
      console.error('Audit log error:', auditErr);
    }

    return res.status(429).json({
      message: 'Too many reset requests. Please try again later.',
      retryAfter: Math.ceil((resetLimitCheck.resetTime - Date.now()) / 1000)
    });
  }

  if (resetLimitCheck.attempts >= 3) {
    if (!captchaToken) {
      return res.status(400).json({ message: 'CAPTCHA required after multiple attempts' });
    }

    const captchaValid = await authMiddleware.verifyCaptcha(captchaToken);
    if (!captchaValid) {
      try {
        await db.from('audit_logs').insert({
          action: 'PASSWORD_RESET_CAPTCHA_FAILED',
          module: 'authentication',
          notes: JSON.stringify({
            email,
            clientIp,
            timestamp: new Date().toISOString()
          })
        });
      } catch (auditErr) {
        console.error('Audit log error:', auditErr);
      }

      return res.status(400).json({ message: 'CAPTCHA verification failed' });
    }
  }

  try {
    const { employee, account } = await getEmployeeByEmail(email);

    if (!employee || !account) {
      try {
        await db.from('audit_logs').insert({
          action: 'PASSWORD_RESET_REQUEST_NOT_FOUND',
          module: 'authentication',
          notes: JSON.stringify({
            email,
            clientIp,
            timestamp: new Date().toISOString()
          })
        });
      } catch (auditErr) {
        console.error('Audit log error:', auditErr);
      }

      return res.json({ success: true, message: 'If the email exists, a reset link has been sent.' });
    }

    if (account.account_status && account.account_status.toUpperCase() !== 'ACTIVE') {
      try {
        await db.from('audit_logs').insert({
          action: 'PASSWORD_RESET_REQUEST_INACTIVE',
          module: 'authentication',
          notes: JSON.stringify({
            email,
            clientIp,
            accountStatus: account.account_status,
            timestamp: new Date().toISOString()
          })
        });
      } catch (auditErr) {
        console.error('Audit log error:', auditErr);
      }

      return res.json({ success: true, message: 'If the email exists, a reset link has been sent.' });
    }

    // Use Supabase Auth to send password reset email
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY;
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';

    console.log('[PASSWORD_RESET] Sending reset email via Supabase Auth for:', email);

    const response = await fetch(`${supabaseUrl}/auth/v1/recover`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': supabaseKey,
        'Authorization': `Bearer ${supabaseKey}`
      },
      body: JSON.stringify({
        email: email,
        options: {
          redirectTo: `${frontendUrl}/reset-password`
        }
      })
    });

    const responseText = await response.text();
    
    if (!response.ok) {
      console.error('[PASSWORD_RESET] Supabase error:', responseText);
      console.warn('[PASSWORD_RESET] Supabase email service not available (SMTP may not be configured)');
    } else {
      console.log('[PASSWORD_RESET] Supabase /auth/v1/recover called successfully');
      console.warn('[PASSWORD_RESET] Note: If SMTP is not configured in Supabase, no email will be sent');
    }
    
    // ALWAYS generate development reset link when not in production
    // This is because Supabase returns 200 OK even without SMTP configured
    if (process.env.NODE_ENV !== 'production') {
      console.log('[PASSWORD_RESET] Development mode - generating local reset link...');
      
      // Generate manual token for development
      const token = authMiddleware.generateResetToken();
      const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
      const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes
      
      // Store token in memory
      if (!global.passwordResetTokens) {
        global.passwordResetTokens = {};
      }
      global.passwordResetTokens[tokenHash] = {
        email: employee.email_address,
        employeeCode: employee.employee_code,
        userId: account.user_id,
        employeeId: employee.employee_id,
        expiresAt,
        used: false
      };
      
      const resetUrl = `${frontendUrl}/reset-password?token=${token}`;
      console.log('\n' + '='.repeat(80));
      console.log('🔐 PASSWORD RESET LINK (DEVELOPMENT MODE - USE THIS LINK)');
      console.log('='.repeat(80));
      console.log(`User: ${employee.first_name} ${employee.last_name}`);
      console.log(`Email: ${email}`);
      console.log(`Employee Code: ${employee.employee_code}`);
      console.log(`\nReset Link:`);
      console.log(`${resetUrl}`);
      console.log(`\nExpires: ${expiresAt.toLocaleString()}`);
      console.log('='.repeat(80) + '\n');
    }

    authMiddleware.recordResetAttempt(email);

    await db.from('audit_logs').insert({
      user_id: account.user_id,
      action: 'PASSWORD_RESET_REQUEST',
      module: 'authentication',
      notes: JSON.stringify({
        email: employee.email_address,
        clientIp,
        via: 'supabase_auth',
        timestamp: new Date().toISOString()
      })
    });

    return res.json({ success: true, message: 'If the email exists, a reset link has been sent.' });
  } catch (err) {
    console.error('[PASSWORD_RESET] Error:', err);
    try {
      await db.from('audit_logs').insert({
        action: 'PASSWORD_RESET_REQUEST_ERROR',
        module: 'authentication',
        notes: JSON.stringify({
          email,
          clientIp,
          error: err.message,
          timestamp: new Date().toISOString()
        })
      });
    } catch (auditErr) {
      console.error('Audit log error:', auditErr);
    }

    return res.status(500).json({ message: 'Database error', error: err.message });
  }
});

// Verify password reset token
app.get('/auth/verify-reset-token/:token', async (req, res) => {
  const { token } = req.params;
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');

  if (!global.passwordResetTokens || !global.passwordResetTokens[tokenHash]) {
    return res.status(404).json({ message: 'Invalid or expired reset link' });
  }

  const entry = global.passwordResetTokens[tokenHash];
  if (Date.now() > entry.expiresAt) {
    delete global.passwordResetTokens[tokenHash];
    return res.status(400).json({ message: 'Reset link has expired' });
  }

  res.json({ valid: true, email: entry.email });
});

// Reset password using secure reset link
app.post('/auth/reset-password-link', async (req, res) => {
  const { token, newPassword, confirmPassword } = req.body;
  const clientIp = req.ip || req.connection.remoteAddress || 'unknown';

  if (!token || !newPassword || !confirmPassword) {
    return res.status(400).json({ message: 'Missing required fields' });
  }

  if (newPassword !== confirmPassword) {
    return res.status(400).json({ message: 'Passwords do not match' });
  }

  const passwordCheck = authMiddleware.validatePasswordStrength(newPassword);
  if (!passwordCheck.valid) {
    return res.status(400).json({ message: passwordCheck.message || 'Weak password' });
  }

  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
  if (!global.passwordResetTokens || !global.passwordResetTokens[tokenHash]) {
    return res.status(400).json({ message: 'Invalid or expired reset link' });
  }

  const entry = global.passwordResetTokens[tokenHash];
  if (Date.now() > entry.expiresAt) {
    delete global.passwordResetTokens[tokenHash];
    return res.status(400).json({ message: 'Reset link has expired' });
  }

  try {
    const hash = await bcrypt.hash(newPassword, 10);
    const { error: updateError } = await db
      .from('user_accounts')
      .update({ password_hash: hash })
      .eq('user_id', entry.userId);

    if (updateError) {
      console.error('[PASSWORD_RESET] Update error:', updateError);
      return res.status(500).json({ message: 'Failed to update password' });
    }

    delete global.passwordResetTokens[tokenHash];
    authMiddleware.clearResetAttempts(entry.email);

    try {
      await db.from('audit_logs').insert({
        user_id: entry.userId,
        action: 'PASSWORD_RESET_SUCCESS',
        module: 'authentication',
        notes: JSON.stringify({
          email: entry.email,
          clientIp,
          timestamp: new Date().toISOString()
        })
      });
    } catch (auditErr) {
      console.error('Audit log error:', auditErr);
    }

    return res.json({ success: true, message: 'Password reset successfully' });
  } catch (err) {
    console.error('[PASSWORD_RESET] Error:', err);
    try {
      await db.from('audit_logs').insert({
        user_id: entry.userId || null,
        action: 'PASSWORD_RESET_ERROR',
        module: 'authentication',
        notes: JSON.stringify({
          email: entry.email,
          clientIp,
          error: err.message,
          timestamp: new Date().toISOString()
        })
      });
    } catch (auditErr) {
      console.error('Audit log error:', auditErr);
    }

    return res.status(500).json({ message: 'Database error', error: err.message });
  }
});

// Resend email verification - public endpoint (no auth required)
// Used when user is blocked at login due to unverified email
app.post('/auth/resend-email-verification', async (req, res) => {
  const { email } = req.body;
  const clientIp = req.ip || req.connection.remoteAddress || 'unknown';

  if (!email) {
    return res.status(400).json({ message: 'Email is required' });
  }

  try {
    const { employee, account } = await getEmployeeByEmail(email);

    if (!employee || !account) {
      // Don't reveal if email exists for security
      return res.json({ 
        success: true, 
        message: 'If the email exists, verification email will be sent.',
        verified: false 
      });
    }

    if (account.account_status && account.account_status.toUpperCase() !== 'ACTIVE') {
      return res.status(401).json({ message: 'Account is inactive' });
    }

    // For now, skip verification since column doesn't exist
    console.log('[EMAIL_VERIFY_RESEND] Auto-verifying (column not yet migrated):', email);
    
    // Log auto-verification
    await db.from('audit_logs').insert({
      action: 'EMAIL_VERIFIED_AUTO',
      module: 'authentication',
      notes: JSON.stringify({
        email,
        clientIp,
        reason: 'Column migration pending',
        timestamp: new Date().toISOString()
      })
    }).catch(err => console.error('Audit log error:', err));
    
    return res.json({ 
      success: true, 
      message: 'Email verified successfully',
      verified: true,
      autoVerified: true
    });
  } catch (err) {
    console.error('[EMAIL_VERIFY_RESEND] Unexpected error:', err);
    
    try {
      await db.from('audit_logs').insert({
        action: 'EMAIL_VERIFICATION_ERROR',
        module: 'authentication',
        notes: JSON.stringify({
          error: err.message,
          timestamp: new Date().toISOString()
        })
      });
    } catch (auditErr) {
      console.error('Audit log error:', auditErr);
    }
    
    return res.status(500).json({ message: 'Error sending verification email', error: err.message });
  }
});

// Test email sending endpoint
app.post('/auth/test-email', async (req, res) => {
  try {
    const { email } = req.body;
    
    if (!email) {
      return res.status(400).json({ message: 'Email is required' });
    }

    console.log('[TEST_EMAIL] Testing email send to:', email);

    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY;
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';

    // Send test OTP email using Supabase Auth
    const response = await fetch(`${supabaseUrl}/auth/v1/otp`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': supabaseKey,
        'Authorization': `Bearer ${supabaseKey}`
      },
      body: JSON.stringify({
        email: email,
        create_user: false,
        options: {
          emailRedirectTo: `${frontendUrl}/verify-email?email=${encodeURIComponent(email)}&test=true`
        }
      })
    });

    const responseText = await response.text();
    console.log('[TEST_EMAIL] Response status:', response.status);
    console.log('[TEST_EMAIL] Response body:', responseText);

    if (!response.ok) {
      return res.status(response.status).json({ 
        success: false,
        message: 'Email failed to send',
        status: response.status,
        error: responseText 
      });
    }

    return res.json({ 
      success: true, 
      message: `Test email sent to ${email}. Check your inbox!`,
      status: response.status
    });
  } catch (err) {
    console.error('[TEST_EMAIL] Error:', err);
    return res.status(500).json({ 
      success: false,
      message: 'Test email error',
      error: err.message 
    });
  }
});

// Email verification - request verification link via Supabase Auth
app.post('/auth/request-email-verification', authenticateToken, async (req, res) => {
  try {
    const { employee, account } = await getEmployeeByCode(req.user.employeeCode);

    if (!employee || !account) {
      return res.status(404).json({ message: 'User not found' });
    }

    if (account.account_status && account.account_status.toUpperCase() !== 'ACTIVE') {
      return res.status(401).json({ message: 'Account is inactive' });
    }

    console.log('[EMAIL_VERIFY] Auto-verifying (column not yet migrated):', employee.email_address);
    
    return res.json({ 
      success: true, 
      message: 'Email verified successfully',
      verified: true,
      autoVerified: true
    });
  } catch (err) {
    console.error('[EMAIL_VERIFY] Unexpected error:', err);
    return res.status(500).json({ message: 'Error verifying email', error: err.message });
  }
});

// Email verification - verify token and mark verified
// Verify email with token (called from email link)
app.post('/auth/verify-email', async (req, res) => {
  const { email, token, type } = req.body;

  if (!email) {
    return res.status(400).json({ message: 'Email is required' });
  }

  try {
    const { employee, account } = await getEmployeeByEmail(email);

    if (!employee || !account) {
      return res.status(404).json({ message: 'Email not found' });
    }

    console.log('[EMAIL_VERIFY] Email verified successfully:', email);
    return res.json({ 
      success: true, 
      message: 'Email verified successfully',
      verified: true
    });
  } catch (err) {
    console.error('[EMAIL_VERIFY] Unexpected error:', err);
    return res.status(500).json({ message: 'Verification error', error: err.message });
  }
});

// Manual email verification for admins/support (no password required) - Fallback endpoint
app.post('/auth/manual-verify-email', async (req, res) => {
  const { email } = req.body;

  if (!email) {
    return res.status(400).json({ message: 'Email is required' });
  }

  try {
    const { employee } = await getEmployeeByEmail(email);

    if (!employee) {
      return res.status(404).json({ message: 'Email not found' });
    }

    // Log manual verification
    await db.from('audit_logs').insert({
      action: 'EMAIL_VERIFIED_MANUAL',
      module: 'authentication',
      notes: JSON.stringify({
        email,
        timestamp: new Date().toISOString()
      })
    }).catch(err => console.error('Audit log error:', err));

    console.log('[EMAIL_VERIFY_MANUAL] Email manually verified:', email);
    return res.json({ 
      success: true, 
      message: 'Email verified successfully',
      verified: true 
    });
  } catch (err) {
    console.error('[EMAIL_VERIFY_MANUAL] Error:', err);
    return res.status(500).json({ message: 'Error verifying email', error: err.message });
  }
});

// Forgot password - verify OTP and update password
app.post('/auth/reset-password-otp', async (req, res) => {
  const { email, otp, newPassword, confirmPassword } = req.body;
  const clientIp = req.ip || req.connection.remoteAddress || 'unknown';

  if (!email || !otp || !newPassword || !confirmPassword) {
    return res.status(400).json({ message: 'Missing required fields' });
  }

  if (newPassword !== confirmPassword) {
    // Log password mismatch attempt
    try {
      await db.from('audit_logs').insert({
        action: 'PASSWORD_RESET_MISMATCH',
        module: 'authentication',
        notes: JSON.stringify({
          email,
          clientIp,
          timestamp: new Date().toISOString()
        })
      });
    } catch (auditErr) {
      console.error('Audit log error:', auditErr);
    }

    return res.status(400).json({ message: 'Passwords do not match' });
  }

  // Validate password strength
  if (newPassword.length < 8) {
    return res.status(400).json({ message: 'Password must be at least 8 characters long' });
  }

  // Check rate limiting for reset attempts
  const resetLimitCheck = authMiddleware.isResetRateLimited(email);
  if (resetLimitCheck.limited) {
    // Log rate limit exceeded
    try {
      await db.from('audit_logs').insert({
        action: 'PASSWORD_RESET_RATE_LIMIT_EXCEEDED',
        module: 'authentication',
        notes: JSON.stringify({
          email,
          clientIp,
          timestamp: new Date().toISOString()
        })
      });
    } catch (auditErr) {
      console.error('Audit log error:', auditErr);
    }

    return res.status(429).json({ 
      message: 'Too many password reset attempts. Please try again later.',
      retryAfter: Math.ceil((resetLimitCheck.resetTime - Date.now()) / 1000)
    });
  }

  try {
    const { employee, account } = await getEmployeeByEmail(email);

    if (!employee || !account) {
      // Log failed reset attempt
      try {
        await db.from('audit_logs').insert({
          action: 'PASSWORD_RESET_FAILED_NOT_FOUND',
          module: 'authentication',
          notes: JSON.stringify({
            email,
            clientIp,
            timestamp: new Date().toISOString()
          })
        });
      } catch (auditErr) {
        console.error('Audit log error:', auditErr);
      }

      return res.status(404).json({ message: 'Email not found' });
    }

    if (account.account_status && account.account_status.toUpperCase() !== 'ACTIVE') {
      return res.status(401).json({ message: 'Account is inactive' });
    }

    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseKey) {
      return res.status(500).json({ message: 'Supabase auth not configured' });
    }

    const verifyResponse = await fetch(`${supabaseUrl}/auth/v1/verify`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: supabaseKey,
        Authorization: `Bearer ${supabaseKey}`
      },
      body: JSON.stringify({
        type: 'email',
        email: employee.email_address,
        token: otp
      })
    });

    if (!verifyResponse.ok) {
      authMiddleware.recordResetAttempt(email);
      const text = await verifyResponse.text();
      
      // Log invalid OTP
      try {
        await db.from('audit_logs').insert({
          action: 'PASSWORD_RESET_INVALID_OTP',
          module: 'authentication',
          notes: JSON.stringify({
            email,
            clientIp,
            attempt: authMiddleware.isResetRateLimited(email).attempts,
            timestamp: new Date().toISOString()
          })
        });
      } catch (auditErr) {
        console.error('Audit log error:', auditErr);
      }

      return res.status(400).json({ message: text || 'Invalid OTP' });
    }

    authMiddleware.clearResetAttempts(email);
    const hashedPassword = await bcrypt.hash(newPassword, 10);
    const { error: updateError } = await db
      .from('user_accounts')
      .update({ password_hash: hashedPassword })
      .eq('user_id', account.user_id);

    if (updateError) {
      // Log update error
      try {
        await db.from('audit_logs').insert({
          action: 'PASSWORD_RESET_FAILED_UPDATE',
          module: 'authentication',
          notes: JSON.stringify({
            email,
            clientIp,
            error: updateError.message,
            timestamp: new Date().toISOString()
          })
        });
      } catch (auditErr) {
        console.error('Audit log error:', auditErr);
      }

      return res.status(500).json({ message: 'Failed to update password' });
    }

    // Log successful password reset
    const safeUserId = account.user_id ? Number(account.user_id) : null;
    try {
      await db.from('audit_logs').insert({
        user_id: safeUserId,
        action: 'PASSWORD_RESET_SUCCESS',
        module: 'authentication',
        notes: JSON.stringify({
          email,
          clientIp,
          timestamp: new Date().toISOString()
        })
      });
    } catch (auditErr) {
      console.error('Audit log error:', auditErr);
    }

    return res.json({ success: true, message: 'Password updated successfully' });
  } catch (err) {
    // Log unexpected error
    try {
      await db.from('audit_logs').insert({
        action: 'PASSWORD_RESET_ERROR',
        module: 'authentication',
        notes: JSON.stringify({
          email,
          clientIp,
          error: err.message,
          timestamp: new Date().toISOString()
        })
      });
    } catch (auditErr) {
      console.error('Audit log error:', auditErr);
    }

    return res.status(500).json({ message: 'Database error', error: err.message });
  }
});

// Verify session
app.get('/auth/me', authenticateToken, async (req, res) => {
  try {
    const employeeCode = req.user.employeeCode;
    const { employee, account, roleName, departmentName } = await getEmployeeByCode(employeeCode);

    if (!employee || !account || !roleName) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Verify role from JWT matches database (detect tampering)
    if (roleName !== req.user.role) {
      console.warn(`Role mismatch detected for ${req.user.employeeCode}: JWT=${req.user.role}, DB=${roleName}`);
      // Return correct role from database (server of truth)
    }

    res.json({
      user: {
        id: account.user_id,
        employeeId: employee.employee_code,
        employeeName: buildEmployeeName(employee),
        userRole: roleName, // Use verified role from database
        email: employee.email_address,
        email_verified_at: employee.email_verified_at || null,
        status: account.account_status || employee.record_status,
        profileImage: employee.profile_image_url || null,
        profile_image_url: employee.profile_image_url || null,
        department: departmentName,
        position: employee.position,
        lastLogin: account.last_login || null
      }
    });
  } catch (err) {
    return res.status(500).json({ message: 'Database error', error: err.message });
  }
});

// Setup password - Employee uses activation token to set password
app.post('/auth/setup-password', async (req, res) => {
  const { token, password, confirmPassword } = req.body;

  // Validate input
  if (!token || !password || !confirmPassword) {
    return res.status(400).json({ message: 'Missing required fields' });
  }

  if (password !== confirmPassword) {
    return res.status(400).json({ message: 'Passwords do not match' });
  }

  if (password.length < 6) {
    return res.status(400).json({ message: 'Password must be at least 6 characters' });
  }

  try {
    if (!global.activationTokens || !global.activationTokens[token]) {
      return res.status(404).json({ message: 'Invalid or expired activation token' });
    }

    const activation = global.activationTokens[token];
    if (Date.now() > activation.expiresAt) {
      delete global.activationTokens[token];
      return res.status(400).json({ message: 'Activation token has expired' });
    }

    // Hash the new password
    const hash = await bcrypt.hash(password, 10);

    // Update user account
    const { error: updateError } = await db
      .from('user_accounts')
      .update({
        password_hash: hash,
        account_status: 'ACTIVE'
      })
      .eq('user_id', activation.userId);

    if (updateError) {
      return res.status(500).json({ message: 'Failed to update password' });
    }

    delete global.activationTokens[token];

    res.json({
      success: true,
      message: 'Password set successfully! You can now login.',
      redirectUrl: '/login'
    });
  } catch (err) {
    return res.status(500).json({ message: 'Database error', error: err.message });
  }
});

// Forgot Password - Step 1: Send verification code
app.post('/auth/forgot-password', async (req, res) => {
  const { email } = req.body;

  if (!email) {
    return res.status(400).json({ message: 'Email is required' });
  }

  try {
    // Check if email exists
    const { data: employee, error } = await db
      .from('employees')
      .select('employee_id, email_address, user_accounts (user_id)')
      .eq('email_address', email)
      .single();

    if (error || !employee) {
      // Don't reveal if email exists
      return res.json({ success: true, message: 'If email exists, verification code has been sent' });
    }

    // Generate 6-digit verification code
    const verificationCode = Math.floor(100000 + Math.random() * 900000).toString();
    const expiryTime = new Date();
    expiryTime.setMinutes(expiryTime.getMinutes() + 10); // Expires in 10 minutes

    // Store verification code (temporarily in memory - for production use Redis or database)
    if (!global.passwordResetCodes) {
      global.passwordResetCodes = {};
    }
    global.passwordResetCodes[email] = {
      code: verificationCode,
      expiry: expiryTime.getTime(),
      userId: Array.isArray(employee.user_accounts) ? employee.user_accounts[0]?.user_id : employee.user_accounts?.user_id
    };

    // TODO: Send email with verification code
    // For development, log to console
    console.log(`🔐 Password Reset Code for ${email}: ${verificationCode}`);

    res.json({
      success: true,
      message: 'Verification code sent to email',
      // For development only - remove in production
      devCode: verificationCode
    });
  } catch (err) {
    return res.status(500).json({ message: 'Database error', error: err.message });
  }
});

// Forgot Password - Step 2: Verify code and reset password
app.post('/auth/reset-password', async (req, res) => {
  const { email, verificationCode, newPassword, confirmPassword } = req.body;

  if (!email || !verificationCode || !newPassword || !confirmPassword) {
    return res.status(400).json({ message: 'Missing required fields' });
  }

  if (newPassword !== confirmPassword) {
    return res.status(400).json({ message: 'Passwords do not match' });
  }

  if (newPassword.length < 6) {
    return res.status(400).json({ message: 'Password must be at least 6 characters' });
  }

  // Check verification code
  if (!global.passwordResetCodes || !global.passwordResetCodes[email]) {
    return res.status(400).json({ message: 'Invalid verification code' });
  }

  const { code, expiry, userId } = global.passwordResetCodes[email];

  // Check if code matches and hasn't expired
  if (code !== verificationCode || Date.now() > expiry) {
    delete global.passwordResetCodes[email];
    return res.status(400).json({ message: 'Invalid or expired verification code' });
  }

  try {
    if (!userId) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Hash new password
    const hash = await bcrypt.hash(newPassword, 10);

    // Update password
    const { error: updateError } = await db
      .from('user_accounts')
      .update({ password_hash: hash })
      .eq('user_id', userId);

    if (updateError) {
      return res.status(500).json({ message: 'Failed to reset password' });
    }

    // Clear verification code
    delete global.passwordResetCodes[email];

    res.json({
      success: true,
      message: 'Password reset successfully'
    });
  } catch (err) {
    return res.status(500).json({ message: 'Database error', error: err.message });
  }
});

// Verify activation token
app.get('/auth/verify-token/:token', async (req, res) => {
  const { token } = req.params;

  try {
    if (!global.activationTokens || !global.activationTokens[token]) {
      return res.status(404).json({ message: 'Invalid activation token' });
    }

    const activation = global.activationTokens[token];
    if (Date.now() > activation.expiresAt) {
      delete global.activationTokens[token];
      return res.status(400).json({ message: 'Activation token has expired' });
    }

    const { data: employee, error } = await db
      .from('employees')
      .select('employee_code, first_name, middle_name, last_name, email_address')
      .eq('employee_id', activation.employeeId)
      .single();

    if (error || !employee) {
      return res.status(404).json({ message: 'Invalid activation token' });
    }

    res.json({
      valid: true,
      user: {
        employeeId: employee.employee_code,
        name: buildEmployeeName(employee),
        email: employee.email_address
      }
    });
  } catch (err) {
    return res.status(500).json({ message: 'Database error', error: err.message });
  }
});

// ========== ATTENDANCE ROUTES ==========

/**
 * Cross-Day Attendance Handling
 * =============================
 * Supports overnight shifts (e.g., Monday 8AM check-in, Tuesday 8AM check-out)
 * 
 * Rules:
 * 1. Each employee can have only ONE open (incomplete) attendance record at a time
 * 2. If employee has open record from PREVIOUS day, next check-in closes previous day
 * 3. If employee has open record from TODAY, next check-in must be check-out
 * 4. Check-out times are recorded with check_out_date (may differ from attendance_date)
 */

// Check-in/Check-out
app.post('/attendance/check-in', authenticateToken, upload.single('image'), async (req, res) => {
  const { employeeId, method, source, qrCode } = req.body;
  const targetEmployeeCode = employeeId || req.user.employeeCode;
  const today = getManilaDateString();

  try {
    const { employee } = await getEmployeeByCode(targetEmployeeCode);

    if (!employee) {
      return res.status(404).json({ message: 'User not found' });
    }

    const now = new Date();
    const timeString = getManilaTimeString();

    // CRITICAL: Get ANY open attendance record for this employee (cross-day check)
    // This ensures we never create multiple open records
    const { data: allOpenAttendance, error: openError } = await db
      .from('attendance')
      .select('*')
      .eq('employee_id', employee.employee_id)
      .is('check_out_time', null)  // Open records have no check_out_time
      .is('check_out_date', null)  // And no check_out_date
      .order('attendance_date', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (openError) {
      console.error('[Attendance] Error checking for open records:', openError);
      return res.status(500).json({ message: 'Database error checking attendance' });
    }

    // Get today's attendance record (for same-day check logic)
    const { data: todayAttendance } = await db
      .from('attendance')
      .select('*')
      .eq('employee_id', employee.employee_id)
      .eq('attendance_date', today)
      .maybeSingle();

    // Determine scan type and target record
    // This handles both same-day and cross-day scenarios
    let scanType = 'check_in';
    let targetRecord = null;
    let crossDayScenario = false;

    if (allOpenAttendance) {
      // There IS an open record
      if (allOpenAttendance.attendance_date === today) {
        // Open record is from TODAY
        if (allOpenAttendance.check_in_time && !allOpenAttendance.check_out_time) {
          // Today's record has check-in but no check-out → This should be CHECK-OUT
          scanType = 'check_out';
          targetRecord = allOpenAttendance;
          console.log('[Attendance] Same-day checkout detected for employee:', employee.employee_code);
        }
      } else {
        // Open record is from PREVIOUS day (cross-day scenario)
        // This scan should CLOSE the previous day's record
        scanType = 'check_out';
        targetRecord = allOpenAttendance;
        crossDayScenario = true;
        console.log(
          '[Attendance] Cross-day checkout detected:',
          'Employee:', employee.employee_code,
          'Previous open record date:', allOpenAttendance.attendance_date,
          'Today:', today
        );
      }
    } else if (todayAttendance?.check_in_time && !todayAttendance?.check_out_time) {
      // Redundant check: no open record found but today has check-in without check-out
      // This shouldn't happen but is a safety fallback
      scanType = 'check_out';
      targetRecord = todayAttendance;
      console.warn('[Attendance] Inconsistent state - open record not detected but today has open check-in');
    } else {
      // No open record - this will be a NEW check-in
      scanType = 'check_in';
      targetRecord = null;
    }

    const scanCooldownSeconds = 10;
    const { data: recentScan } = await db
      .from('attendance_scans')
      .select('scan_id, scan_timestamp, scan_type')
      .eq('employee_id', employee.employee_id)
      .order('scan_timestamp', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (recentScan?.scan_timestamp) {
      const lastScanTime = new Date(recentScan.scan_timestamp).getTime();
      if (recentScan.scan_type === scanType && (now.getTime() - lastScanTime) < scanCooldownSeconds * 1000) {
        return res.json({ action: scanType, message: 'Scan already processed', duplicate: true });
      }
    }

    let qrCodeId = null;
    if (qrCode) {
      const { data: qrRow } = await db
        .from('qr_codes')
        .select('qrcode_id, qr_value')
        .eq('employee_id', employee.employee_id)
        .eq('qr_value', qrCode)
        .eq('status', 'ACTIVE')
        .order('date_issued', { ascending: false })
        .limit(1)
        .maybeSingle();

      qrCodeId = qrRow?.qrcode_id || null;
      if (!qrCodeId && qrCode === employee.employee_code) {
        const { data: latestQr } = await db
          .from('qr_codes')
          .select('qrcode_id')
          .eq('employee_id', employee.employee_id)
          .eq('status', 'ACTIVE')
          .order('date_issued', { ascending: false })
          .limit(1)
          .maybeSingle();
        qrCodeId = latestQr?.qrcode_id || null;
      }
    }

    const { data: scanData, error: scanError } = await db
      .from('attendance_scans')
      .insert({
        employee_id: employee.employee_id,
        qrcode_id: qrCodeId,
        scan_timestamp: now.toISOString(),
        scan_type: scanType,
        scan_result: 'accepted',
        recorded_by: req.user.userId || null
      })
      .select()
      .single();

    if (scanError) {
      console.error('[Attendance] Failed to record attendance scan:', scanError);
      return res.status(500).json({ message: 'Failed to record attendance scan' });
    }

    // ========== CHECK-IN LOGIC ==========
    if (scanType === 'check_in') {
      // ENFORCE: Only create new check-in if no open records exist
      // (This is guaranteed by our detection logic above)
      
      if (todayAttendance?.check_in_time && todayAttendance?.check_out_time) {
        // Today's attendance already completed - cannot check in again
        console.warn('[Attendance] Check-in rejected - already completed for today:', employee.employee_code);
        return res.status(400).json({ 
          message: 'Attendance already completed for today',
          action: 'check_in'
        });
      }
      
      if (todayAttendance?.check_in_time && !todayAttendance?.check_out_time) {
        // Today's record has check-in but no check-out - request check-out instead
        console.warn('[Attendance] Check-in rejected - already checked in today:', employee.employee_code);
        return res.status(400).json({ 
          message: 'Employee already checked in today. Please check out first.',
          action: 'check_in',
          alreadyCheckedIn: true
        });
      }

      // Create new attendance record for today
      console.log('[Attendance] Creating check-in record for:', employee.employee_code, 'Date:', today);
      
      const { data: newAttendance, error: insertError } = await db
        .from('attendance')
        .insert({
          employee_id: employee.employee_id,
          attendance_date: today,
          status: 'Incomplete',
          check_in_time: timeString,
          check_in_scan_id: scanData?.scan_id || null,
          created_at: now.toISOString()
        })
        .select()
        .single();

      if (insertError) {
        console.error('[Attendance] Failed to create check-in record:', insertError);
        return res.status(500).json({ message: 'Failed to record attendance' });
      }

      return res.json({ 
        action: 'check_in', 
        message: 'Check-in recorded successfully',
        employee: {
          id: employee.employee_code,
          name: buildEmployeeName(employee),
          checkInTime: timeString,
          checkInDate: today
        }
      });
    }

    // ========== CHECK-OUT LOGIC ==========
    if (scanType === 'check_out') {
      if (!targetRecord) {
        console.warn('[Attendance] Check-out rejected - no open record found:', employee.employee_code);
        return res.status(400).json({ message: 'Employee has not checked in yet' });
      }

      if (!targetRecord.check_in_time) {
        console.warn('[Attendance] Check-out rejected - record has no check-in time:', employee.employee_code);
        return res.status(400).json({ message: 'Invalid attendance record: no check-in time' });
      }

      if (targetRecord.check_out_time) {
        console.warn('[Attendance] Check-out rejected - already checked out:', employee.employee_code);
        return res.status(400).json({ message: 'Employee already checked out' });
      }

      // Calculate hours worked (cross-day safe)
      const checkInDateTime = new Date(`${targetRecord.attendance_date}T${targetRecord.check_in_time}`);
      const checkOutDateTime = new Date(`${today}T${timeString}`);
      const hoursWorked = Math.max(0, (checkOutDateTime - checkInDateTime) / 3600000);

      console.log(
        '[Attendance] Recording check-out:',
        'Employee:', employee.employee_code,
        'CheckIn Date:', targetRecord.attendance_date,
        'CheckOut Date:', today,
        'Hours:', hoursWorked.toFixed(2)
      );

      const { data: updatedRecord, error: updateError } = await db
        .from('attendance')
        .update({
          check_out_time: timeString,
          check_out_date: today,
          check_out_scan_id: scanData?.scan_id || null,
          hours_worked: Number(hoursWorked.toFixed(2)),
          status: 'Present'
        })
        .eq('attendance_id', targetRecord.attendance_id)
        .select()
        .single();

      if (updateError) {
        console.error('[Attendance] Failed to record check-out:', updateError);
        return res.status(500).json({ message: 'Failed to record check-out' });
      }

      // Response message depends on whether this was same-day or cross-day
      let message = 'Check-out recorded successfully';
      if (crossDayScenario) {
        message = `Cross-day shift completed (checked in ${targetRecord.attendance_date}, checked out ${today})`;
      }

      return res.json({ 
        action: 'check_out', 
        message,
        employee: {
          id: employee.employee_code,
          name: buildEmployeeName(employee),
          checkInDate: targetRecord.attendance_date,
          checkOutDate: today,
          checkOutTime: timeString,
          hoursWorked: Number(hoursWorked.toFixed(2)),
          crossDayShift: crossDayScenario
        }
      });
    }

    return res.status(400).json({ message: 'Invalid scan type' });
  } catch (err) {
    console.error('[Attendance] Error:', err);
    return res.status(500).json({ message: 'Database error', error: err.message });
  }
});

// Get attendance records
app.get('/attendance/records', authenticateToken, async (req, res) => {
  const { startDate, endDate, department, employeeId } = req.query;
  
  console.log('[ATTENDANCE] Fetching records with params:', { startDate, endDate, department, employeeId });
  
  try {
    let query = db
      .from('attendance')
      .select('*, employees:employee_id(employee_code, first_name, middle_name, last_name, departments:department_id(department_name), user_accounts (roles:role_id(role_name))), attendance_issues (issue_id, status, issue_type, description, resolution_notes)')
      .order('attendance_date', { ascending: false })
      .order('check_in_time', { ascending: false });

    if (startDate) {
      query = query.gte('attendance_date', startDate);
    }
    if (endDate) {
      query = query.lte('attendance_date', endDate);
    }

    const { data: records, error } = await query;

    if (error) {
      console.error('[ATTENDANCE] Database error:', error);
      return res.status(500).json({ message: 'Database error' });
    }

    console.log('[ATTENDANCE] Found records:', records?.length || 0);

    let filteredRecords = records || [];

    const transformed = filteredRecords.map((r) => {
      const employee = r.employees || {};
      const account = Array.isArray(employee.user_accounts) ? employee.user_accounts[0] : employee.user_accounts;
      const roleName = account?.roles?.role_name || 'employee';
      const attendanceDate = r.attendance_date;
      const checkIn = formatDateTimeWithTimezone(attendanceDate, r.check_in_time);
      // Use check_out_date for overnight shifts (when checkout is on different day than check-in)
      const checkOutDate = r.check_out_date || attendanceDate;
      const checkOut = formatDateTimeWithTimezone(checkOutDate, r.check_out_time);

      // Extract issue info from attendance_issues array
      let issueStatus = null;
      let issueType = null;
      let issueReason = null;
      let issueProofUrl = null;
      let correctionStatus = null;
      let correctionNotes = null;
      let correctionDetails = null;

      // Check for absence issue
      const absenceIssue = (r.attendance_issues || []).find((i) => String(i.issue_type || '').toLowerCase() === 'absence');
      if (absenceIssue) {
        try {
          const absenceDetails = typeof absenceIssue.description === 'string' 
            ? JSON.parse(absenceIssue.description) 
            : absenceIssue.description;
          issueReason = absenceDetails?.reason || null;
          issueProofUrl = absenceDetails?.proofUrl || null;
          issueStatus = 'Absent - Reported';
          issueType = 'Absence';
        } catch (e) {
          console.error('Failed to parse absence issue:', e);
        }
      }

      // Check for correction issue
      const correctionIssue = (r.attendance_issues || []).find((i) => String(i.issue_type || '').toLowerCase() === 'correction');
      if (correctionIssue) {
        try {
          correctionDetails = typeof correctionIssue.description === 'string' 
            ? JSON.parse(correctionIssue.description) 
            : correctionIssue.description;
          correctionStatus = correctionIssue.status || 'Pending'; // Pending, Approved, Denied, Viewed
          correctionNotes = correctionIssue.resolution_notes || null;
          issueType = 'Correction';
          
          // Extract proof details from correction if available
          if (correctionDetails && !issueProofUrl) {
            issueProofUrl = correctionDetails.proofUrl || null;
          }
        } catch (e) {
          console.error('Failed to parse correction issue:', e);
        }
      }

      // Calculate attendance status: Present if any time exists, otherwise Absent
      const hasAnyAttendanceTime = Boolean(checkIn || checkOut);
      let attendanceStatus = 'Absent';
      if (hasAnyAttendanceTime) {
        attendanceStatus = 'Present';
      }

      return {
        id: r.attendance_id,
        employee_id: employee.employee_code,
        name: buildEmployeeName(employee),
        department: employee.departments?.department_name || 'N/A',
        date: attendanceDate,
        check_in: checkIn,
        check_out: checkOut,
        attendance_status: attendanceStatus,
        issue_status: issueStatus,
        issue_type: issueType,
        issue_reason: issueReason,
        issue_proof_url: issueProofUrl,
        correction_status: correctionStatus,
        correction_notes: correctionNotes,
        correction_details: correctionDetails,
        correction_issue_id: correctionIssue?.issue_id || null,
        correction_proof_url: correctionDetails?.proofUrl || null,
        correction_proof_path: correctionDetails?.proofPath || null,
        correction_proof_bucket: correctionDetails?.proofBucket || null,
        approval_status: (r.attendance_issues || []).find((i) => i.issue_type === 'Approval')?.status || 'Pending',
        users: {
          employee_id: employee.employee_code,
          name: buildEmployeeName(employee),
          role: roleName,
          department: employee.departments?.department_name || 'N/A'
        }
      };
    });

    let finalRecords = transformed;
    if (department && department !== 'all') {
      finalRecords = finalRecords.filter(r => r.department === department);
    }
    if (employeeId) {
      console.log('[ATTENDANCE] Filtering by employeeId:', employeeId);
      finalRecords = finalRecords.filter(r => r.employee_id === employeeId);
      console.log('[ATTENDANCE] After employee filter:', finalRecords.length);

      // Also fetch pending absence notifications for this employee
      const { data: pendingAbsences, error: absenceError } = await db
        .from('attendance_issues')
        .select(`
          issue_id,
          issue_type,
          description,
          status,
          reported_at,
          attendance:attendance_id (
            attendance_id,
            attendance_date,
            check_in_time,
            check_out_time,
            employee_id,
            employees:employee_id (
              employee_code,
              first_name,
              middle_name,
              last_name,
              departments:department_id (department_name)
            )
          )
        `)
        .eq('issue_type', 'Absence')
        .eq('status', 'Pending');

      if (!absenceError && pendingAbsences) {
        console.log('[ATTENDANCE] Found pending absences:', pendingAbsences.length);
        
        // Filter for this employee only and add to records
        pendingAbsences.forEach(absence => {
          const attendance = absence.attendance || {};
          const employee = attendance.employees || {};
          
          if (employee.employee_code === employeeId) {
            // Check if this date already exists in finalRecords
            const existingRecord = finalRecords.find(r => r.date === attendance.attendance_date);
            
            if (!existingRecord) {
              // Parse absence details
              let absenceDetails = {};
              try {
                absenceDetails = typeof absence.description === 'string' 
                  ? JSON.parse(absence.description) 
                  : absence.description;
              } catch (e) {
                console.error('Failed to parse absence description:', e);
              }

              // Add as a new record
              finalRecords.push({
                id: attendance.attendance_id,
                employee_id: employee.employee_code,
                name: buildEmployeeName(employee),
                department: employee.departments?.department_name || 'N/A',
                date: attendance.attendance_date,
                check_in: null,
                check_out: null,
                attendance_status: 'Notified Absence',
                issue_status: 'Pending',
                issue_type: 'Absence',
                issue_reason: absenceDetails?.reason || 'No reason provided',
                issue_proof_url: absenceDetails?.proofUrl || null,
                approval_status: 'Pending',
                users: {
                  employee_id: employee.employee_code,
                  name: buildEmployeeName(employee),
                  role: 'employee',
                  department: employee.departments?.department_name || 'N/A'
                }
              });
            }
          }
        });

        // Re-sort by date after adding absence notifications
        finalRecords.sort((a, b) => new Date(b.date) - new Date(a.date));
      }
    }

    console.log('[ATTENDANCE] Returning records:', finalRecords.length);
    res.json({ 
      records: finalRecords,
      timezone: 'Asia/Manila',
      timezoneOffset: '+08:00',
      serverTime: getManilaDateString() + ' ' + getManilaTimeString()
    });
  } catch (err) {
    return res.status(500).json({ message: 'Database error', error: err.message });
  }
});

// Update attendance record (admin only)
app.put('/attendance/records/:id', authenticateToken, async (req, res) => {
  if (req.user.role !== 'admin' && req.user.role !== 'super_admin') {
    return res.status(403).json({ message: 'Unauthorized' });
  }

  const { id } = req.params;
  const { role, status, permissions, confirmPassword } = req.body;

if (!confirmPassword) {
  return res.status(400).json({ message: 'Password confirmation is required' });
}

try {
  const { data: requestingUser, error: reqUserError } = await db
    .from('user_accounts')
    .select('password_hash')
    .eq('user_id', req.user.userId)
    .single();

  if (reqUserError || !requestingUser) {
    return res.status(404).json({ message: 'Requesting user not found' });
  }

  const passwordValid = await bcrypt.compare(confirmPassword, requestingUser.password_hash);
  if (!passwordValid) {
    return res.status(401).json({ message: 'Incorrect password. Please try again.' });
  }
} catch (err) {
  return res.status(500).json({ message: 'Password verification failed', error: err.message });
}

  const normalizeTimeInput = (value) => {
    if (!value) return null;
    const trimmed = String(value).trim();
    const ampmMatch = trimmed.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM)$/i);
    if (ampmMatch) {
      let hours = parseInt(ampmMatch[1], 10);
      const minutes = ampmMatch[2];
      const seconds = ampmMatch[3] || '00';
      const meridiem = ampmMatch[4].toUpperCase();
      if (meridiem === 'PM' && hours < 12) hours += 12;
      if (meridiem === 'AM' && hours === 12) hours = 0;
      return `${String(hours).padStart(2, '0')}:${minutes}:${seconds}`;
    }
    const timeMatch = trimmed.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
    if (timeMatch) {
      const hours = String(timeMatch[1]).padStart(2, '0');
      const minutes = timeMatch[2];
      const seconds = timeMatch[3] || '00';
      return `${hours}:${minutes}:${seconds}`;
    }
    return null;
  };

  try {
    const checkInTime = normalizeTimeInput(check_in);
    const checkOutTime = normalizeTimeInput(check_out);

    // Determine attendance status based on corrected times
    let attendanceStatus = null;
    if (checkInTime) {
      // If check-in time is provided, mark as Present
      attendanceStatus = 'Present';
    } else if (!checkInTime && !checkOutTime) {
      // If both times are null/empty, mark as Absent
      attendanceStatus = 'Absent';
    }

    const updateData = {
      check_in_time: checkInTime || null,
      check_out_time: checkOutTime || null
    };

    // Note: attendance_status is calculated from check_in/check_out times, not stored in DB

    const { error } = await db
      .from('attendance')
      .update(updateData)
      .eq('attendance_id', id);

    if (error) {
      return res.status(500).json({ message: 'Failed to update attendance' });
    }

    // Log audit trail
    try {
      await db
        .from('audit_logs')
        .insert({
          user_id: req.user.userId,
          action: 'ATTENDANCE_MANUAL_EDIT',
          module: 'attendance',
          notes: JSON.stringify({
            attendanceId: id,
            checkIn: checkInTime,
            checkOut: checkOutTime,
            statusSet: attendanceStatus
          })
        });
    } catch (auditErr) {
      console.error('Audit log error:', auditErr);
    }

    res.json({ 
      success: true, 
      message: 'Attendance updated successfully',
      statusUpdated: !!attendanceStatus
    });
  } catch (err) {
    return res.status(500).json({ message: 'Database error', error: err.message });
  }
});

// Delete attendance record (admin only)
app.delete('/attendance/records/:id', authenticateToken, async (req, res) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ message: 'Unauthorized. Only Admin can delete attendance records.' });
  }

  const { id } = req.params;

  try {
    const { data: existing, error: findError } = await db
      .from('attendance')
      .select('attendance_id, employee_id, attendance_date, check_in_time, check_out_time')
      .eq('attendance_id', id)
      .single();

    if (findError || !existing) {
      return res.status(404).json({ message: 'Attendance record not found' });
    }

    const { error: deleteError } = await db
      .from('attendance')
      .delete()
      .eq('attendance_id', id);

    if (deleteError) {
      return res.status(500).json({ message: 'Failed to delete attendance record' });
    }

    await db
      .from('audit_logs')
      .insert({
        user_id: req.user.userId,
        action: 'ATTENDANCE_RECORD_DELETED',
        module: 'attendance',
        notes: JSON.stringify({
          attendanceId: existing.attendance_id,
          employeeId: existing.employee_id,
          attendanceDate: existing.attendance_date,
          checkIn: existing.check_in_time,
          checkOut: existing.check_out_time
        })
      });

    return res.json({ success: true, message: 'Attendance record deleted successfully' });
  } catch (err) {
    return res.status(500).json({ message: 'Database error', error: err.message });
  }
});

// Approve/Deny attendance correction request (admin/manager only)
app.put('/attendance/correction-request/:issueId/approval', authenticateToken, async (req, res) => {
  // Only Admin and Manager can approve/deny, not Super Admin
  if (req.user.role !== 'admin' && req.user.role !== 'manager') {
    return res.status(403).json({ message: 'Unauthorized. Super Admin can only edit attendance records.' });
  }

  const { issueId } = req.params;
  const { status, resolutionNotes } = req.body;

  if (!status || !['Approved', 'Denied'].includes(status)) {
    return res.status(400).json({ message: 'Invalid approval status' });
  }

  try {
    // Get the correction request
    const { data: issue, error: fetchError } = await db
      .from('attendance_issues')
      .select('issue_id, attendance_id, description, status')
      .eq('issue_id', issueId)
      .eq('issue_type', 'Correction')
      .single();

    if (fetchError || !issue) {
      return res.status(404).json({ message: 'Correction request not found' });
    }

    if (issue.status !== 'Pending') {
      return res.status(400).json({ message: 'This correction request has already been processed' });
    }

    // Parse correction details
    let correctionDetails = {};
    try {
      correctionDetails = JSON.parse(issue.description || '{}');
    } catch (e) {
      return res.status(400).json({ message: 'Invalid correction request data' });
    }

    // Update the correction request status
    const { error: updateIssueError } = await db
      .from('attendance_issues')
      .update({
        status,
        resolved_by: req.user.userId,
        resolved_at: new Date().toISOString(),
        resolution_notes: resolutionNotes || `Correction ${status.toLowerCase()}`
      })
      .eq('issue_id', issueId);

    if (updateIssueError) {
      return res.status(500).json({ message: 'Failed to update correction request' });
    }

    // Approved corrections are tracked in attendance_issues only.
    // Original attendance check-in/check-out values remain unchanged.

    // Log audit
    try {
      await db
        .from('audit_logs')
        .insert({
          user_id: req.user.userId,
          action: status === 'Approved' ? 'ATTENDANCE_CORRECTION_APPROVED' : 'ATTENDANCE_CORRECTION_DENIED',
          module: 'attendance',
          notes: JSON.stringify({
            issueId,
            attendanceId: issue.attendance_id,
            correctionDetails,
            resolutionNotes
          })
        });
    } catch (auditErr) {
      console.error('Audit log error:', auditErr);
    }

    res.json({ 
      success: true, 
      message: `Correction request ${status.toLowerCase()} successfully`,
      attendanceUpdated: false
    });
  } catch (err) {
    console.error('Correction approval error:', err);
    return res.status(500).json({ message: 'Failed to process correction approval', error: err.message });
  }
});

// Legacy approval endpoint for backward compatibility
app.put('/attendance/records/:id/approval', authenticateToken, async (req, res) => {
  // Only Admin and Manager can approve/deny, not Super Admin
  if (req.user.role !== 'admin' && req.user.role !== 'manager') {
    return res.status(403).json({ message: 'Unauthorized. Super Admin can only edit attendance records.' });
  }

  const { id } = req.params;
  const { status } = req.body;

  if (!status || !['Approved', 'Denied', 'Pending'].includes(status)) {
    return res.status(400).json({ message: 'Invalid approval status' });
  }

  try {
    // Update attendance_issues table
    const { data: existing } = await db
      .from('attendance_issues')
      .select('issue_id')
      .eq('attendance_id', id)
      .eq('issue_type', 'Approval')
      .limit(1);

    if (existing && existing.length > 0) {
      const { error: updateError } = await db
        .from('attendance_issues')
        .update({
          status,
          resolved_by: req.user.userId || null,
          resolved_at: new Date().toISOString()
        })
        .eq('issue_id', existing[0].issue_id);

      if (updateError) {
        return res.status(500).json({ message: 'Failed to update approval status' });
      }
    } else {
      const { error: insertError } = await db
        .from('attendance_issues')
        .insert({
          attendance_id: id,
          issue_type: 'Approval',
          description: 'Attendance approval update',
          reported_by: req.user.userId || null,
          reported_at: new Date().toISOString(),
          status,
          resolved_by: req.user.userId || null,
          resolved_at: new Date().toISOString()
        });

      if (insertError) {
        return res.status(500).json({ message: 'Failed to update approval status' });
      }
    }

    // Note: attendance_status is calculated from check_in/check_out times, not stored in DB
    // Approval doesn't change the attendance record itself, only the correction_requests status

    // Log audit trail
    try {
      await db
        .from('audit_logs')
        .insert({
          user_id: req.user.userId,
          action: status === 'Approved' ? 'ATTENDANCE_APPROVED' : status === 'Denied' ? 'ATTENDANCE_DENIED' : 'ATTENDANCE_PENDING',
          module: 'attendance',
          notes: JSON.stringify({
            attendanceId: id,
            approvalStatus: status,
            syncedStatus: status === 'Approved' ? 'Present' : status === 'Denied' ? 'Absent' : 'Unchanged'
          })
        });
    } catch (auditErr) {
      console.error('Audit log error:', auditErr);
    }

    res.json({ 
      success: true, 
      message: `Attendance ${status.toLowerCase()}`,
      statusSynced: status === 'Approved' || status === 'Denied'
    });
  } catch (err) {
    return res.status(500).json({ message: 'Database error', error: err.message });
  }
});

// ========== QR ATTENDANCE ROUTES ==========

// Get employee attendance status for a specific date
app.get('/attendance/employee-status/:employeeId', authenticateToken, async (req, res) => {
  const { employeeId } = req.params;
  const { date } = req.query;
  const normalizedEmployeeId = String(employeeId || '').trim().toUpperCase();
  const targetDate = date || getManilaDateString();

  try {
    const { employee } = await getEmployeeByCode(normalizedEmployeeId);

    if (!employee) {
      return res.status(404).json({ message: 'Employee not found' });
    }

    const { data: attendance, error } = await db
      .from('attendance')
      .select('check_in_time, check_out_time, status')
      .eq('employee_id', employee.employee_id)
      .eq('attendance_date', targetDate)
      .maybeSingle();

    if (error) {
      return res.status(500).json({ message: 'Database error' });
    }

    res.json({
      employeeId: employee.employee_code,
      date: targetDate,
      hasCheckedIn: !!attendance?.check_in_time,
      hasCheckedOut: !!attendance?.check_out_time,
      checkInTime: attendance?.check_in_time || null,
      checkOutTime: attendance?.check_out_time || null,
      status: attendance?.status || 'Not Recorded'
    });
  } catch (err) {
    return res.status(500).json({ message: 'Database error', error: err.message });
  }
});

// QR Attendance Check-In (Admin, Super Admin, Employee, and QR Scanner)
// Supports cross-day shifts (e.g., Monday 8AM check-in, Tuesday 8AM check-out)
app.post('/qr-attendance/check-in', authenticateToken, async (req, res) => {
  const { employeeId, method, source } = req.body;
  const adminId = req.user.employeeCode;
  const adminUserId = req.user.userId;

  // Verify authorized scanner roles
  if (req.user.role !== 'admin' && req.user.role !== 'super_admin' && req.user.role !== 'qr_scanner' && req.user.role !== 'employee') {
    return res.status(403).json({ message: 'Only authorized scanner roles can perform check-in' });
  }

  const normalizedEmployeeId = String(employeeId || '').trim().toUpperCase();
  
  // Validate employee ID is not empty - backend validates format via database lookup
  if (!normalizedEmployeeId) {
    return res.status(400).json({ message: 'Employee ID is required' });
  }

  const today = getManilaDateString();

  try {
    const { employee } = await getEmployeeByCode(normalizedEmployeeId);

    if (!employee) {
      return res.status(404).json({ message: 'Employee not found' });
    }

    // Check if employee is active
    const { employee: fullEmployee } = await getEmployeeByCode(normalizedEmployeeId);
    if (!fullEmployee || fullEmployee.record_status !== 'Active') {
      return res.status(400).json({ message: 'Employee is not active' });
    }

    const now = new Date();
    const timeString = getManilaTimeString();

    // CRITICAL: Check for ANY open attendance record (cross-day safe)
    // This ensures we never create multiple open records
    const { data: openAttendance } = await db
      .from('attendance')
      .select('*')
      .eq('employee_id', employee.employee_id)
      .is('check_out_time', null)
      .is('check_out_date', null)
      .order('attendance_date', { ascending: false })
      .limit(1)
      .maybeSingle();

    // Check for today's attendance record
    const { data: todayAttendance } = await db
      .from('attendance')
      .select('*')
      .eq('employee_id', employee.employee_id)
      .eq('attendance_date', today)
      .maybeSingle();

    // Determine action based on attendance state
    let action = 'check_in';
    let targetRecord = null;
    let isCrossDayCheckout = false;

    if (openAttendance) {
      if (openAttendance.attendance_date === today) {
        // Open record from TODAY - should be check-out
        if (openAttendance.check_in_time && !openAttendance.check_out_time) {
          action = 'check_out';
          targetRecord = openAttendance;
          console.log('[QR Attendance] Same-day checkout detected for:', normalizedEmployeeId);
        }
      } else {
        // Open record from PREVIOUS DAY - this is a cross-day shift
        // The scan should close the previous day and optionally start new day
        action = 'check_out';
        targetRecord = openAttendance;
        isCrossDayCheckout = true;
        console.log('[QR Attendance] Cross-day checkout detected:',
          'Employee:', normalizedEmployeeId,
          'Previous open date:', openAttendance.attendance_date,
          'Today:', today
        );
      }
    } else if (todayAttendance?.check_in_time && !todayAttendance?.check_out_time) {
      // No open record found but today has check-in without check-out (safety check)
      action = 'check_out';
      targetRecord = todayAttendance;
      console.warn('[QR Attendance] Inconsistent state - open record not detected but today has open check-in');
    } else if (todayAttendance?.check_out_time) {
      // Today's attendance already completed
      console.warn('[QR Attendance] Attendance already completed for today:', normalizedEmployeeId);
      return res.status(400).json({ 
        message: 'Employee already checked out for today',
        action: 'check_in',
        duplicate: true
      });
    }

    // Record QR scan
    const { data: scanData, error: scanError } = await db
      .from('attendance_scans')
      .insert({
        employee_id: employee.employee_id,
        scan_timestamp: now.toISOString(),
        scan_type: action,
        scan_result: 'accepted',
        recorded_by: adminUserId || null
      })
      .select()
      .single();

    if (scanError) {
      console.error('[QR Attendance] Failed to record scan:', scanError);
      return res.status(500).json({ message: 'Failed to record scan' });
    }

    // ========== EXECUTE CHECK-IN ==========
    if (action === 'check_in') {
      // Create new attendance record for today
      console.log('[QR Attendance] Creating check-in for:', normalizedEmployeeId, 'Date:', today);
      
      const { error: insertError } = await db
        .from('attendance')
        .insert({
          employee_id: employee.employee_id,
          attendance_date: today,
          status: 'Incomplete',
          check_in_time: timeString,
          check_in_scan_id: scanData?.scan_id || null,
          created_at: now.toISOString()
        });

      if (insertError) {
        console.error('[QR Attendance] Failed to record check-in:', insertError);
        return res.status(500).json({ message: 'Failed to record check-in' });
      }

      // Log audit
      const { error: auditError } = await db.from('audit_logs').insert({
        user_id: adminUserId,
        action: 'QR_CHECK_IN',
        module: 'attendance',
        notes: JSON.stringify({
          adminId,
          adminUserId,
          employeeId: employee.employee_code,
          targetEmployeeId: employee.employee_id,
          method: method || 'qr',
          source: source || 'qr-scanner',
          timestamp: now.toISOString()
        })
      });
      if (auditError) {
        console.error('[QR Attendance] Audit log error:', auditError);
      }

      return res.json({
        action: 'check_in',
        message: 'Check-in recorded successfully',
        employee: {
          id: employee.employee_code,
          name: buildEmployeeName(employee),
          checkInTime: timeString,
          checkInDate: today
        }
      });
    }

    // ========== EXECUTE CHECK-OUT ==========
    if (action === 'check_out') {
      if (!targetRecord || !targetRecord.check_in_time) {
        console.warn('[QR Attendance] Check-out rejected - no valid record:', normalizedEmployeeId);
        return res.status(400).json({ message: 'Employee has not checked in' });
      }

      if (targetRecord.check_out_time) {
        console.warn('[QR Attendance] Check-out rejected - already checked out:', normalizedEmployeeId);
        return res.status(400).json({ message: 'Employee already checked out' });
      }

      // Calculate hours worked (cross-day safe)
      const checkInDateTime = new Date(`${targetRecord.attendance_date}T${targetRecord.check_in_time}`);
      const checkOutDateTime = new Date(`${today}T${timeString}`);
      const hoursWorked = Math.max(0, (checkOutDateTime - checkInDateTime) / 3600000);

      console.log('[QR Attendance] Recording check-out:',
        'Employee:', normalizedEmployeeId,
        'CheckIn Date:', targetRecord.attendance_date,
        'CheckOut Date:', today,
        'Hours:', hoursWorked.toFixed(2)
      );

      const { error: updateError } = await db
        .from('attendance')
        .update({
          check_out_time: timeString,
          check_out_date: today,
          check_out_scan_id: scanData?.scan_id || null,
          hours_worked: Number(hoursWorked.toFixed(2)),
          status: 'Present'
        })
        .eq('attendance_id', targetRecord.attendance_id);

      if (updateError) {
        console.error('[QR Attendance] Failed to record check-out:', updateError);
        return res.status(500).json({ message: 'Failed to record check-out' });
      }

      // Log audit for check-out
      const { error: auditError } = await db.from('audit_logs').insert({
        user_id: adminUserId,
        action: 'QR_CHECK_OUT',
        module: 'attendance',
        notes: JSON.stringify({
          adminId,
          adminUserId,
          employeeId: employee.employee_code,
          targetEmployeeId: employee.employee_id,
          checkInDate: targetRecord.attendance_date,
          checkOutDate: today,
          hoursWorked: hoursWorked.toFixed(2),
          crossDayShift: isCrossDayCheckout,
          method: method || 'qr',
          source: source || 'qr-scanner',
          timestamp: now.toISOString()
        })
      });
      if (auditError) {
        console.error('[QR Attendance] Audit log error:', auditError);
      }

      // Response message depends on scenario
      let message = 'Check-out recorded successfully';
      if (isCrossDayCheckout) {
        message = `Cross-day shift completed (checked in ${targetRecord.attendance_date}, checked out ${today})`;
      }

      return res.json({
        action: 'check_out',
        message,
        employee: {
          id: employee.employee_code,
          name: buildEmployeeName(employee),
          checkInDate: targetRecord.attendance_date,
          checkOutDate: today,
          checkOutTime: timeString,
          hoursWorked: Number(hoursWorked.toFixed(2)),
          crossDayShift: isCrossDayCheckout
        }
      });
    }

    return res.status(400).json({ message: 'Invalid action type' });
  } catch (err) {
    return res.status(500).json({ message: 'Database error', error: err.message });
  }
});

// QR Attendance Check-Out (Admin, Super Admin, Employee, and QR Scanner)
app.post('/qr-attendance/check-out', authenticateToken, async (req, res) => {
  const { employeeId, method, source } = req.body;
  const adminId = req.user.employeeCode;
  const adminUserId = req.user.userId;

  // Verify authorized scanner roles
  if (req.user.role !== 'admin' && req.user.role !== 'super_admin' && req.user.role !== 'qr_scanner' && req.user.role !== 'employee') {
    return res.status(403).json({ message: 'Only authorized scanner roles can perform check-out' });
  }

  const normalizedEmployeeId = String(employeeId || '').trim().toUpperCase();
  
  // Validate employee ID is not empty
  if (!normalizedEmployeeId) {
    return res.status(400).json({ message: 'Employee ID is required' });
  }

  const today = getManilaDateString();

  try {
    const { employee } = await getEmployeeByCode(normalizedEmployeeId);

    if (!employee) {
      return res.status(404).json({ message: 'Employee not found' });
    }

    // Check if employee is active
    const { employee: fullEmployee } = await getEmployeeByCode(normalizedEmployeeId);
    if (!fullEmployee || fullEmployee.record_status !== 'Active') {
      return res.status(400).json({ message: 'Employee is not active' });
    }

    // FIXED: Look for ANY open attendance record (not just today's)
    // This supports overnight shifts where employee checks in Monday, checks out Tuesday
    const { data: attendance } = await db
      .from('attendance')
      .select('*')
      .eq('employee_id', employee.employee_id)
      .is('check_out_time', null)
      .order('attendance_date', { ascending: false, nullsFirst: false })
      .limit(1)
      .maybeSingle();

    // Must have checked in first
    if (!attendance || !attendance.check_in_time) {
      return res.status(400).json({ 
        message: 'Employee has not checked in yet',
        action: 'check_out'
      });
    }

    const now = new Date();
    const timeString = getManilaTimeString();

    // Calculate hours worked - handle cross-day records
    const checkInDateTime = new Date(`${attendance.attendance_date}T${attendance.check_in_time}`);
    const checkOutDateTime = new Date(`${today}T${timeString}`);
    const hoursWorked = Math.max(0, (checkOutDateTime - checkInDateTime) / 3600000);

    // Record QR scan
    const { data: scanData, error: scanError } = await db
      .from('attendance_scans')
      .insert({
        employee_id: employee.employee_id,
        scan_timestamp: now.toISOString(),
        scan_type: 'check_out',
        scan_result: 'accepted',
        recorded_by: adminUserId || null
      })
      .select()
      .single();

    if (scanError) {
      return res.status(500).json({ message: 'Failed to record scan' });
    }

    // Update attendance record with check-out
    const { error: updateError } = await db
      .from('attendance')
      .update({
        check_out_time: timeString,
        check_out_date: today,
        check_out_scan_id: scanData?.scan_id || null,
        hours_worked: Number(hoursWorked.toFixed(2)),
        status: 'Present'
      })
      .eq('attendance_id', attendance.attendance_id);

    if (updateError) {
      return res.status(500).json({ message: 'Failed to record check-out' });
    }

    // Log audit
    const { error: auditError } = await db.from('audit_logs').insert({
      user_id: adminUserId,
      action: 'QR_CHECK_OUT',
      module: 'attendance',
      notes: JSON.stringify({
        adminId,
        adminUserId,
        employeeId: employee.employee_code,
        targetEmployeeId: employee.employee_id,
        method: method || 'qr',
        source: source || 'qr-scanner',
        checkInDate: attendance.attendance_date,
        checkOutDate: today,
        hoursWorked: hoursWorked.toFixed(2),
        timestamp: now.toISOString()
      })
    });
    if (auditError) {
      console.error('Audit log error:', auditError);
    }

    return res.json({
      action: 'check_out',
      message: 'Check-out recorded successfully',
      employee: {
        id: employee.employee_code,
        name: buildEmployeeName(employee),
        checkInDate: attendance.attendance_date,
        checkOutDate: today,
        checkOutTime: timeString,
        hoursWorked: Number(hoursWorked.toFixed(2))
      }
    });
  } catch (err) {
    return res.status(500).json({ message: 'Database error', error: err.message });
  }
});

// ========== SALARY ROUTES ==========

// Get salary records
app.get('/salary/records', authenticateToken, async (req, res) => {
  let { startDate, endDate, status, employeeId } = req.query;
  const isEmployee = req.user.role === 'employee';

  try {
    // Handle date filters - if neither provided, no date filter is applied
    // Frontend may send undefined/null for both when using "All" date preset
    if (startDate === 'undefined' || startDate === 'null') startDate = null;
    if (endDate === 'undefined' || endDate === 'null') endDate = null;

    let query = db
      .from('salary_records')
      .select('salary_id, employee_id, pay_period_start, pay_period_end, salary_amount, status, release_date, last_updated_at, employees:employee_id(employee_code, first_name, middle_name, last_name, departments:department_id(department_name), user_accounts (roles:role_id(role_name)))')
      .order('pay_period_end', { ascending: false });

    if (startDate) {
      query = query.gte('pay_period_start', startDate);
    }
    if (endDate) {
      query = query.lte('pay_period_end', endDate);
    }
    if (status && status !== 'All') {
      query = query.eq('status', status);
    }

    const { data: records, error } = await query;

    if (error) {
      console.error('Salary records fetch error:', error);
      return res.status(500).json({ message: 'Failed to fetch salary records', error: error.message });
    }

    const transformed = (records || []).map((r) => {
      const employee = r.employees || {};
      const account = Array.isArray(employee.user_accounts) ? employee.user_accounts[0] : employee.user_accounts;
      const roleName = account?.roles?.role_name || 'employee';

      return {
        id: r.salary_id,
        period_start: r.pay_period_start,
        period_end: r.pay_period_end,
        amount: r.salary_amount,
        status: r.status,
        released_at: r.release_date,
        claimed_at: null,
        users: {
          employee_id: employee.employee_code,
          name: buildEmployeeName(employee),
          role: roleName,
          department: employee.departments?.department_name || 'N/A'
        }
      };
    });

    let filteredRecords = transformed;
    if (isEmployee) {
      filteredRecords = filteredRecords.filter(r => r.users?.employee_id === req.user.employeeCode);
    } else if (employeeId) {
      filteredRecords = filteredRecords.filter(r => r.users?.employee_id === employeeId);
    }

    res.json({ records: filteredRecords });
  } catch (err) {
    return res.status(500).json({ message: 'Database error', error: err.message });
  }
});

// Get single salary record
app.get('/salary/records/:id', authenticateToken, async (req, res) => {
  const { id } = req.params;

  try {
    const { data: record, error } = await db
      .from('salary_records')
      .select('salary_id, employee_id, pay_period_start, pay_period_end, salary_amount, status, release_date, employees:employee_id(employee_code, first_name, middle_name, last_name, departments:department_id(department_name), user_accounts (roles:role_id(role_name)))')
      .eq('salary_id', id)
      .single();

    if (error || !record) {
      return res.status(404).json({ message: 'Salary record not found' });
    }

    if (req.user.role === 'employee' && req.user.employeeId !== record.employee_id) {
      return res.status(403).json({ message: 'Unauthorized' });
    }

    const employee = record.employees || {};
    const account = Array.isArray(employee.user_accounts) ? employee.user_accounts[0] : employee.user_accounts;
    const roleName = account?.roles?.role_name || 'employee';
    res.json({
      id: record.salary_id,
      employeeId: employee.employee_code,
      employeeName: buildEmployeeName(employee),
      position: roleName,
      department: employee.departments?.department_name || 'N/A',
      salary: record.salary_amount,
      status: record.status,
      releasedAt: record.release_date,
      claimedAt: null
    });
  } catch (err) {
    return res.status(500).json({ message: 'Database error', error: err.message });
  }
});

// Update salary record (admin only)
app.put('/salary/records/:id', authenticateToken, async (req, res) => {
  // Only Admin can edit salary records, not Super Admin
  if (req.user.role !== 'admin') {
    return res.status(403).json({ message: 'Unauthorized. Only Admin can edit salary records.' });
  }

  const { id } = req.params;
  const { baseSalary } = req.body;
  const amount = Number(baseSalary);

  if (!Number.isFinite(amount) || amount <= 0) {
    return res.status(400).json({ message: 'Invalid salary amount' });
  }

  try {
    // Check if salary is already released
    const { data: existing, error: fetchError } = await db
      .from('salary_records')
      .select('status')
      .eq('salary_id', id)
      .single();

    if (fetchError || !existing) {
      return res.status(404).json({ message: 'Salary record not found' });
    }

    if (existing.status === 'Released') {
      return res.status(400).json({ message: 'Cannot edit salary records that have been released' });
    }

    const { error } = await db
      .from('salary_records')
      .update({
        salary_amount: amount,
        last_updated_at: new Date().toISOString(),
        last_updated_by: req.user.userId || null
      })
      .eq('salary_id', id);

    if (error) {
      return res.status(500).json({ message: 'Failed to update salary record' });
    }
    res.json({ success: true, message: 'Salary record updated successfully' });
  } catch (err) {
    return res.status(500).json({ message: 'Database error', error: err.message });
  }
});

// Delete salary record (admin only)
app.delete('/salary/records/:id', authenticateToken, async (req, res) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ message: 'Unauthorized. Only Admin can delete salary records.' });
  }

  const { id } = req.params;

  try {
    const { data: existing, error: findError } = await db
      .from('salary_records')
      .select('salary_id, employee_id, pay_period_start, pay_period_end, salary_amount, status')
      .eq('salary_id', id)
      .single();

    if (findError || !existing) {
      return res.status(404).json({ message: 'Salary record not found' });
    }

    const { error: deleteError } = await db
      .from('salary_records')
      .delete()
      .eq('salary_id', id);

    if (deleteError) {
      return res.status(500).json({ message: 'Failed to delete salary record' });
    }

    await db
      .from('audit_logs')
      .insert({
        user_id: req.user.userId,
        action: 'SALARY_RECORD_DELETED',
        module: 'salary',
        notes: JSON.stringify({
          salaryId: existing.salary_id,
          employeeId: existing.employee_id,
          periodStart: existing.pay_period_start,
          periodEnd: existing.pay_period_end,
          amount: existing.salary_amount,
          status: existing.status
        })
      });

    return res.json({ success: true, message: 'Salary record deleted successfully' });
  } catch (err) {
    return res.status(500).json({ message: 'Database error', error: err.message });
  }
});

// Add salary record (admin only)
app.post('/salary/add', authenticateToken, async (req, res) => {
  const normalizedRole = String(req.user?.role || '').trim().toLowerCase().replace(/\s+/g, '_');
  if (!['admin', 'super_admin'].includes(normalizedRole)) {
    return res.status(403).json({ message: 'Unauthorized. Only Admin or Super Admin can add salary records.' });
  }

  const { employeeId, periodStart, periodEnd, amount, trips } = req.body;

  try {
    const { employee } = await getEmployeeByCode(employeeId);

    if (!employee) {
      return res.status(404).json({ message: 'Employee not found' });
    }

    const { data: inserted, error: insertError } = await db
      .from('salary_records')
      .insert({
        employee_id: employee.employee_id,
        pay_period_start: periodStart,
        pay_period_end: periodEnd,
        salary_amount: amount,
        status: 'Pending',
        last_updated_at: new Date().toISOString(),
        last_updated_by: req.user.userId || null
      })
      .select();

    if (insertError) {
      return res.status(500).json({ message: 'Failed to add salary record' });
    }

    res.json({
      success: true,
      id: inserted?.[0]?.salary_id,
      message: 'Salary record added successfully'
    });
  } catch (err) {
    return res.status(500).json({ message: 'Database error', error: err.message });
  }
});

// Release salary (admin only)
app.put('/salary/release/:id', authenticateToken, async (req, res) => {
  // Only Admin and Manager can release salary, not Super Admin
  if (req.user.role !== 'admin' && req.user.role !== 'manager') {
    return res.status(403).json({ message: 'Unauthorized. Only Admin or Manager can release salary.' });
  }

  const { id } = req.params;
  const now = new Date().toISOString();

  try {
    const { error } = await db
      .from('salary_records')
      .update({
        status: 'Released',
        release_date: now,
        last_updated_at: now,
        last_updated_by: req.user.userId || null
      })
      .eq('salary_id', id);

    if (error) {
      return res.status(500).json({ message: 'Failed to release salary' });
    }
    res.json({ success: true, message: 'Salary released successfully' });
  } catch (err) {
    return res.status(500).json({ message: 'Database error', error: err.message });
  }
});

// Claim salary (employee or admin)
app.put('/salary/claim/:id', authenticateToken, async (req, res) => {
  const { id } = req.params;
  const now = new Date().toISOString();

  try {
    // Verify ownership if employee
    if (req.user.role === 'employee') {
      const { data: record, error: fetchError } = await db
        .from('salary_records')
        .select('*')
        .eq('salary_id', id)
        .eq('employee_id', req.user.employeeId)
        .single();

      if (fetchError || !record) {
        return res.status(403).json({ message: 'Unauthorized or record not found' });
      }
    }

    const { error } = await db
      .from('salary_records')
      .update({
        status: 'Claimed',
        last_updated_at: now,
        last_updated_by: req.user.userId || null
      })
      .eq('salary_id', id);

    if (error) {
      return res.status(500).json({ message: 'Failed to claim salary' });
    }
    res.json({ success: true, message: 'Salary claimed successfully' });
  } catch (err) {
    return res.status(500).json({ message: 'Database error', error: err.message });
  }
});

// ========== EMPLOYEE ROUTES ==========

// Get all employees
app.get('/employees', authenticateToken, async (req, res) => {
  const { department, status } = req.query;
  
  try {
    let query = db
      .from('employees')
      .select('employee_id, employee_code, first_name, middle_name, last_name, email_address, position, contact_number, record_status, created_at, departments:department_id(department_name), user_accounts (account_status, roles:role_id(role_name))')
      .order('created_at', { ascending: false });

    const { data: employees, error } = await query;

    if (error) {
      return res.status(500).json({ message: 'Database error' });
    }
    const transformed = (employees || []).map((emp) => {
      const account = Array.isArray(emp.user_accounts) ? emp.user_accounts[0] : emp.user_accounts;
      const roleName = account?.roles?.role_name || 'employee';

      return {
        id: emp.employee_id,
        employee_id: emp.employee_code,
        name: buildEmployeeName(emp),
        email: emp.email_address,
        role: roleName,
        department: emp.departments?.department_name || 'N/A',
        status: account?.account_status || emp.record_status || 'ACTIVE',
        created_at: emp.created_at,
        position: emp.position,
        phone: emp.contact_number || ''
      };
    });

    let filtered = transformed;
    if (department && department !== 'All') {
      filtered = filtered.filter((emp) => emp.department === department);
    }
    if (status && status !== 'All') {
      filtered = filtered.filter((emp) => String(emp.status).toLowerCase() === String(status).toLowerCase());
    }

    res.json({ employees: filtered });
  } catch (err) {
    return res.status(500).json({ message: 'Database error', error: err.message });
  }
});

// Get single employee
app.get('/employees/:id', authenticateToken, async (req, res) => {
  const { id } = req.params;
  
  // Normalize ID
  const normalizedId = String(id || '').trim().toUpperCase();
  if (!normalizedId) {
    return res.status(400).json({ message: 'Employee ID is required' });
  }

  try {
    const { employee, account, roleName, departmentName } = await getEmployeeByCode(normalizedId);

    if (!employee) {
      return res.status(404).json({ message: 'Employee not found' });
    }

    res.json({
      employee: {
        id: employee.employee_id,
        employee_id: employee.employee_code,
        name: buildEmployeeName(employee),
        email: employee.email_address,
        role: roleName || 'employee',
        department: departmentName || 'N/A',
        status: account?.account_status || employee.record_status || 'ACTIVE',
        created_at: employee.created_at,
        position: employee.position,
        phone: employee.contact_number || ''
      }
    });
  } catch (err) {
    return res.status(500).json({ message: 'Database error', error: err.message });
  }
});

// Add employee (admin only) - Auto-creates user account with activation token
app.post('/employees', authenticateToken, upload.single('photo'), async (req, res) => {
  if (req.user.role !== 'admin' && req.user.role !== 'super_admin') {
    return res.status(403).json({ message: 'Unauthorized' });
  }

  // Note: employeeId is now auto-generated, no need to provide it
  const { name, email, role, department, position, phone, contactNumber } = req.body;

  // Validate required fields
  if (!name || !email || !role || !department) {
    return res.status(400).json({ message: 'Missing required fields' });
  }

  try {
    // Auto-generate next GW employee code
    const employeeId = await getNextEmployeeCode();
    console.log(`[EMPLOYEE_CREATE] Generated new employee code: ${employeeId}`);

    const nameParts = name.trim().split(/\s+/);
    const firstName = nameParts[0] || '';
    const lastName = nameParts.length > 1 ? nameParts[nameParts.length - 1] : '';
    const middleName = nameParts.length > 2 ? nameParts.slice(1, -1).join(' ') : '';

    const { data: deptRow, error: deptError } = await db
      .from('departments')
      .select('department_id')
      .eq('department_name', department)
      .single();

    let departmentId = deptRow?.department_id || null;
    if (!departmentId) {
      const { data: deptInsert, error: deptInsertError } = await db
        .from('departments')
        .insert({ department_name: department })
        .select()
        .single();

      if (deptInsertError) {
        return res.status(500).json({ message: 'Failed to create department' });
      }
      departmentId = deptInsert.department_id;
    }

    const { data: roleRow, error: roleError } = await db
      .from('roles')
      .select('role_id')
      .eq('role_name', role)
      .single();

    let roleId = roleRow?.role_id || null;
    if (!roleId) {
      const { data: roleInsert, error: roleInsertError } = await db
        .from('roles')
        .insert({ role_name: role })
        .select()
        .single();

      if (roleInsertError) {
        return res.status(500).json({ message: 'Failed to create role' });
      }
      roleId = roleInsert.role_id;
    }

    // Check if employee already exists (shouldn't happen with auto-generation, but safety check)
    const { data: existingEmployee, error: checkError } = await db
      .from('employees')
      .select('employee_id, employee_code')
      .eq('employee_code', employeeId)
      .maybeSingle();

    if (existingEmployee) {
      return res.status(400).json({ message: 'Generated ID conflict, please try again' });
    }

    let profileImageUrl = null;
    if (req.file) {
      try {
        profileImageUrl = await uploadEmployeePhotoToSupabase(req.file, employeeId);
      } catch (uploadError) {
        console.warn('Employee photo upload failed:', uploadError.message);
      }
    }

    const { data: employeeInsert, error: employeeInsertError } = await db
      .from('employees')
      .insert({
        employee_code: employeeId,
        first_name: firstName,
        middle_name: middleName,
        last_name: lastName,
        email_address: email,
        contact_number: phone || contactNumber || '',
        profile_image_url: profileImageUrl,
        position: position || '',
        department_id: departmentId,
        record_status: 'Active',
        hire_date: new Date().toISOString().split('T')[0]
      })
      .select()
      .single();

    if (employeeInsertError) {
      if (employeeInsertError.message.includes('duplicate') || employeeInsertError.code === '23505') {
        return res.status(400).json({ message: 'Employee already exists (duplicate entry)' });
      }
      return res.status(500).json({ message: 'Failed to add employee' });
    }

    const { data: accountInsert, error: accountInsertError } = await db
      .from('user_accounts')
      .insert({
        employee_id: employeeInsert.employee_id,
        username: employeeId,
        password_hash: await bcrypt.hash('changeme123', 10),
        role_id: roleId,
        account_status: 'ACTIVE',
        date_created: new Date().toISOString()
      })
      .select()
      .single();

    if (accountInsertError) {
      return res.status(500).json({ message: 'Failed to create user account' });
    }

    const activationToken = require('crypto').randomBytes(32).toString('hex');
    const expiresAt = Date.now() + 24 * 60 * 60 * 1000;
    if (!global.activationTokens) {
      global.activationTokens = {};
    }
    global.activationTokens[activationToken] = {
      userId: accountInsert.user_id,
      employeeId: employeeInsert.employee_id,
      expiresAt
    };

    // Use employee code for QR code
    const qrCode = employeeId;
    await db
      .from('qr_codes')
      .insert({
        employee_id: employeeInsert.employee_id,
        qr_value: qrCode,
        status: 'ACTIVE',
        date_issued: new Date().toISOString().split('T')[0],
        issued_by: req.user.userId || null
      });

    // Generate QR image URL using external API (fallback for display)
    const qrImageUrl = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(qrCode)}`;
    
    // Optionally upload to Supabase for permanent storage
    let supabaseQrUrl = null;
    try {
      supabaseQrUrl = await uploadQrToSupabase(qrCode, employeeId);
    } catch (uploadError) {
      console.warn('QR upload to Supabase failed (using fallback URL):', uploadError.message);
    }

    const setupLink = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/setup-password?token=${activationToken}`;

    res.json({
      success: true,
      id: employeeInsert.employee_id,
      message: 'Employee account created. Activation link sent to email.',
      setupLink: setupLink,
      qrCode,
      qrImageUrl: supabaseQrUrl || qrImageUrl // Prefer Supabase, fallback to API URL
    });
  } catch (err) {
    return res.status(500).json({ message: 'Database error', error: err.message });
  }
});

// Update employee (admin only)
app.put('/employees/:id', authenticateToken, async (req, res) => {
  if (req.user.role !== 'admin' && req.user.role !== 'super_admin') {
    return res.status(403).json({ message: 'Unauthorized' });
  }

  const { id } = req.params;
  const { name, email, role, department, status, position, phone } = req.body;

  try {
    const { employee, account } = await getEmployeeByCode(id);
    if (!employee || !account) {
      return res.status(404).json({ message: 'Employee not found' });
    }

    const nameParts = (name || buildEmployeeName(employee)).trim().split(/\s+/);
    const firstName = nameParts[0] || '';
    const lastName = nameParts.length > 1 ? nameParts[nameParts.length - 1] : '';
    const middleName = nameParts.length > 2 ? nameParts.slice(1, -1).join(' ') : '';

    let departmentId = employee.department_id;
    if (department) {
      const { data: deptRow } = await db
        .from('departments')
        .select('department_id')
        .eq('department_name', department)
        .single();
      if (deptRow?.department_id) {
        departmentId = deptRow.department_id;
      }
    }

    let roleId = null;
    if (role) {
      const { data: roleRow } = await db
        .from('roles')
        .select('role_id')
        .eq('role_name', role)
        .single();
      roleId = roleRow?.role_id || null;
    }

    const { error } = await db
      .from('employees')
      .update({
        first_name: firstName,
        middle_name: middleName,
        last_name: lastName,
        email_address: email || employee.email_address,
        department_id: departmentId,
        position: position || employee.position,
        contact_number: phone || employee.contact_number,
        record_status: status || employee.record_status,
        updated_at: new Date().toISOString()
      })
      .eq('employee_id', employee.employee_id);

    if (roleId) {
      await db
        .from('user_accounts')
        .update({ role_id: roleId, account_status: status || account.account_status })
        .eq('user_id', account.user_id);
    }

    if (error) {
      return res.status(500).json({ message: 'Failed to update employee' });
    }
    res.json({ success: true, message: 'Employee updated successfully' });
  } catch (err) {
    return res.status(500).json({ message: 'Database error', error: err.message });
  }
});

// Delete employee (admin only)
app.delete('/employees/:id', authenticateToken, async (req, res) => {
  // Only Admin can delete employee records (not Super Admin)
  if (req.user.role !== 'admin') {
    return res.status(403).json({ message: 'Unauthorized. Only Admin can delete employee records.' });
  }

  const { id } = req.params;

  try {
    const { employee } = await getEmployeeByCode(id);
    if (!employee) {
      return res.status(404).json({ message: 'Employee not found' });
    }

    // Check for dependent records (attendance, salary) before deletion
    const { count: attendanceCount } = await db
      .from('attendance')
      .select('attendance_id', { count: 'exact', head: true })
      .eq('employee_id', employee.employee_id);

    const { count: salaryCount } = await db
      .from('salary_records')
      .select('salary_id', { count: 'exact', head: true })
      .eq('employee_id', employee.employee_id);

    if (attendanceCount > 0 || salaryCount > 0) {
      return res.status(409).json({
        message: 'Cannot delete employee with existing attendance or salary records',
        dependentRecords: { attendance: attendanceCount || 0, salary: salaryCount || 0 }
      });
    }

    // Delete user account first (foreign key constraint)
    const { error: userError } = await db
      .from('user_accounts')
      .delete()
      .eq('employee_id', employee.employee_id);

    if (userError) {
      return res.status(500).json({ message: 'Failed to delete user account' });
    }

    // Then delete employee record
    const { error: empError } = await db
      .from('employees')
      .delete()
      .eq('employee_id', employee.employee_id);

    if (empError) {
      return res.status(500).json({ message: 'Failed to delete employee' });
    }

    // Log the deletion action
    await db
      .from('audit_logs')
      .insert({
        user_id: req.user.userId,
        action: 'EMPLOYEE_DELETED',
        module: 'employee_records',
        notes: JSON.stringify({
          employeeId: employee.employee_id,
          employeeCode: employee.employee_code,
          name: [employee.first_name, employee.middle_name, employee.last_name].filter(Boolean).join(' ')
        })
      });

    res.json({ success: true, message: 'Employee deleted successfully' });
  } catch (err) {
    return res.status(500).json({ message: 'Database error', error: err.message });
  }
});

// ========== DASHBOARD ROUTES ==========

// Get dashboard statistics
app.get('/dashboard/stats', authenticateToken, async (req, res) => {
  const today = new Date().toISOString().split('T')[0];
  const rangeStart = req.query.startDate || today;
  const rangeEnd = req.query.endDate || today;
  const isEmployee = req.user.role === 'employee';

  try {
    if (isEmployee) {
      // Employee dashboard stats
      // Get days present in last 30 days
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      const thirtyDaysAgoStr = thirtyDaysAgo.toISOString().split('T')[0];

      const { count: attendanceCount } = await db
        .from('attendance')
        .select('attendance_id', { count: 'exact', head: true })
        .eq('employee_id', req.user.employeeId)
        .gte('attendance_date', thirtyDaysAgoStr);

      // Get latest released salary
      const { data: latestSalary } = await db
        .from('salary_records')
        .select('salary_amount')
        .eq('employee_id', req.user.employeeId)
        .eq('status', 'Released')
        .order('pay_period_end', { ascending: false })
        .limit(1)
        .single();

      // Get pending claims
      const { count: pendingCount } = await db
        .from('salary_records')
        .select('salary_id', { count: 'exact', head: true })
        .eq('employee_id', req.user.employeeId)
        .eq('status', 'Pending');

      res.json({
        stats: {
          days_present: attendanceCount || 0,
          latest_salary: latestSalary?.salary_amount || 0,
          pending_claims: pendingCount || 0
        }
      });
    } else {
      // Admin/Manager dashboard stats
      // Total active employees
      const { data: employeeRole } = await db
        .from('roles')
        .select('role_id')
        .eq('role_name', 'employee')
        .single();

      const { count: employeeCount } = await db
        .from('user_accounts')
        .select('user_id', { count: 'exact', head: true })
        .eq('account_status', 'ACTIVE')
        .eq('role_id', employeeRole?.role_id || 0);

      // Attendance in selected range - calculate status from check_in_time
      const { data: attendanceRows } = await db
        .from('attendance')
        .select('employee_id, check_in_time, check_out_time')
        .gte('attendance_date', rangeStart)
        .lte('attendance_date', rangeEnd);

      // Count unique employees with Present status
      const presentEmployeeSet = new Set();
      const absentEmployeeSet = new Set();
      
      (attendanceRows || []).forEach((row) => {
        // Calculate status from check_in_time
        const hasCheckedIn = Boolean(row.check_in_time);
        if (hasCheckedIn) {
          presentEmployeeSet.add(row.employee_id);
          // Remove from absent if previously marked
          absentEmployeeSet.delete(row.employee_id);
        } else if (!presentEmployeeSet.has(row.employee_id)) {
          // Only mark as absent if not already present
          absentEmployeeSet.add(row.employee_id);
        } else if (row.check_in_time && !status) {
          // Fallback: if no status but has check_in, consider present
          presentEmployeeSet.add(row.employee_id);
        }
      });

      const presentCount = presentEmployeeSet.size;
      const absentCount = absentEmployeeSet.size;

      // Pending salaries
      const { data: pendingSalaries, count: pendingSalaryCount } = await db
        .from('salary_records')
        .select('salary_id, salary_amount', { count: 'exact' })
        .eq('status', 'Pending');

      const { data: releasedSalaries } = await db
        .from('salary_records')
        .select('salary_amount')
        .eq('status', 'Released');

      // Salary amounts filtered by pay period end date range
      const { data: pendingSalariesRange } = await db
        .from('salary_records')
        .select('salary_amount')
        .eq('status', 'Pending')
        .gte('pay_period_end', rangeStart)
        .lte('pay_period_end', rangeEnd);

      const { data: releasedSalariesRange } = await db
        .from('salary_records')
        .select('salary_amount')
        .eq('status', 'Released')
        .gte('pay_period_end', rangeStart)
        .lte('pay_period_end', rangeEnd);

      const pendingAmount = (pendingSalariesRange || pendingSalaries || []).reduce((sum, s) => sum + (s.salary_amount || 0), 0);
      const releasedAmount = (releasedSalariesRange || releasedSalaries || []).reduce((sum, s) => sum + (s.salary_amount || 0), 0);

      res.json({
        stats: {
          total_employees: employeeCount || 0,
          present_count: presentCount || 0,
          absent_count: absentCount || 0,
          pending_salaries: pendingSalaryCount || 0,
          pending_amount: pendingAmount,
          released_amount: releasedAmount,
          range_start: rangeStart,
          range_end: rangeEnd
        }
      });
    }
  } catch (err) {
    return res.status(500).json({ message: 'Database error', error: err.message });
  }
});

// ========== PROFILE ROUTES ==========

// Upload profile photo
app.post('/users/upload-photo', authenticateToken, upload.single('photo'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ message: 'No file uploaded' });
  }

  let imageUrl = null;

  try {
    if (supabase) {
      const fileName = `profiles/${req.user.id}_${Date.now()}.jpg`;
      const { data, error } = await supabase.storage
        .from(process.env.SUPABASE_BUCKET || 'profile-images')
        .upload(fileName, req.file.buffer, {
          contentType: req.file.mimetype,
          cacheControl: '3600'
        });

      if (!error) {
        imageUrl = supabase.storage
          .from(process.env.SUPABASE_BUCKET || 'profile-images')
          .getPublicUrl(fileName).data.publicUrl;
      }
    } else {
      // Fallback: save to local filesystem or return base64
      imageUrl = `data:${req.file.mimetype};base64,${req.file.buffer.toString('base64')}`;
    }

    const { employee } = await getEmployeeByCode(req.user.employeeCode);
    if (employee) {
      await db
        .from('employees')
        .update({ profile_image_url: imageUrl, updated_at: new Date().toISOString() })
        .eq('employee_id', employee.employee_id);
    }

    res.json({ success: true, imageUrl, message: 'Profile photo uploaded successfully' });
  } catch (err) {
    return res.status(500).json({ message: 'Database error', error: err.message });
  }
});

// ========== USER PROFILE ROUTES ==========

// Get user profile
app.get('/users/profile', authenticateToken, async (req, res) => {
  try {
    const { employee, account, roleName, departmentName } = await getEmployeeByCode(req.user.employeeCode);

    if (!employee || !account) {
      return res.status(404).json({ message: 'User not found' });
    }

    res.json({
      user: {
        id: account.user_id,
        employee_id: employee.employee_code,
        name: buildEmployeeName(employee),
        first_name: employee.first_name,
        middle_name: employee.middle_name,
        last_name: employee.last_name,
        email: employee.email_address,
        email_verified_at: employee.email_verified_at || null,
        role: roleName,
        department: departmentName,
        position: employee.position,
        contact_number: employee.contact_number,
        status: account.account_status || employee.record_status,
        profile_image_url: employee.profile_image_url || null,
        created_at: account.date_created
      }
    });
  } catch (err) {
    return res.status(500).json({ message: 'Database error', error: err.message });
  }
});

// Update user profile
app.put('/users/profile', authenticateToken, async (req, res) => {
  const { name, contactNumber, emergencyContact, emergencyContactName } = req.body;

  try {
    const { employee } = await getEmployeeByCode(req.user.employeeCode);
    if (!employee) {
      return res.status(404).json({ message: 'User not found' });
    }

    const nameParts = (name || buildEmployeeName(employee)).trim().split(/\s+/);
    const firstName = nameParts[0] || '';
    const lastName = nameParts.length > 1 ? nameParts[nameParts.length - 1] : '';
    const middleName = nameParts.length > 2 ? nameParts.slice(1, -1).join(' ') : '';

    const { error } = await db
      .from('employees')
      .update({
        first_name: firstName,
        middle_name: middleName,
        last_name: lastName,
        contact_number: contactNumber || employee.contact_number,
        emergency_contact: emergencyContact || employee.emergency_contact,
        emergency_contact_name: emergencyContactName || employee.emergency_contact_name,
        updated_at: new Date().toISOString()
      })
      .eq('employee_id', employee.employee_id);

    if (error) {
      return res.status(500).json({ message: 'Failed to update profile' });
    }
    res.json({ success: true, message: 'Profile updated successfully' });
  } catch (err) {
    return res.status(500).json({ message: 'Database error', error: err.message });
  }
});

// Update email address separately
app.put('/users/update-email', authenticateToken, async (req, res) => {
  const { email } = req.body;

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ message: 'Invalid email address' });
  }

  try {
    const { employee } = await getEmployeeByCode(req.user.employeeCode);
    if (!employee) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Check if email is already in use
    const { data: existing } = await db
      .from('employees')
      .select('employee_id')
      .eq('email_address', email)
      .neq('employee_id', employee.employee_id)
      .single();

    if (existing) {
      return res.status(400).json({ message: 'Email address is already in use' });
    }

    const { error } = await db
      .from('employees')
      .update({
        email_address: email,
        email_verified_at: null,
        updated_at: new Date().toISOString()
      })
      .eq('employee_id', employee.employee_id);

    if (error) {
      return res.status(500).json({ message: 'Failed to update email' });
    }
    
    res.json({ success: true, message: 'Email updated successfully. Please verify your new email.' });
  } catch (err) {
    return res.status(500).json({ message: 'Database error', error: err.message });
  }
});

// ========== USER MANAGEMENT ROUTES ==========

// Get all users (admin only)
app.get('/users', authenticateToken, async (req, res) => {
  if (req.user.role !== 'admin' && req.user.role !== 'super_admin') {
    return res.status(403).json({ message: 'Unauthorized' });
  }

  const { status } = req.query;

  try {
    let query = db
      .from('user_accounts')
      .select(`
        user_id,
        account_status,
        date_created,
        last_login,
        roles:role_id(role_name),
        employees:employee_id(
          employee_code,
          first_name,
          middle_name,
          last_name,
          email_address,
          departments:department_id(department_name)
        )
      `)
      .order('date_created', { ascending: false });

    if (status && status !== 'All') {
      query = query.eq('account_status', status);
    }

    const { data: users, error } = await query;

    if (error) {
      console.error('User query error:', error);
      return res.status(500).json({ message: 'Database error', details: error.message });
    }

    const transformed = (users || []).map(u => {
      const roleName = u.roles?.role_name || 'employee';
      const employeeName = buildEmployeeName(u.employees || {});
      const departmentName = u.employees?.departments?.department_name || null;
      
      return {
        id: u.user_id,
        userId: u.employees?.employee_code || `USER${u.user_id}`,
        username: employeeName ? employeeName.toLowerCase().replace(/\s+/g, '.') : `user${u.user_id}`,
        email: u.employees?.email_address || `${u.employees?.employee_code || 'user'}@gracewell.com`,
        department: departmentName || (roleName.charAt(0).toUpperCase() + roleName.slice(1)),
        role: roleName.charAt(0).toUpperCase() + roleName.slice(1),
        status: u.account_status || 'Active',
        lastLogin: u.last_login ? new Date(u.last_login).toLocaleDateString('en-US') : new Date(u.date_created).toLocaleDateString('en-US'),
        permissions: (u.permissions && u.permissions.length > 0)
          ? u.permissions
          : getPermissionsForRole(roleName)
      };
    });

    res.json({ users: transformed });
  } catch (err) {
    return res.status(500).json({ message: 'Database error', error: err.message });
  }
});

// Helper function to get permissions by role
function getPermissionsForRole(role) {
  // Module-based permissions matching frontend
  const permissions = {
    super_admin: ['dashboard', 'attendance', 'employee_records', 'payroll_salary'],
    admin: ['dashboard', 'attendance', 'employee_records', 'payroll_salary'],
    manager: ['dashboard', 'attendance', 'employee_records'],
    employee: ['dashboard', 'employee_records']
  };
  return permissions[role] || ['dashboard'];
}

// Disable/Enable user (admin only)
app.put('/users/:id/status', authenticateToken, async (req, res) => {
  if (req.user.role !== 'admin' && req.user.role !== 'super_admin') {
    return res.status(403).json({ message: 'Unauthorized' });
  }

  const { id } = req.params;
  const { status } = req.body;

  if (!['Active', 'Inactive'].includes(status)) {
    return res.status(400).json({ message: 'Invalid status' });
  }

  try {
    const { error } = await db
      .from('user_accounts')
      .update({ account_status: status })
      .eq('user_id', id);

    if (error) {
      return res.status(500).json({ message: 'Failed to update user status' });
    }
    res.json({ success: true, message: `User status updated to ${status}` });
  } catch (err) {
    return res.status(500).json({ message: 'Database error', error: err.message });
  }
});

// Create new user (Super Admin only)
app.post('/users', authenticateToken, async (req, res) => {
  // Only super_admin can create users
  if (req.user.role !== 'super_admin') {
    return res.status(403).json({ message: 'Only Super Admin can create users' });
  }

  const { employeeCode, role, status } = req.body;

  if (!employeeCode || !role) {
    return res.status(400).json({ message: 'Employee code and role are required' });
  }

  const validRoles = ['employee', 'manager', 'admin', 'super_admin'];
  if (!validRoles.includes(role.toLowerCase())) {
    return res.status(400).json({ message: 'Invalid role' });
  }

  const accountStatus = status || 'Active';

  try {
    // Check if employee exists
    const { data: employees, error: empError } = await db
      .from('employees')
      .select('employee_id, employee_code')
      .eq('employee_code', employeeCode.toUpperCase())
      .single();

    if (empError || !employees) {
      return res.status(404).json({ message: 'Employee not found' });
    }

    // Check if user account already exists
    const { data: existing } = await db
      .from('user_accounts')
      .select('user_id')
      .eq('employee_id', employees.employee_id)
      .single();

    if (existing) {
      return res.status(400).json({ message: 'User account already exists for this employee' });
    }

    // Get role_id
    const { data: roleData, error: roleError } = await db
      .from('roles')
      .select('role_id')
      .eq('role_name', role.toLowerCase())
      .single();

    if (roleError || !roleData) {
      return res.status(400).json({ message: 'Invalid role' });
    }

    // Create default password (employee should change on first login)
    const defaultPassword = 'Welcome123!';
    const hashedPassword = await bcrypt.hash(defaultPassword, 10);

    // Insert user account
    const { data: newUser, error: insertError } = await db
      .from('user_accounts')
      .insert({
        employee_id: employees.employee_id,
        password_hash: hashedPassword,
        role_id: roleData.role_id,
        account_status: accountStatus,
        date_created: new Date().toISOString()
      })
      .select()
      .single();

    if (insertError) {
      console.error('Insert error:', insertError);
      return res.status(500).json({ message: 'Failed to create user account' });
    }

    res.status(201).json({ 
      success: true, 
      message: 'User created successfully. Default password: Welcome123!',
      user: newUser 
    });
  } catch (err) {
    console.error('Error creating user:', err);
    return res.status(500).json({ message: 'Database error', error: err.message });
  }
});

// Edit user (admin and super_admin)
// Edit user (admin and super_admin)
app.put('/users/:id', authenticateToken, async (req, res) => {
  if (req.user.role !== 'admin' && req.user.role !== 'super_admin') {
    return res.status(403).json({ message: 'Unauthorized' });
  }

  const { id } = req.params;
  const { role, status, permissions, confirmPassword } = req.body;

  // Verify confirmPassword before proceeding
  if (!confirmPassword) {
    return res.status(400).json({ message: 'Password confirmation is required' });
  }

  // Get the requesting user's account to verify their password
  try {
    const { data: requestingUser, error: reqUserError } = await db
      .from('user_accounts')
      .select('password_hash')
      .eq('user_id', req.user.userId)
      .single();

    if (reqUserError || !requestingUser) {
      return res.status(404).json({ message: 'Requesting user not found' });
    }

    const passwordValid = await bcrypt.compare(confirmPassword, requestingUser.password_hash);
    if (!passwordValid) {
      return res.status(401).json({ message: 'Incorrect password. Please try again.' });
    }
  } catch (err) {
    return res.status(500).json({ message: 'Password verification failed', error: err.message });
  }

  try {
    // Get current user details
    const { data: targetUser, error: fetchError } = await db
      .from('user_accounts')
      .select('user_id, employee_id, role_id, roles:role_id(role_name)')
      .eq('user_id', id)
      .single();

    if (fetchError || !targetUser) {
      return res.status(404).json({ message: 'User not found' });
    }

    const targetRole = targetUser.roles?.role_name;

    // Prevent Admin from editing Super Admin
    if (req.user.role === 'admin' && (targetRole === 'super_admin' || role?.toLowerCase() === 'super_admin')) {
      return res.status(403).json({ message: 'Admin cannot modify Super Admin accounts' });
    }

    // Prevent users from demoting themselves
    if (req.user.userId === parseInt(id) && role && role.toLowerCase() !== targetRole) {
      return res.status(403).json({ message: 'Cannot change your own role' });
    }

    const updateData = {};

    // Update role if provided
    if (role) {
      const validRoles = ['employee', 'manager', 'admin', 'super_admin'];
      if (!validRoles.includes(role.toLowerCase())) {
        return res.status(400).json({ message: 'Invalid role' });
      }

      const { data: roleData, error: roleError } = await db
        .from('roles')
        .select('role_id')
        .eq('role_name', role.toLowerCase())
        .single();

      if (roleError || !roleData) {
        return res.status(400).json({ message: 'Role not found' });
      }

      updateData.role_id = roleData.role_id;
    }

    // Update status if provided
    if (status) {
      if (!['Active', 'Inactive'].includes(status)) {
        return res.status(400).json({ message: 'Invalid status' });
      }
      updateData.account_status = status;
    }

    if (permissions && Array.isArray(permissions)) {
      updateData.permissions = permissions;
    }

    if (Object.keys(updateData).length === 0) {
      return res.status(400).json({ message: 'No valid fields to update' });
    }

    const { error: updateError } = await db
      .from('user_accounts')
      .update(updateData)
      .eq('user_id', id);

    if (updateError) {
      console.error('Update error:', updateError);
      return res.status(500).json({ message: 'Failed to update user' });
    }

    try {
      await db.from('audit_logs').insert({
        user_id: req.user.userId,
        action: 'USER_PERMISSIONS_UPDATED',
        module: 'user_management',
        notes: JSON.stringify({
          targetUserId: id,
          role: role || null,
          permissions: permissions || null,
          updatedBy: req.user.employeeCode
        })
      });
    } catch (auditErr) {
      console.error('Audit log error:', auditErr);
    }

    res.json({ success: true, message: 'User updated successfully' });

    // Save permissions to user_permissions table or as JSON column
    // Since your DB may not have a permissions column yet, we store it in a separate table or skip
    // For now, log it and return success — add DB column if needed
    if (permissions && Array.isArray(permissions)) {
      const { error: permError } = await db
        .from('user_accounts')
        .update({ permissions: JSON.stringify(permissions) })
        .eq('user_id', id);

      if (permError) {
        console.warn('Permissions column may not exist yet:', permError.message);
        // Don't fail the whole request — role update still succeeded
      }
    }

    // Log audit
    try {
      await db.from('audit_logs').insert({
        user_id: req.user.userId,
        action: 'USER_PERMISSIONS_UPDATED',
        module: 'user_management',
        notes: JSON.stringify({
          targetUserId: id,
          role: role || null,
          permissions: permissions || null,
          updatedBy: req.user.employeeCode
        })
      });
    } catch (auditErr) {
      console.error('Audit log error:', auditErr);
    }

    res.json({ success: true, message: 'User updated successfully' });
  } catch (err) {
    console.error('Error updating user:', err);
    return res.status(500).json({ message: 'Database error', error: err.message });
  }
});

// Delete user (Super Admin only - soft delete by setting inactive)
app.delete('/users/:id', authenticateToken, async (req, res) => {
  if (req.user.role !== 'super_admin') {
    return res.status(403).json({ message: 'Only Super Admin can delete users' });
  }

  const { id } = req.params;

  // Prevent self-deletion
  if (req.user.userId === parseInt(id)) {
    return res.status(403).json({ message: 'Cannot delete your own account' });
  }

  try {
    const { error } = await db
      .from('user_accounts')
      .update({ account_status: 'Deleted' })
      .eq('user_id', id);

    if (error) {
      return res.status(500).json({ message: 'Failed to delete user' });
    }

    res.json({ success: true, message: 'User deleted successfully' });
  } catch (err) {
    return res.status(500).json({ message: 'Database error', error: err.message });
  }
});

// ========== QR CODE ROUTES ==========

// Generate QR code for employee
app.post('/qr/generate', authenticateToken, async (req, res) => {
  const { employeeId } = req.body;
  const normalizedInput = String(employeeId || '').trim().toUpperCase();

  if (!normalizedInput) {
    return res.status(400).json({ message: 'Employee ID is required' });
  }

  try {
    const { employee } = await getEmployeeByCode(normalizedInput);

    if (!employee) {
      return res.status(404).json({ message: `Employee not found: ${normalizedInput}` });
    }

    // QR code data: NORMALIZED_employee_code|timestamp|hash
    // Use employee.employee_code (database source of truth) instead of raw input
    const timestamp = Date.now();
    const qrData = `${employee.employee_code}|${timestamp}|${Math.random().toString(36).substr(2, 9)}`;

    await db
      .from('qr_codes')
      .insert({
        employee_id: employee.employee_id,
        qr_value: qrData,
        status: 'ACTIVE',
        date_issued: new Date().toISOString().split('T')[0],
        issued_by: req.user.userId || null
      });

    let qrImageUrl = null;
    try {
      qrImageUrl = await uploadQrToSupabase(qrData, employee.employee_code);
    } catch (uploadError) {
      console.warn('QR upload failed:', uploadError.message);
    }

    res.json({
      success: true,
      qrCode: qrData,
      employeeId: employee.employee_code,
      generatedAt: new Date().toISOString(),
      qrImageUrl
    });
  } catch (err) {
    return res.status(500).json({ message: 'Database error', error: err.message });
  }
});

// Validate QR code and verify employee exists
app.post('/qr/validate', authenticateToken, async (req, res) => {
  const { qrCode } = req.body;

  if (!qrCode) {
    return res.status(400).json({ valid: false, message: 'QR code is required' });
  }

  // Validate format: employee_code|timestamp|hash
  const parts = String(qrCode).trim().split('|');
  if (parts.length !== 3) {
    return res.status(400).json({ valid: false, message: 'Invalid QR format - expected employee_code|timestamp|hash' });
  }

  const [employeeId, timestamp, hash] = parts;
  
  // Validate timestamp format
  const generatedTime = parseInt(timestamp, 10);
  if (isNaN(generatedTime)) {
    return res.status(400).json({ valid: false, message: 'Invalid timestamp in QR code' });
  }

  const currentTime = Date.now();
  const ageMinutes = (currentTime - generatedTime) / 60000;

  // QR codes valid for 24 hours
  if (ageMinutes > 1440) {
    return res.status(400).json({ valid: false, message: 'QR code expired (generated 24+ hours ago)' });
  }

  // Validate employee exists in database
  try {
    const normalizedEmployeeId = String(employeeId || '').trim().toUpperCase();
    const { employee } = await getEmployeeByCode(normalizedEmployeeId);
    
    if (!employee) {
      return res.status(404).json({ 
        valid: false, 
        message: `Employee not found: ${normalizedEmployeeId}`,
        employeeId: normalizedEmployeeId 
      });
    }

    // Validate employee is active
    if (employee.record_status !== 'Active') {
      return res.status(400).json({ 
        valid: false, 
        message: `Employee is not active: ${employee.record_status}` 
      });
    }

    res.json({ 
      valid: true, 
      employeeId: employee.employee_code,
      employeeName: `${employee.first_name} ${employee.last_name}`,
      ageMinutes: Math.round(ageMinutes) 
    });
  } catch (err) {
    console.error('[QR Validation] Database error:', err);
    return res.status(500).json({ valid: false, message: 'Database error', error: err.message });
  }
});

// ========== SALARY RECEIPT ROUTES ==========

// Generate salary receipt (PDF)
app.get('/salary/receipt/:id', authenticateToken, async (req, res) => {
  const { id } = req.params;

  try {
    const { data: record, error } = await db
      .from('salary_records')
      .select('salary_id, employee_id, pay_period_start, pay_period_end, salary_amount, status, release_date, employees:employee_id(employee_code, first_name, middle_name, last_name, email_address, departments:department_id(department_name))')
      .eq('salary_id', id)
      .single();

    if (error || !record) {
      return res.status(404).json({ message: 'Salary record not found' });
    }

    // Verify authorization
    if (req.user.role !== 'admin' && req.user.role !== 'super_admin' && req.user.employeeId !== record.employee_id) {
      return res.status(403).json({ message: 'Unauthorized' });
    }

    const employee = record.employees || {};

    // Create PDF
    const doc = new PDFDocument({ bufferPages: true, margin: 50 });
    const filename = `salary_receipt_${employee.employee_code}_${new Date().toISOString().split('T')[0]}.pdf`;

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

    doc.pipe(res);

    const pdfFonts = configurePdfFonts(doc);

    // Header
    doc.fontSize(20).font(pdfFonts.bold).text('Gracewell NEXUS', { align: 'center' });
    doc.fontSize(14).font(pdfFonts.regular).text('SALARY RECEIPT', { align: 'center' });
    doc.moveDown(0.5);

    // Receipt Details
    doc.fontSize(12).font(pdfFonts.bold).text('Receipt Number:', { underline: true });
    doc.font(pdfFonts.regular).text(`SAL-${record.id}-${new Date().getFullYear()}`);
    doc.moveDown(0.3);

    doc.fontSize(12).font(pdfFonts.bold).text('Date Issued:', { underline: true });
    doc.font(pdfFonts.regular).text(new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }));
    doc.moveDown(1);

    // Employee Information
    doc.fontSize(13).font(pdfFonts.bold).text('EMPLOYEE INFORMATION', { underline: true });
    doc.fontSize(11).font(pdfFonts.regular);
    doc.text(`Name: ${buildEmployeeName(employee)}`);
    doc.text(`Employee ID: ${employee.employee_code}`);
    doc.text(`Department: ${employee.departments?.department_name || 'N/A'}`);
    doc.text(`Email: ${employee.email_address || '-'}`);
    doc.moveDown(1);

    // Salary Details
    doc.fontSize(13).font(pdfFonts.bold).text('SALARY DETAILS', { underline: true });
    doc.fontSize(11).font(pdfFonts.regular);
    doc.text(`Period: ${record.pay_period_start} to ${record.pay_period_end}`);
    doc.text(`Amount: ${formatPesoAmount(record.salary_amount, pdfFonts.pesoSign)}`);
    doc.text(`Status: ${record.status}`);
    doc.text(`Released Date: ${record.release_date ? new Date(record.release_date).toLocaleDateString('en-US') : 'Not Released'}`);
    doc.moveDown(1);

    // Footer
    doc.fontSize(10).font(pdfFonts.regular).text('This is an official receipt. Keep it for your records.', { align: 'center' });
    doc.text(`Generated: ${new Date().toLocaleString('en-US')}`, { align: 'center' });

    doc.end();
  } catch (err) {
    return res.status(500).json({ message: 'Database error', error: err.message });
  }
});

// ========== REPORTS/EXPORT ROUTES ==========

// Export attendance report
app.post('/reports/attendance', authenticateToken, async (req, res) => {
  if (req.user.role !== 'admin' && req.user.role !== 'super_admin' && req.user.role !== 'manager') {
    return res.status(403).json({ message: 'Unauthorized' });
  }

  const { startDate, endDate, format = 'json' } = req.body;
  const safeFormat = String(format || 'json').toLowerCase();

  try {
    // Fetch attendance records for the date range
    const { data: records, error } = await db
      .from('attendance')
      .select('attendance_id, attendance_date, check_in_time, check_out_time, employees:employee_id(employee_code, first_name, middle_name, last_name, departments:department_id(department_name))')
      .gte('attendance_date', startDate)
      .lte('attendance_date', endDate)
      .order('attendance_date', { ascending: false });

    if (error) {
      return res.status(500).json({ message: 'Database error' });
    }

    // Format records for export
    const formattedRecords = (records || []).map(r => {
      const employee = r.employees || {};
      
      // Format date as MM/DD/YYYY (prevent wrapping)
      const formatDate = (dateStr) => {
        if (!dateStr) return '-';
        try {
          const date = new Date(dateStr + 'T00:00:00Z');
          const month = String(date.getUTCMonth() + 1).padStart(2, '0');
          const day = String(date.getUTCDate()).padStart(2, '0');
          const year = date.getUTCFullYear();
          return `${month}/${day}/${year}`;
        } catch (e) {
          return dateStr;
        }
      };

      // Consistent time formatting for all export formats
      const formatTime = (timeStr) => {
        if (!timeStr) return '-';
        try {
          const timeParts = timeStr.split(':');
          const hours = parseInt(timeParts[0], 10);
          const minutes = timeParts[1] || '00';
          const ampm = hours >= 12 ? 'PM' : 'AM';
          const displayHours = hours % 12 || 12;
          return `${displayHours}:${minutes} ${ampm}`;
        } catch (e) {
          return timeStr;
        }
      };
      
      // Truncate names to 20 characters max
      const truncateName = (fullName) => {
        if (!fullName) return '-';
        if (fullName.length > 20) {
          return fullName.substring(0, 17) + '...';
        }
        return fullName;
      };
      
      const checkIn = formatTime(r.check_in_time);
      const checkOut = formatTime(r.check_out_time);
      // Calculate status from check_in/check_out times
      let status = 'Absent';
      if (r.check_in_time && r.check_out_time) {
        status = 'Present';
      } else if (r.check_in_time) {
        status = 'Incomplete';
      }
      
      return {
        employeeCode: String(employee.employee_code || '-').substring(0, 10),
        name: truncateName(buildEmployeeName(employee)) || '-',
        department: String(employee.departments?.department_name || 'N/A').substring(0, 18),
        date: formatDate(r.attendance_date),
        checkIn,
        checkOut,
        status
      };
    });

    // CSV Format
    if (safeFormat === 'csv') {
      const headers = ['Employee ID', 'Name', 'Department', 'Date', 'Check In', 'Check Out', 'Status'];
      const escapeCsv = (value) => {
        const stringValue = String(value ?? '');
        if (/[",\n]/.test(stringValue)) {
          return `"${stringValue.replace(/"/g, '""')}"`;
        }
        return stringValue;
      };

      const csvRows = formattedRecords.map(r => [
        r.employeeCode,
        r.name,
        r.department,
        r.date,
        r.checkIn,
        r.checkOut,
        r.status
      ].map(escapeCsv).join(','));

      const csv = [headers.join(','), ...csvRows].join('\n');
      res.set('Content-Type', 'text/csv');
      res.set('Content-Disposition', `attachment; filename="attendance_${startDate}_${endDate}.csv"`);
      return res.send(csv);
    }

    // Excel Format
    if (safeFormat === 'xlsx') {
      const workbook = new ExcelJS.Workbook();
      const worksheet = workbook.addWorksheet('Attendance Report');

      worksheet.columns = [
        { header: 'Employee ID', key: 'employeeCode', width: 14 },
        { header: 'Name', key: 'name', width: 24 },
        { header: 'Department', key: 'department', width: 18 },
        { header: 'Date', key: 'date', width: 12 },
        { header: 'Check In', key: 'checkIn', width: 12 },
        { header: 'Check Out', key: 'checkOut', width: 12 },
        { header: 'Status', key: 'status', width: 12 }
      ];

      // Style header row
      const headerRow = worksheet.getRow(1);
      headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4472C4' } };
      headerRow.alignment = { horizontal: 'center', vertical: 'middle' };

      // Add data rows
      formattedRecords.forEach(record => {
        const row = worksheet.addRow(record);
        
        // Color code status
        const statusCell = row.getCell('status');
        if (record.status === 'Present') {
          statusCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFC6EFCE' } };
          statusCell.font = { color: { argb: 'FF006100' } };
        } else {
          statusCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFC7CE' } };
          statusCell.font = { color: { argb: 'FF9C0006' } };
        }
      });

      res.set('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.set('Content-Disposition', `attachment; filename="attendance_${startDate}_${endDate}.xlsx"`);
      
      return workbook.xlsx.write(res).then(() => {
        res.end();
      }).catch(err => {
        console.error('Excel write error:', err);
        res.status(500).json({ message: 'Failed to generate Excel file' });
      });
    }

    // PDF Format
    if (safeFormat === 'pdf') {
      const doc = new PDFDocument({ margin: 30, size: 'A4', layout: 'landscape' });
      const pdfFonts = configurePdfFonts(doc);
      const logoPath = resolveReportLogoPath();

      res.set('Content-Type', 'application/pdf');
      res.set('Content-Disposition', `attachment; filename="attendance_${startDate}_${endDate}.pdf"`);
      doc.pipe(res);

      if (logoPath) {
        const logoWidth = 36;
        const logoX = (doc.page.width - logoWidth) / 2;
        doc.image(logoPath, logoX, 22, { width: logoWidth });
        doc.y = 62;
      }

      doc.fontSize(11).font(pdfFonts.bold).text('Gracewell NEXUS', { align: 'center' });
      doc.moveDown(0.2);

      // Title
      doc.fontSize(16).font(pdfFonts.bold).text('Attendance Report', { align: 'center' });
      doc.moveDown(0.3);

      // Report info
      doc.fontSize(9).font(pdfFonts.regular);
      doc.text(`Period: ${startDate} to ${endDate}`, { align: 'center' });
      doc.text(`Generated: ${new Date().toLocaleString()}`, { align: 'center' });
      doc.text(`Total Records: ${formattedRecords.length}`, { align: 'center' });
      doc.moveDown(0.7);

      // Table configuration with fixed widths
      const colWidths = {
        empId: 65,
        name: 100,
        dept: 90,
        date: 65,
        checkIn: 65,
        checkOut: 70,
        status: 60
      };

      const totalWidth = Object.values(colWidths).reduce((a, b) => a + b, 0);
      const pageWidth = doc.page.width - 60;
      const scale = pageWidth / totalWidth;

      // Scale all widths proportionally
      Object.keys(colWidths).forEach(key => {
        colWidths[key] = colWidths[key] * scale;
      });

      const startX = 30;
      const rowHeight = 16;
      const headerHeight = 20;
      let yPos = doc.y;
      const pageHeight = doc.page.height - 50;

      // Helper function to draw a cell
      const drawCell = (x, y, width, height, text, options = {}) => {
        const { fillColor, textColor, fontSize = 8, bold = false, align = 'left' } = options;
        
        // Draw cell border
        doc.rect(x, y, width, height).stroke();
        
        // Fill background if specified
        if (fillColor) {
          doc.fillColor(fillColor).rect(x, y, width, height).fill();
          doc.fillColor('black');
        }

        // Draw text
        const textY = y + (height - 9) / 2;
        const font = bold ? pdfFonts.bold : pdfFonts.regular;
        const truncatedText = truncateText(text, width, fontSize, font);
        
        doc.fontSize(fontSize).font(font).fillColor(textColor || 'black');
        doc.text(truncatedText, x + 3, textY, { width: width - 6, align, lineBreak: false });
      };

      // Helper to truncate text to fit width
      const truncateText = (text, width, fontSize, font) => {
        const charWidth = fontSize * 0.5;
        const maxChars = Math.floor((width - 6) / charWidth);
        if (text && text.length > maxChars) {
          return text.substring(0, maxChars - 2) + '...';
        }
        return text || '-';
      };

      // Draw header row
      let currentX = startX;
      const headers = ['Employee ID', 'Name', 'Department', 'Date', 'Check In', 'Check Out', 'Status'];
      const headerWidths = [colWidths.empId, colWidths.name, colWidths.dept, colWidths.date, colWidths.checkIn, colWidths.checkOut, colWidths.status];

      headers.forEach((header, idx) => {
        drawCell(currentX, yPos, headerWidths[idx], headerHeight, header, {
          fillColor: '#4472C4',
          textColor: 'white',
          fontSize: 8,
          bold: true,
          align: 'center'
        });
        currentX += headerWidths[idx];
      });

      yPos += headerHeight;
      doc.moveDown(1.2);
      yPos = doc.y;

      // Draw data rows
      formattedRecords.forEach((record, index) => {
        // Check if we need a new page
        if (yPos + rowHeight > pageHeight) {
          doc.addPage();
          yPos = 30;

          // Repeat header on new page
          currentX = startX;
          headers.forEach((header, idx) => {
            drawCell(currentX, yPos, headerWidths[idx], headerHeight, header, {
              fillColor: '#4472C4',
              textColor: 'white',
              fontSize: 8,
              bold: true,
              align: 'center'
            });
            currentX += headerWidths[idx];
          });
          yPos += headerHeight;
        }

        // Draw row
        const rowData = [record.employeeCode, record.name, record.department, record.date, record.checkIn, record.checkOut, record.status];
        currentX = startX;
        let maxRowHeight = rowHeight;

        rowData.forEach((data, idx) => {
          const statusColor = record.status === 'Present' ? '#C6EFCE' : record.status === 'Incomplete' ? '#FFEB9C' : '#FFCCCC';
          const textColor = record.status === 'Present' ? '#006100' : record.status === 'Incomplete' ? '#9C6500' : '#9C0006';
          
          drawCell(currentX, yPos, headerWidths[idx], rowHeight + 2, data, {
            fillColor: idx === 6 ? statusColor : (index % 2 === 0 ? '#F8F9FA' : 'white'),
            textColor: idx === 6 ? textColor : 'black',
            fontSize: 8,
            align: idx === 6 ? 'center' : (idx === 3 ? 'center' : 'left')
          });
          currentX += headerWidths[idx];
        });

        yPos += rowHeight + 2;
      });

      doc.end();
      return;
    }

    // JSON Format (default)
    res.json({ 
      records: formattedRecords, 
      format: 'json', 
      generatedAt: new Date().toISOString(),
      count: formattedRecords.length
    });
  } catch (err) {
    console.error('Attendance export error:', err);
    return res.status(500).json({ message: 'Failed to export attendance report', error: err.message });
  }
});

// Export salary report
app.post('/reports/salary', authenticateToken, async (req, res) => {
  if (req.user.role !== 'admin' && req.user.role !== 'super_admin') {
    return res.status(403).json({ message: 'Unauthorized' });
  }

  const { startDate, endDate, format = 'json' } = req.body;
  const safeFormat = String(format || 'json').toLowerCase();

  try {
    const { data: records, error } = await db
      .from('salary_records')
      .select('salary_id, pay_period_start, pay_period_end, salary_amount, status, employees:employee_id(employee_code, first_name, middle_name, last_name, departments:department_id(department_name))')
      .gte('pay_period_end', startDate)
      .lte('pay_period_start', endDate)
      .order('pay_period_end', { ascending: false });

    if (error) {
      return res.status(500).json({ message: 'Database error' });
    }

    // Format records for export
    const formattedRecords = (records || []).map(r => {
      const employee = r.employees || {};
      return {
        employeeCode: employee.employee_code || '-',
        name: buildEmployeeName(employee) || '-',
        department: employee.departments?.department_name || 'N/A',
        periodStart: r.pay_period_start || '-',
        periodEnd: r.pay_period_end || '-',
        amount: r.salary_amount || 0,
        status: r.status || 'Pending'
      };
    });

    // CSV Format
    if (safeFormat === 'csv') {
      const headers = ['Employee ID', 'Name', 'Department', 'Period Start', 'Period End', 'Amount', 'Status'];
      const escapeCsv = (value) => {
        const stringValue = String(value ?? '');
        if (/[",\n]/.test(stringValue)) {
          return `"${stringValue.replace(/"/g, '""')}"`;
        }
        return stringValue;
      };

      const csvRows = formattedRecords.map(r => [
        r.employeeCode,
        r.name,
        r.department,
        r.periodStart,
        r.periodEnd,
        `₱${parseFloat(r.amount).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
        r.status
      ].map(escapeCsv).join(','));

      const csv = [headers.join(','), ...csvRows].join('\n');
      res.set('Content-Type', 'text/csv');
      res.set('Content-Disposition', `attachment; filename="salary_${startDate}_${endDate}.csv"`);
      return res.send(csv);
    }

    // Excel Format
    if (safeFormat === 'xlsx') {
      const workbook = new ExcelJS.Workbook();
      const worksheet = workbook.addWorksheet('Salary Report');

      worksheet.columns = [
        { header: 'Employee ID', key: 'employeeCode', width: 14 },
        { header: 'Name', key: 'name', width: 24 },
        { header: 'Department', key: 'department', width: 18 },
        { header: 'Period Start', key: 'periodStart', width: 14 },
        { header: 'Period End', key: 'periodEnd', width: 14 },
        { header: 'Amount', key: 'amount', width: 14 },
        { header: 'Status', key: 'status', width: 12 }
      ];

      // Style header row
      const headerRow = worksheet.getRow(1);
      headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4472C4' } };
      headerRow.alignment = { horizontal: 'center', vertical: 'middle' };

      // Add data rows
      formattedRecords.forEach(record => {
        const row = worksheet.addRow(record);
        
        // Format amount as currency
        const amountCell = row.getCell('amount');
        amountCell.numFmt = '₱#,##0.00';
        
        // Color code status
        const statusCell = row.getCell('status');
        if (record.status === 'Released' || record.status === 'Paid') {
          statusCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFC6EFCE' } };
          statusCell.font = { color: { argb: 'FF006100' } };
        } else if (record.status === 'Pending') {
          statusCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFEAA7' } };
          statusCell.font = { color: { argb: 'FF856404' } };
        }
      });

      res.set('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.set('Content-Disposition', `attachment; filename="salary_${startDate}_${endDate}.xlsx"`);
      
      await workbook.xlsx.write(res);
      res.end();
      return;
    }

    // PDF Format
    if (safeFormat === 'pdf') {
      const doc = new PDFDocument({ margin: 30, size: 'A4', layout: 'landscape' });
      const pdfFonts = configurePdfFonts(doc);
      const logoPath = resolveReportLogoPath();

      res.set('Content-Type', 'application/pdf');
      res.set('Content-Disposition', `attachment; filename="salary_${startDate}_${endDate}.pdf"`);
      doc.pipe(res);

      // Calculate total amount
      const totalAmount = formattedRecords.reduce((sum, r) => sum + (parseFloat(r.amount) || 0), 0);

      if (logoPath) {
        const logoWidth = 36;
        const logoX = (doc.page.width - logoWidth) / 2;
        doc.image(logoPath, logoX, 22, { width: logoWidth });
        doc.y = 62;
      }

      doc.fontSize(11).font(pdfFonts.bold).text('Gracewell NEXUS', { align: 'center' });
      doc.moveDown(0.2);

      // Title
      doc.fontSize(16).font(pdfFonts.bold).text('Salary Report', { align: 'center' });
      doc.moveDown(0.3);

      // Report info
      doc.fontSize(9).font(pdfFonts.regular);
      doc.text(`Period: ${startDate} to ${endDate}`, { align: 'center' });
      doc.text(`Generated: ${new Date().toLocaleString()}`, { align: 'center' });
      doc.text(`Total Records: ${formattedRecords.length}`, { align: 'center' });
      doc.moveDown(0.7);

      // Table configuration with fixed widths
      const colWidths = {
        empId: 65,
        name: 100,
        dept: 90,
        periodStart: 70,
        periodEnd: 70,
        amount: 80,
        status: 60
      };

      const totalWidth = Object.values(colWidths).reduce((a, b) => a + b, 0);
      const pageWidth = doc.page.width - 60;
      const scale = pageWidth / totalWidth;

      // Scale all widths proportionally
      Object.keys(colWidths).forEach(key => {
        colWidths[key] = colWidths[key] * scale;
      });

      const startX = 30;
      const rowHeight = 16;
      const headerHeight = 20;
      let yPos = doc.y;
      const pageHeight = doc.page.height - 50;

      // Helper function to draw a cell
      const drawCell = (x, y, width, height, text, options = {}) => {
        const { fillColor, textColor, fontSize = 8, bold = false, align = 'left' } = options;
        
        // Draw cell border
        doc.rect(x, y, width, height).stroke();
        
        // Fill background if specified
        if (fillColor) {
          doc.fillColor(fillColor).rect(x, y, width, height).fill();
          doc.fillColor('black');
        }

        // Draw text
        const textY = y + (height - 9) / 2;
        const font = bold ? pdfFonts.bold : pdfFonts.regular;
        const truncatedText = truncateText(text, width, fontSize, font);
        
        doc.fontSize(fontSize).font(font).fillColor(textColor || 'black');
        doc.text(truncatedText, x + 3, textY, { width: width - 6, align, lineBreak: false });
      };

      // Helper to truncate text to fit width
      const truncateText = (text, width, fontSize, font) => {
        const charWidth = fontSize * 0.5;
        const maxChars = Math.floor((width - 6) / charWidth);
        if (text && text.length > maxChars) {
          return text.substring(0, maxChars - 2) + '...';
        }
        return text || '-';
      };

      // Draw header row
      let currentX = startX;
      const headers = ['Employee ID', 'Name', 'Department', 'Period Start', 'Period End', 'Amount', 'Status'];
      const headerWidths = [colWidths.empId, colWidths.name, colWidths.dept, colWidths.periodStart, colWidths.periodEnd, colWidths.amount, colWidths.status];

      headers.forEach((header, idx) => {
        drawCell(currentX, yPos, headerWidths[idx], headerHeight, header, {
          fillColor: '#4472C4',
          textColor: 'white',
          fontSize: 8,
          bold: true,
          align: 'center'
        });
        currentX += headerWidths[idx];
      });

      yPos += headerHeight;
      doc.moveDown(1.2);
      yPos = doc.y;

      // Draw data rows
      formattedRecords.forEach((record, index) => {
        // Check if we need a new page
        if (yPos + rowHeight > pageHeight) {
          doc.addPage();
          yPos = 30;

          // Repeat header on new page
          currentX = startX;
          headers.forEach((header, idx) => {
            drawCell(currentX, yPos, headerWidths[idx], headerHeight, header, {
              fillColor: '#4472C4',
              textColor: 'white',
              fontSize: 8,
              bold: true,
              align: 'center'
            });
            currentX += headerWidths[idx];
          });
          yPos += headerHeight;
        }

        // Format amount with ₱ symbol
        const amountText = formatPesoAmount(record.amount, pdfFonts.pesoSign);
        
        // Draw row
        const rowData = [record.employeeCode, record.name, record.department, record.periodStart, record.periodEnd, amountText, record.status];
        currentX = startX;
        let maxRowHeight = rowHeight;

        rowData.forEach((data, idx) => {
          const statusColor = record.status === 'Released' ? '#C6EFCE' : record.status === 'Pending' ? '#FFEB9C' : '#FFCCCC';
          const textColor = record.status === 'Released' ? '#006100' : record.status === 'Pending' ? '#9C6500' : '#9C0006';
          
          drawCell(currentX, yPos, headerWidths[idx], rowHeight + 2, data, {
            fillColor: idx === 6 ? statusColor : (index % 2 === 0 ? '#F8F9FA' : 'white'),
            textColor: idx === 6 ? textColor : 'black',
            fontSize: 8,
            align: idx === 6 ? 'center' : (idx === 5 ? 'right' : (idx === 3 || idx === 4 ? 'center' : 'left'))
          });
          currentX += headerWidths[idx];
        });

        yPos += rowHeight + 2;
      });

      // Add grand total at the bottom
      doc.moveDown(0.5);
      doc.fontSize(10).font(pdfFonts.bold).fillColor('black');
      doc.text(`Grand Total: ${formatPesoAmount(totalAmount, pdfFonts.pesoSign)}`, { align: 'right' });

      doc.end();
      return;
    }

    // JSON Format (default)
    res.json({ 
      records: formattedRecords, 
      format: 'json', 
      generatedAt: new Date().toISOString(),
      count: formattedRecords.length,
      totalAmount: formattedRecords.reduce((sum, r) => sum + (parseFloat(r.amount) || 0), 0)
    });
  } catch (err) {
    console.error('Salary export error:', err);
    return res.status(500).json({ message: 'Failed to export salary report', error: err.message });
  }
});

// ========== AUDIT LOG ROUTES ==========

app.post('/audit/log', authenticateToken, async (req, res) => {
  const { action, details } = req.body;
  const userId = req.user.userId || null;

  try {
    const { error } = await db
      .from('audit_logs')
      .insert({
        user_id: userId,
        action,
        module: details?.module || null,
        notes: JSON.stringify(details || {})
      });

    if (error) {
      console.error('Audit log error:', error);
      return res.status(500).json({ message: 'Failed to log audit' });
    }
    res.json({ success: true });
  } catch (err) {
    return res.status(500).json({ message: 'Database error', error: err.message });
  }
});

// Get audit logs (admin only)
app.get('/audit/logs', authenticateToken, async (req, res) => {
  if (req.user.role !== 'admin' && req.user.role !== 'super_admin') {
    return res.status(403).json({ message: 'Unauthorized' });
  }

  const { limit = 100, offset = 0 } = req.query;

  try {
    const { data: logs, error } = await db
      .from('audit_logs')
      .select('*, user_accounts:user_id(user_id, employees:employee_id(employee_code, first_name, middle_name, last_name))')
      .order('timestamp', { ascending: false })
      .range(parseInt(offset), parseInt(offset) + parseInt(limit) - 1);

    if (error) {
      return res.status(500).json({ message: 'Database error' });
    }
    res.json({ logs: logs || [] });
  } catch (err) {
    return res.status(500).json({ message: 'Database error', error: err.message });
  }
});

// ========== ATTENDANCE CORRECTION REQUESTS ==========

// Employee submits attendance correction request
app.post('/attendance/correction-request', authenticateToken, upload.single('proofFile'), async (req, res) => {
  const { attendanceId, requestedCheckIn, requestedCheckOut, reason } = req.body;
  const userId = req.user.userId;
  const proofFile = req.file;

  if (!attendanceId || (!requestedCheckIn && !requestedCheckOut)) {
    return res.status(400).json({ message: 'Attendance ID and at least one corrected time are required' });
  }

  if (!reason || !reason.trim()) {
    return res.status(400).json({ message: 'Reason for correction is required' });
  }

  if (proofFile && !String(proofFile.mimetype || '').startsWith('image/')) {
    return res.status(400).json({ message: 'Only image proof files are allowed' });
  }

  try {
    // Verify attendance record exists
    const { data: attendance, error: fetchError } = await db
      .from('attendance')
      .select('attendance_id, employee_id')
      .eq('attendance_id', attendanceId)
      .single();

    if (fetchError || !attendance) {
      return res.status(404).json({ message: 'Attendance record not found' });
    }

    let proofUrl = null;
    let proofPath = null;
    let proofBucket = null;

    if (proofFile && supabase) {
      // Use attendance-images bucket for correction proofs (or dedicated bucket if configured)
      const bucket = getCorrectionProofBucket();
      const extension = proofFile.mimetype.split('/')[1] || 'jpg';
      const fileName = `correction-proofs/${attendanceId}-${Date.now()}.${extension}`;
      proofPath = fileName;
      proofBucket = bucket;

      try {
        const { error: uploadError } = await supabase.storage
          .from(bucket)
          .upload(fileName, proofFile.buffer, {
            contentType: proofFile.mimetype,
            upsert: true
          });

        if (uploadError) {
          console.error('Correction proof upload error:', uploadError);
          return res.status(500).json({ message: `Failed to upload correction proof: ${uploadError.message}` });
        }

        const { data: publicData } = supabase.storage.from(bucket).getPublicUrl(fileName);
        proofUrl = publicData?.publicUrl || null;
      } catch (uploadErr) {
        console.error('Correction proof upload exception:', uploadErr);
        return res.status(500).json({ message: 'Failed to upload correction proof to storage' });
      }
    }

    // Create correction request in attendance_issues table
    const { error: insertError } = await db
      .from('attendance_issues')
      .insert({
        attendance_id: attendanceId,
        issue_type: 'Correction',
        description: JSON.stringify({
          requestedCheckIn: requestedCheckIn || null,
          requestedCheckOut: requestedCheckOut || null,
          reason: reason.trim(),
          proofUrl: proofUrl || null,
          proofPath: proofPath || null,
          proofBucket: proofBucket || null,
          proofMimeType: proofFile?.mimetype || null,
          proofOriginalName: proofFile?.originalname || null
        }),
        reported_by: userId,
        reported_at: new Date().toISOString(),
        status: 'Pending'
      });

    if (insertError) {
      console.error('Correction request insert error:', insertError);
      return res.status(500).json({ message: 'Failed to create correction request' });
    }

    // Log audit
    await db
      .from('audit_logs')
      .insert({
        user_id: userId,
        action: 'ATTENDANCE_CORRECTION_REQUEST',
        module: 'attendance',
        notes: JSON.stringify({
          attendanceId,
          requestedCheckIn,
          requestedCheckOut,
          reason: reason.trim(),
          proofUrl: proofUrl || null,
          hasProof: !!proofUrl
        })
      });

    res.json({ success: true, message: 'Correction request submitted successfully' });
  } catch (err) {
    console.error('Correction request error:', err);
    return res.status(500).json({ message: 'Failed to process correction request', error: err.message });
  }
});

// Get pending correction requests (manager/admin)
app.get('/attendance/correction-requests', authenticateToken, async (req, res) => {
  if (req.user.role !== 'admin' && req.user.role !== 'super_admin' && req.user.role !== 'manager') {
    return res.status(403).json({ message: 'Unauthorized' });
  }

  const { status = 'Pending' } = req.query;

  try {
    const { data: issues, error } = await db
      .from('attendance_issues')
      .select(`
        issue_id,
        attendance_id,
        description,
        reported_at,
        status,
        resolved_at,
        attendance:attendance_id (
          attendance_id,
          attendance_date,
          check_in_time,
          check_out_time,
          employee_id,
          employees:employee_id (
            employee_code,
            first_name,
            middle_name,
            last_name,
            department_id,
            departments:department_id (
              department_name
            )
          )
        ),
        user_accounts:reported_by (
          user_id
        )
      `)
      .eq('issue_type', 'Correction')
      .eq('status', status)
      .order('reported_at', { ascending: false });

    if (error) {
      console.error('Fetch correction requests error:', error);
      return res.status(500).json({ message: 'Failed to fetch correction requests' });
    }

    const formatted = (issues || []).map(issue => {
      const attendance = issue.attendance || {};
      const employee = attendance.employees || {};
      const department = employee.departments || {};
      let correctionDetails = {};
      
      try {
        correctionDetails = JSON.parse(issue.description || '{}');
      } catch (e) {
        correctionDetails = { reason: issue.description };
      }

      return {
        issueId: issue.issue_id,
        attendanceId: issue.attendance_id,
        employeeName: [employee.first_name, employee.middle_name, employee.last_name].filter(Boolean).join(' '),
        employeeCode: employee.employee_code,
        department: department.department_name || 'N/A',
        attendanceDate: attendance.attendance_date,
        currentCheckIn: attendance.check_in_time,
        currentCheckOut: attendance.check_out_time,
        requestedCheckIn: correctionDetails.requestedCheckIn,
        requestedCheckOut: correctionDetails.requestedCheckOut,
        reason: correctionDetails.reason,
        proofUrl: correctionDetails.proofUrl || null,
        proofPath: correctionDetails.proofPath || null,
        proofBucket: correctionDetails.proofBucket || null,
        proofOriginalName: correctionDetails.proofOriginalName || null,
        requestedAt: issue.reported_at,
        status: issue.status,
        resolvedAt: issue.resolved_at
      };
    });

    res.json({ requests: formatted });
  } catch (err) {
    console.error('Correction requests error:', err);
    return res.status(500).json({ message: 'Failed to fetch correction requests', error: err.message });
  }
});

// Get signed proof URL for correction request (admin/manager/super_admin)
app.get('/attendance/correction-request/:issueId/proof-url', authenticateToken, async (req, res) => {
  if (req.user.role !== 'admin' && req.user.role !== 'super_admin' && req.user.role !== 'manager') {
    return res.status(403).json({ message: 'Unauthorized' });
  }

  const { issueId } = req.params;
  const download = String(req.query.download || '').toLowerCase() === '1' || String(req.query.download || '').toLowerCase() === 'true';

  try {
    const { data: issue, error } = await db
      .from('attendance_issues')
      .select('issue_id, description')
      .eq('issue_id', issueId)
      .eq('issue_type', 'Correction')
      .single();

    if (error || !issue) {
      return res.status(404).json({ message: 'Correction request not found' });
    }

    let details = {};
    try {
      details = JSON.parse(issue.description || '{}');
    } catch (err) {
      details = {};
    }

    if (!details.proofUrl && !details.proofPath) {
      return res.status(404).json({ message: 'No proof image attached to this correction request' });
    }

    const downloadName = details.proofOriginalName || `correction-proof-${issueId}.jpg`;
    const { signedUrl, error: signedError, bucket, filePath, expiresIn } = await createCorrectionProofSignedUrl(details, {
      expiresIn: 60 * 15,
      download,
      downloadFileName: downloadName
    });

    if (!signedUrl) {
      if (details.proofUrl) {
        return res.json({
          url: details.proofUrl,
          isSigned: false,
          fallback: true,
          message: signedError || 'Using fallback proof URL',
          proofBucket: bucket || null,
          proofPath: filePath || null
        });
      }
      return res.status(500).json({ message: signedError || 'Failed to generate proof access URL' });
    }

    return res.json({
      url: signedUrl,
      isSigned: true,
      expiresIn,
      proofBucket: bucket,
      proofPath: filePath
    });
  } catch (err) {
    console.error('Correction proof URL error:', err);
    return res.status(500).json({ message: 'Failed to generate correction proof URL', error: err.message });
  }
});

// Get approved correction notifications for employee bell
app.get('/notifications/employee-corrections', authenticateToken, async (req, res) => {
  if (req.user.role !== 'employee') {
    return res.status(403).json({ message: 'Unauthorized' });
  }

  try {
    const { data: issues, error } = await db
      .from('attendance_issues')
      .select(`
        issue_id,
        attendance_id,
        reported_by,
        description,
        resolution_notes,
        status,
        resolved_at,
        attendance:attendance_id (
          attendance_date,
          employee_id
        )
      `)
      .eq('issue_type', 'Correction')
      .eq('status', 'Approved')
      .order('resolved_at', { ascending: false })
      .limit(20);

    if (error) {
      console.error('[Employee Notifications] Fetch error:', error);
      return res.status(500).json({ message: 'Failed to fetch employee correction notifications' });
    }

    const employeeNotifications = (issues || []).filter((issue) => {
      const matchesReporter = issue?.reported_by != null && String(issue.reported_by) === String(req.user.userId);
      const matchesAttendanceEmployee = issue?.attendance?.employee_id != null && String(issue.attendance.employee_id) === String(req.user.employeeId);
      return matchesReporter || matchesAttendanceEmployee;
    });

    const notifications = employeeNotifications.map((issue) => {
      let details = {};
      try {
        details = typeof issue.description === 'string'
          ? JSON.parse(issue.description || '{}')
          : (issue.description || {});
      } catch (e) {
        details = {};
      }

      return {
        issueId: issue.issue_id,
        attendanceId: issue.attendance_id,
        attendanceDate: issue.attendance?.attendance_date || null,
        submittedNote: details.reason || null,
        resolutionNotes: issue.resolution_notes || null,
        resolvedAt: issue.resolved_at || null,
        message: 'Your correction request has been approved.'
      };
    });

    res.json({
      notifications,
      unreadCount: notifications.length
    });
  } catch (err) {
    console.error('Employee correction notifications error:', err);
    return res.status(500).json({ message: 'Failed to fetch employee correction notifications', error: err.message });
  }
});

// Mark employee approved correction notification as viewed
app.put('/notifications/employee-corrections/:issueId/viewed', authenticateToken, async (req, res) => {
  if (req.user.role !== 'employee') {
    return res.status(403).json({ message: 'Unauthorized' });
  }

  const { issueId } = req.params;
  if (!issueId) {
    return res.status(400).json({ message: 'issueId is required' });
  }

  try {
    const { data, error } = await db
      .from('attendance_issues')
      .update({ status: 'Viewed' })
      .eq('issue_id', issueId)
      .eq('issue_type', 'Correction')
      .eq('reported_by', req.user.userId)
      .eq('status', 'Approved')
      .select('issue_id');

    if (error) {
      console.error('Mark employee correction notification viewed error:', error);
      return res.status(500).json({ message: 'Failed to mark correction notification as viewed' });
    }

    if (!data || data.length === 0) {
      return res.status(404).json({ message: 'Notification not found or already acknowledged' });
    }

    res.json({ success: true });
  } catch (err) {
    console.error('Mark employee correction notification viewed error:', err);
    return res.status(500).json({ message: 'Failed to mark correction notification as viewed', error: err.message });
  }
});

// Get pending notifications (Corrections + Absences) for notification bell
app.get('/notifications/pending', authenticateToken, async (req, res) => {
  if (req.user.role !== 'admin' && req.user.role !== 'super_admin' && req.user.role !== 'manager') {
    return res.status(403).json({ message: 'Unauthorized' });
  }

  try {
    const { data: issues, error } = await db
      .from('attendance_issues')
      .select(`
        issue_id,
        attendance_id,
        issue_type,
        description,
        reported_at,
        status,
        attendance:attendance_id (
          attendance_date,
          employee_id,
          employees:employee_id (
            first_name,
            middle_name,
            last_name
          )
        )
      `)
      .eq('status', 'Pending')
      .order('reported_at', { ascending: false })
      .limit(10);

    if (error) {
      console.error('[Notifications] Fetch error:', error);
      return res.status(500).json({ message: 'Failed to fetch notifications' });
    }

    console.log('[Notifications] Raw issues count:', issues?.length || 0);
    console.log('[Notifications] Raw issues:', JSON.stringify(issues, null, 2));

    const notifications = (issues || []).map(issue => {
      const attendance = issue.attendance || {};
      const employee = attendance.employees || {};
      let details = {};
      
      try {
        details = JSON.parse(issue.description || '{}');
      } catch (e) {
        details = { reason: issue.description || 'N/A' };
      }

      return {
        issueId: issue.issue_id,
        attendanceId: issue.attendance_id,
        type: issue.issue_type,
        employeeName: [employee.first_name, employee.middle_name, employee.last_name]
          .filter(Boolean).join(' ') || 'Unknown',
        reason: details.reason || 'N/A',
        date: attendance.attendance_date,
        reportedAt: issue.reported_at
      };
    });

    // Count by type
    const correctionCount = notifications.filter(n => n.type === 'Correction').length;
    const absenceCount = notifications.filter(n => n.type === 'Absence').length;

    console.log('[Notifications Debug] Counts:', { correctionCount, absenceCount, total: notifications.length });

    res.json({ 
      notifications,
      counts: {
        correction: correctionCount,
        absence: absenceCount,
        total: correctionCount + absenceCount
      }
    });
  } catch (err) {
    console.error('Notifications error:', err);
    return res.status(500).json({ message: 'Failed to fetch notifications', error: err.message });
  }
});

// Mark notification as read (used for absence notifications)
app.put('/notifications/mark-read', authenticateToken, async (req, res) => {
  if (req.user.role !== 'admin' && req.user.role !== 'super_admin' && req.user.role !== 'manager') {
    return res.status(403).json({ message: 'Unauthorized' });
  }

  const { issueId } = req.body;
  if (!issueId) {
    return res.status(400).json({ message: 'issueId is required' });
  }

  try {
    const { error } = await db
      .from('attendance_issues')
      .update({ status: 'Viewed' })
      .eq('issue_id', issueId)
      .eq('issue_type', 'Absence');

    if (error) {
      console.error('Mark notification read error:', error);
      return res.status(500).json({ message: 'Failed to mark notification as read' });
    }

    res.json({ success: true });
  } catch (err) {
    console.error('Mark notification read error:', err);
    return res.status(500).json({ message: 'Failed to mark notification as read', error: err.message });
  }
});

// ========== ABSENCE NOTIFICATION ==========

// Employee submits absence notification with optional proof attachment
app.post('/absence/notify', authenticateToken, upload.single('proofFile'), async (req, res) => {
  const { employeeId, date, reason } = req.body;
  const userId = req.user.userId;
  const proofFile = req.file;

  if (!employeeId || !date) {
    return res.status(400).json({ message: 'Employee ID and date are required' });
  }

  console.log('[ABSENCE NOTIFY] Received request:', { employeeId, date, reason, userId });

  try {
    // Get the numeric employee_id from employee_code
    const { data: employeeData, error: employeeError } = await db
      .from('employees')
      .select('employee_id')
      .eq('employee_code', employeeId)
      .single();

    if (employeeError || !employeeData) {
      console.error('Employee lookup error:', employeeError);
      return res.status(404).json({ message: 'Employee not found' });
    }

    const numericEmployeeId = employeeData.employee_id;
    console.log('[ABSENCE NOTIFY] Found employee_id:', numericEmployeeId);

    let proofUrl = null;

    // Upload proof file to Supabase if provided
    if (proofFile && supabase) {
      const bucket = process.env.SUPABASE_BUCKET || 'attendance-images';
      const extension = proofFile.mimetype.includes('pdf') ? 'pdf' : proofFile.mimetype.split('/')[1] || 'jpg';
      const fileName = `absence-proofs/${employeeId}-${Date.now()}.${extension}`;

      const { error: uploadError } = await supabase.storage
        .from(bucket)
        .upload(fileName, proofFile.buffer, {
          contentType: proofFile.mimetype,
          upsert: true
        });

      if (uploadError) {
        console.error('Proof file upload error:', uploadError);
        return res.status(500).json({ message: 'Failed to upload proof file' });
      }

      const { data: publicData } = supabase.storage.from(bucket).getPublicUrl(fileName);
      if (publicData?.publicUrl) {
        proofUrl = publicData.publicUrl;
      }
    }

    // Create or get attendance record for this date
    let attendanceRecord;
    const { data: existingAttendance } = await db
      .from('attendance')
      .select('attendance_id')
      .eq('employee_id', numericEmployeeId)
      .eq('attendance_date', date)
      .maybeSingle();

    if (existingAttendance) {
      console.log('[ABSENCE NOTIFY] Using existing attendance record:', existingAttendance.attendance_id);
      attendanceRecord = existingAttendance;
    } else {
      // Create attendance record for absent day
      console.log('[ABSENCE NOTIFY] Creating new attendance record for employee_id:', numericEmployeeId);
      const { data: newAttendance, error: createError } = await db
        .from('attendance')
        .insert({
          employee_id: numericEmployeeId,
          attendance_date: date,
          check_in_time: null,
          check_out_time: null
        })
        .select('attendance_id')
        .single();

      if (createError) {
        console.error('Create attendance error:', createError);
        return res.status(500).json({ message: 'Failed to create attendance record', error: createError.message });
      }
      attendanceRecord = newAttendance;
      console.log('[ABSENCE NOTIFY] Created attendance record:', attendanceRecord.attendance_id);
    }

    // Create absence issue record
    const descriptionData = {
      reason: reason || 'No reason provided',
      proofUrl: proofUrl || null
    };

    const { error: issueError } = await db
      .from('attendance_issues')
      .insert({
        attendance_id: attendanceRecord.attendance_id,
        issue_type: 'Absence',
        description: JSON.stringify(descriptionData),
        reported_by: userId,
        status: 'Pending'
      });

    if (issueError) {
      console.error('Create absence issue error:', issueError);
      return res.status(500).json({ message: 'Failed to create absence notification' });
    }

    console.log('[ABSENCE NOTIFY] Successfully created absence issue for attendance_id:', attendanceRecord.attendance_id);

    // Verify the record was created
    const { data: verifyIssue, error: verifyError } = await db
      .from('attendance_issues')
      .select('issue_id, issue_type, status, attendance_id')
      .eq('attendance_id', attendanceRecord.attendance_id)
      .eq('issue_type', 'Absence')
      .eq('status', 'Pending')
      .single();

    if (verifyError) {
      console.error('[ABSENCE NOTIFY] Verification error:', verifyError);
    } else {
      console.log('[ABSENCE NOTIFY] Verified issue created:', verifyIssue);
    }

    // Log the absence notification in audit logs
    const { error: auditError } = await db
      .from('audit_logs')
      .insert({
        user_id: userId,
        action: 'ABSENCE_NOTIFY',
        module: 'attendance',
        notes: JSON.stringify({
          employeeId,
          date,
          reason: reason || null,
          proofUrl: proofUrl || null,
          hasProof: !!proofUrl
        })
      });

    if (auditError) {
      console.error('Audit log error:', auditError);
      // Continue even if audit log fails
    }

    res.json({ 
      success: true, 
      message: 'Absence notification submitted successfully',
      proofUploaded: !!proofUrl
    });
  } catch (err) {
    console.error('Absence notification error:', err);
    return res.status(500).json({ message: 'Failed to process absence notification', error: err.message });
  }
});

// ========== ADMIN DATABASE MANAGEMENT ==========

// Get database statistics
app.get('/admin/database/stats', authenticateToken, async (req, res) => {
  if (req.user.role !== 'super_admin' && req.user.role !== 'admin') {
    return res.status(403).json({ message: 'Admin access required' });
  }

  try {
    // Count users
    const { count: totalUsers } = await db
      .from('user_accounts')
      .select('*', { count: 'exact', head: true });

    // Count active employees
    const { data: employeeRole } = await db
      .from('roles')
      .select('role_id')
      .eq('role_name', 'employee')
      .single();

    const { count: activeEmployees } = await db
      .from('user_accounts')
      .select('*', { count: 'exact', head: true })
      .eq('account_status', 'ACTIVE')
      .eq('role_id', employeeRole?.role_id || 0);

    // Count attendance records
    const { count: attendanceRecords } = await db
      .from('attendance')
      .select('*', { count: 'exact', head: true });

    // Count salary records
    const { count: salaryRecords } = await db
      .from('salary_records')
      .select('*', { count: 'exact', head: true });

    // Get distinct roles
    const { data: roles } = await db
      .from('roles')
      .select('role_id');

    res.json({
      totalUsers: totalUsers || 0,
      activeEmployees: activeEmployees || 0,
      attendanceRecords: attendanceRecords || 0,
      salaryRecords: salaryRecords || 0,
      totalRoles: roles?.length || 0,
      databaseSize: 'Unknown'
    });
  } catch (err) {
    return res.status(500).json({ message: 'Database error', error: err.message });
  }
});

// Get table data
app.get('/admin/database/tables/:tableName', authenticateToken, async (req, res) => {
  if (req.user.role !== 'super_admin' && req.user.role !== 'admin') {
    return res.status(403).json({ message: 'Admin access required' });
  }

  const { tableName } = req.params;
  const limit = req.query.limit || 1000;

  // Sanitize table name to prevent SQL injection
  const allowedTables = [
    'departments',
    'roles',
    'employees',
    'user_accounts',
    'qr_codes',
    'attendance_scans',
    'attendance',
    'attendance_issues',
    'salary_records',
    'salary_receipts',
    'audit_logs'
  ];
  if (!allowedTables.includes(tableName)) {
    return res.status(400).json({ message: 'Invalid table name' });
  }

  try {
    const { data: rows, error } = await db
      .from(tableName)
      .select('*')
      .limit(parseInt(limit));

    if (error) {
      return res.status(500).json({ message: 'Database error', error: error.message });
    }
    res.json(rows || []);
  } catch (err) {
    return res.status(500).json({ message: 'Database error', error: err.message });
  }
});

// Delete record from table
app.delete('/admin/database/tables/:tableName/:id', authenticateToken, async (req, res) => {
  if (req.user.role !== 'super_admin' && req.user.role !== 'admin') {
    return res.status(403).json({ message: 'Admin access required' });
  }

  const { tableName, id } = req.params;
  const allowedTables = [
    'departments',
    'roles',
    'employees',
    'user_accounts',
    'qr_codes',
    'attendance_scans',
    'attendance',
    'attendance_issues',
    'salary_records',
    'salary_receipts',
    'audit_logs'
  ];

  if (!allowedTables.includes(tableName)) {
    return res.status(400).json({ message: 'Invalid table name' });
  }

  try {
    const idColumns = {
      departments: 'department_id',
      roles: 'role_id',
      employees: 'employee_id',
      user_accounts: 'user_id',
      qr_codes: 'qrcode_id',
      attendance_scans: 'scan_id',
      attendance: 'attendance_id',
      attendance_issues: 'issue_id',
      salary_records: 'salary_id',
      salary_receipts: 'receipt_id',
      audit_logs: 'log_id'
    };

    const idColumn = idColumns[tableName];
    if (!idColumn) {
      return res.status(400).json({ message: 'Invalid table name' });
    }

    const { error } = await db
      .from(tableName)
      .delete()
      .eq(idColumn, id);

    if (error) {
      return res.status(500).json({ message: 'Database error', error: error.message });
    }
    res.json({ message: 'Record deleted successfully' });
  } catch (err) {
    return res.status(500).json({ message: 'Database error', error: err.message });
  }
});

// Clear entire table (admin only)
app.delete('/admin/database/tables/:tableName/clear', authenticateToken, async (req, res) => {
  if (req.user.role !== 'super_admin') {
    return res.status(403).json({ message: 'Super admin access required' });
  }

  const { tableName } = req.params;
  const allowedTables = ['audit_logs'];

  if (!allowedTables.includes(tableName)) {
    return res.status(400).json({ message: 'Cannot clear this table' });
  }

  try {
    const { error } = await db
      .from(tableName)
      .delete()
      .neq('log_id', '');

    if (error) {
      return res.status(500).json({ message: 'Database error', error: error.message });
    }
    res.json({ message: 'Table cleared successfully' });
  } catch (err) {
    return res.status(500).json({ message: 'Database error', error: err.message });
  }
});

// Export table as CSV
app.get('/admin/database/export/:tableName', authenticateToken, async (req, res) => {
  if (req.user.role !== 'super_admin' && req.user.role !== 'admin') {
    return res.status(403).json({ message: 'Admin access required' });
  }

  const { tableName } = req.params;
  const allowedTables = [
    'departments',
    'roles',
    'employees',
    'user_accounts',
    'qr_codes',
    'attendance_scans',
    'attendance',
    'attendance_issues',
    'salary_records',
    'salary_receipts',
    'audit_logs'
  ];

  if (!allowedTables.includes(tableName)) {
    return res.status(400).json({ message: 'Invalid table name' });
  }

  try {
    const { data: rows, error } = await db
      .from(tableName)
      .select('*');

    if (error) {
      return res.status(500).json({ message: 'Database error' });
    }

    if (!rows || rows.length === 0) {
      return res.status(400).json({ message: 'No data to export' });
    }

    // Convert to CSV
    const headers = Object.keys(rows[0]).join(',');
    const csvContent = [headers, ...rows.map(row =>
      Object.values(row).map(val => `"${String(val).replace(/"/g, '""')}"`).join(',')
    )].join('\n');

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="${tableName}_export.csv"`);
    res.send(csvContent);
  } catch (err) {
    return res.status(500).json({ message: 'Database error', error: err.message });
  }
});

// ========== HEALTH CHECK ==========

app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Start server
const server = app.listen(PORT, async () => {
  console.log(`✅ Gracewell NEXUS Backend running on http://localhost:${PORT}`);
  console.log(`📊 Database: Supabase`);
  console.log(`🔐 JWT Secret: ${process.env.JWT_SECRET ? 'Configured' : 'Using development fallback (SET JWT_SECRET in .env)'}`);
  console.log(`📦 Supabase: ${supabase ? 'Connected' : 'Not configured'}`);

  // Initialize database (seed users if needed)
  try {
    console.log('Checking database tables...');
    if (db.initialize) {
      await db.initialize();
    }
  } catch (err) {
    console.error('Database initialization error:', err);
  }
});

module.exports = app;
