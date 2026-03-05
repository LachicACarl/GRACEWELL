// Backend API base URL (configure via REACT_APP_API_BASE_URL)
const API_BASE_URL = process.env.REACT_APP_API_BASE_URL || 'http://localhost:4000';

let authToken = null;

const resolveAuthToken = () => {
  if (authToken) return authToken;
  try {
    return (
      localStorage.getItem('accessToken') ||
      localStorage.getItem('qrScannerToken') ||
      localStorage.getItem('attendanceToken')
    );
  } catch {
    return null;
  }
};

const setAuthHeader = (token) => {
  authToken = token || null;
};

const buildHeaders = (headers = {}, body) => {
  const baseHeaders = { ...headers };
  if (!body || body instanceof FormData) {
    return baseHeaders;
  }
  if (!baseHeaders['Content-Type']) {
    baseHeaders['Content-Type'] = 'application/json';
  }
  return baseHeaders;
};

const request = async (method, path, body, options = {}) => {
  const url = `${API_BASE_URL}${path}`;
  const headers = buildHeaders(options.headers, body);

  const token = resolveAuthToken();
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const config = {
    method,
    headers
  };

  if (body !== undefined && body !== null) {
    config.body = body instanceof FormData ? body : JSON.stringify(body);
  }

  const response = await fetch(url, config);
  const text = await response.text();
  let data = null;

  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text || null;
  }

  if (!response.ok) {
    const error = new Error('Request failed');
    error.response = { status: response.status, data };
    throw error;
  }

  return { data };
};

export const apiClient = {
  get: (path, options) => request('GET', path, null, options),
  post: (path, body, options) => request('POST', path, body, options),
  put: (path, body, options) => request('PUT', path, body, options),
  delete: (path, options) => request('DELETE', path, null, options)
};

export const getAccessToken = () =>
  localStorage.getItem('accessToken') ||
  localStorage.getItem('qrScannerToken') ||
  localStorage.getItem('attendanceToken');

export const decodeJwt = (token) => {
  try {
    const payload = token.split('.')[1];
    return JSON.parse(atob(payload));
  } catch {
    return null;
  }
};

export const isTokenExpired = (token) => {
  const payload = decodeJwt(token);
  if (!payload?.exp) return true;
  const now = Math.floor(Date.now() / 1000);
  return payload.exp <= now;
};

export const loginUser = async (employeeId, password, captchaToken) => {
  try {
    console.log('[AUTH] Attempting login:', { employeeId, hasPassword: !!password, apiUrl: API_BASE_URL });
    const { data } = await apiClient.post('/auth/login', {
      employeeId,
      password,
      captchaToken
    });

    console.log('[AUTH] Login response received:', { hasToken: !!data?.accessToken, hasUser: !!data?.user });

    const accessToken = data?.accessToken || data?.token;
    const user = data?.user || data?.profile || data;

    if (!accessToken || !user) {
      console.error('[AUTH] Invalid response structure:', data);
      return { success: false, error: 'Invalid login response from server.' };
    }

    localStorage.setItem('accessToken', accessToken);
    localStorage.setItem('authData', JSON.stringify(user));
    
    // Store profile image if present
    if (user.profileImage || user.profile_image_url) {
      localStorage.setItem('userProfileImage', user.profileImage || user.profile_image_url);
    }
    
    setAuthHeader(accessToken);

    console.log('[AUTH] Login successful for:', user.userRole);
    return { success: true, user };
  } catch (error) {
    console.error('[AUTH] Login error:', {
      message: error?.message,
      status: error?.response?.status,
      code: error?.response?.data?.code,
      data: error?.response?.data
    });
    return {
      success: false,
      error: error?.response?.data?.message || 'Login failed. Please try again.',
      code: error?.response?.data?.code,
      email: error?.response?.data?.email
    };
  }
};

export const verifySession = async () => {
  const token = getAccessToken();
  if (!token || isTokenExpired(token)) {
    logoutUser();
    return null;
  }

  setAuthHeader(token);

  try {
    const { data } = await apiClient.get('/auth/me');
    const user = data?.user || data;
    const savedProfileImage = localStorage.getItem('userProfileImage');
    const normalizedUser = user
      ? { 
          ...user, 
          emailVerifiedAt: user.emailVerifiedAt || user.email_verified_at || null,
          profileImage: savedProfileImage || user.profileImage || user.profile_image_url,
          profile_image_url: savedProfileImage || user.profile_image_url || user.profileImage
        }
      : user;
    localStorage.setItem('authData', JSON.stringify(normalizedUser));
    return normalizedUser;
  } catch {
    logoutUser();
    return null;
  }
};

export const logoutUser = () => {
  localStorage.removeItem('accessToken');
  localStorage.removeItem('qrScannerToken');
  localStorage.removeItem('qrScannerUser');
  localStorage.removeItem('attendanceToken');
  localStorage.removeItem('authData');
  setAuthHeader(null);
};

export const hasRole = (user, requiredRole) => {
  if (!user) return false;
  if (requiredRole === 'admin') {
    return user.userRole === 'admin' || user.userRole === 'super_admin';
  }
  if (requiredRole === 'manager') {
    return ['manager', 'admin', 'super_admin'].includes(user.userRole);
  }
  if (requiredRole === 'employee') {
    return true;
  }
  return false;
};

export const getPermissions = (role) => {
  const permissions = {
    super_admin: {
      viewAttendance: true,
      manageSalary: true,
      releaseSalary: true,
      manageEmployees: true,
      editEmployees: true,
      manageUsers: true,
      viewReports: true,
      editCompanySettings: true
    },
    admin: {
      viewAttendance: true,
      manageSalary: true,
      releaseSalary: true,
      manageEmployees: true,
      editEmployees: true,
      manageUsers: false,
      viewReports: true,
      editCompanySettings: true
    },
    manager: {
      viewAttendance: true,
      manageSalary: false,
      releaseSalary: false,
      manageEmployees: false,
      editEmployees: false,
      manageUsers: false,
      viewReports: false,
      editCompanySettings: false
    },
    employee: {
      viewAttendance: false,
      manageSalary: false,
      releaseSalary: false,
      manageEmployees: false,
      editEmployees: false,
      manageUsers: false,
      viewReports: false,
      editCompanySettings: false
    }
  };

  return permissions[role] || {};
};

// Log audit trail (server-side validation recommended)
export const logAudit = async (action, details) => {
  try {
    const token = resolveAuthToken();
    if (!token) {
      return;
    }
    await apiClient.post('/audit/log', {
      action,
      details,
      timestamp: new Date().toISOString(),
      userId: localStorage.getItem('authData') ? JSON.parse(localStorage.getItem('authData')).employeeId : null
    });
  } catch (error) {
    console.warn('Audit log failed:', error);
  }
};

/**
 * Validation utilities
 */
export const validateEmployeeId = (id) => {
  // Format: 2-6 alphanumeric, pattern like GW001, M001, GW003
  const pattern = /^[A-Za-z]{1,3}\d{1,4}$/;
  return pattern.test(id.trim());
};

export const validateEmail = (email) => {
  const pattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return pattern.test(email.trim());
};

export const validatePassword = (password) => {
  const checks = {
    length: password.length >= 8,
    uppercase: /[A-Z]/.test(password),
    lowercase: /[a-z]/.test(password),
    number: /\d/.test(password)
  };

  const score = Object.values(checks).filter(Boolean).length;
  return {
    valid: score >= 3,
    score,
    checks,
    feedback: score < 3 ? 
      'Password must contain at least 3 of: uppercase, lowercase, numbers' : 
      'Strong password'
  };
};

/**
 * CAPTCHA support (Google reCAPTCHA v3)
 */
let captchaToken = null;

export const loadCaptcha = async () => {
  const siteKey = process.env.REACT_APP_RECAPTCHA_SITE_KEY;
  if (!siteKey) return false;

  return new Promise((resolve) => {
    if (window.grecaptcha) {
      resolve(true);
    } else {
      const script = document.createElement('script');
      script.src = 'https://www.google.com/recaptcha/api.js';
      script.async = true;
      script.defer = true;
      script.onload = () => resolve(true);
      script.onerror = () => resolve(false);
      document.head.appendChild(script);
    }
  });
};

export const getCaptchaToken = async () => {
  const siteKey = process.env.REACT_APP_RECAPTCHA_SITE_KEY;
  if (!siteKey || !window.grecaptcha) return null;

  try {
    return await window.grecaptcha.execute(siteKey, { action: 'login' });
  } catch (error) {
    console.error('CAPTCHA token generation failed:', error);
    return null;
  }
};

export const setCaptchaToken = (token) => {
  captchaToken = token;
};

export const getCachedCaptchaToken = () => {
  return captchaToken;
};

/**
 * Format time remaining (for lockout countdown)
 */
export const formatTimeRemaining = (seconds) => {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  
  if (mins > 0) {
    return `${mins}m ${secs}s`;
  }
  return `${secs}s`;
};
