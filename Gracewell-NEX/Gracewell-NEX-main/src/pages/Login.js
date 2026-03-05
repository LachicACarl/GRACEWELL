import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import './Login.css';
import { 
  loginUser, 
  logAudit,
  validateEmployeeId,
  loadCaptcha,
  getCaptchaToken,
  formatTimeRemaining
} from '../utils/authService';
import { getPostLoginRedirect } from '../utils/roleRedirectMap';
import { apiClient } from '../utils/authService';

const Login = ({ setUser }) => {
  // Step states: 'splash', 'id-input', 'password', 'verify-email'
  const [currentStep, setCurrentStep] = useState('splash');
  const [employeeId, setEmployeeId] = useState('');
  const [password, setPassword] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [requiresPassword, setRequiresPassword] = useState(true);
  const [userRole, setUserRole] = useState(null);
  const [employeeChecked, setEmployeeChecked] = useState(false);
  const [idConfirmed, setIdConfirmed] = useState(false);
  const [employeeIdTouched, setEmployeeIdTouched] = useState(false);
  const [employeeIdError, setEmployeeIdError] = useState('');
  const [passwordTouched, setPasswordTouched] = useState(false);
  const [passwordError, setPasswordError] = useState('');
  const [employeeLookupMessage, setEmployeeLookupMessage] = useState('');
  const [failedAttempts, setFailedAttempts] = useState(0);
  const [lockoutUntil, setLockoutUntil] = useState(null);
  const [lockoutRemaining, setLockoutRemaining] = useState(0);
  const [fadingOut, setFadingOut] = useState(false);
  const [unverifiedEmail, setUnverifiedEmail] = useState(null);
  const [resendLoading, setResendLoading] = useState(false);
  const [resendMessage, setResendMessage] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const checkRequestIdRef = useRef(0);
  const navigate = useNavigate();

  const maxAttempts = 7;
  const lockoutMs = 5 * 60 * 1000;

  useEffect(() => {
    loadCaptcha();
  }, []);

  useEffect(() => {
    if (!lockoutUntil) {
      setLockoutRemaining(0);
      return;
    }

    const updateRemaining = () => {
      const remainingMs = lockoutUntil - Date.now();
      if (remainingMs <= 0) {
        setLockoutUntil(null);
        setFailedAttempts(0);
        setLockoutRemaining(0);
        return;
      }
      setLockoutRemaining(Math.ceil(remainingMs / 1000));
    };

    updateRemaining();
    const timer = setInterval(updateRemaining, 1000);
    return () => clearInterval(timer);
  }, [lockoutUntil]);

  const normalizeEmployeeCode = (id) => String(id || '').trim().toUpperCase();

  // Persist user-specific failed attempts to localStorage
  useEffect(() => {
    if (idConfirmed && employeeId) {
      const normalizedId = normalizeEmployeeCode(employeeId);
      if (failedAttempts > 0) {
        localStorage.setItem(`nexus_attempts_${normalizedId}`, failedAttempts.toString());
      } else {
        localStorage.removeItem(`nexus_attempts_${normalizedId}`);
      }
    }
  }, [failedAttempts, idConfirmed, employeeId]);

  // Persist user-specific lockout timer to localStorage
  useEffect(() => {
    if (idConfirmed && employeeId) {
      const normalizedId = normalizeEmployeeCode(employeeId);
      if (lockoutUntil) {
        localStorage.setItem(`nexus_lockout_${normalizedId}`, lockoutUntil.toString());
      } else {
        localStorage.removeItem(`nexus_lockout_${normalizedId}`);
      }
    }
  }, [lockoutUntil, idConfirmed, employeeId]);

  const transitionToStep = (step) => {
    setFadingOut(true);
    setTimeout(() => {
      setCurrentStep(step);
      // Reset all form data and state when going back to splash
      if (step === 'splash') {
        setErrorMessage('');
        setIdConfirmed(false);
        setUserRole(null);
        setEmployeeId('');
        setPassword('');
        setEmployeeChecked(false);
        setEmployeeIdTouched(false);
        setEmployeeIdError('');
        setPasswordTouched(false);
        setPasswordError('');
        setEmployeeLookupMessage('');
        setFailedAttempts(0);
        setLockoutUntil(null);
        setLockoutRemaining(0);
      } else {
        setErrorMessage('');
        setIdConfirmed(false);
        setUserRole(null);
        setFailedAttempts(0);
        setLockoutUntil(null);
        setLockoutRemaining(0);
      }
      setFadingOut(false);
    }, 200);
  };

  const handleStartClick = () => {
    // Reset all state before moving to ID input
    setPassword('');
    setEmployeeId('');
    setErrorMessage('');
    setEmployeeChecked(false);
    setIdConfirmed(false);
    setUserRole(null);
    setEmployeeIdTouched(false);
    setEmployeeIdError('');
    setPasswordTouched(false);
    setPasswordError('');
    setEmployeeLookupMessage('');
    transitionToStep('id-input');
  };

  const checkEmployeeId = async (id) => {
    const normalizedId = normalizeEmployeeCode(id);

    if (!normalizedId) {
      setEmployeeChecked(false);
      setRequiresPassword(true);
      setEmployeeLookupMessage('');
      return { found: false, role: null };
    }

    if (!validateEmployeeIdFormat(normalizedId)) {
      setEmployeeChecked(false);
      setRequiresPassword(true);
      setEmployeeLookupMessage('');
      return { found: false, role: null };
    }

    const requestId = ++checkRequestIdRef.current;

    try {
      const { data } = await apiClient.post('/auth/check-employee', {
        employeeId: normalizedId
      });

      if (requestId !== checkRequestIdRef.current) {
        return { found: false, role: null };
      }

      if (data?.found) {
        setUserRole(data.role);
        setRequiresPassword(data.requiresPassword);
        setEmployeeChecked(true);
        setErrorMessage('');
        setEmployeeLookupMessage('');
        return { found: true, role: data.role };
      } else {
        setEmployeeChecked(false);
        setRequiresPassword(true);
        setEmployeeLookupMessage('Employee ID not found or inactive');
        return { found: false, role: null };
      }
    } catch (err) {
      if (requestId !== checkRequestIdRef.current) {
        return { found: false, role: null };
      }
      setEmployeeChecked(false);
      setRequiresPassword(true);
      setEmployeeLookupMessage('Employee ID not found or inactive');
      return { found: false, role: null };
    }
  };

  const handleConfirmId = async () => {
    setErrorMessage('');
    
    const id = employeeId.trim();
    
    if (!id) {
      setErrorMessage('Please enter Employee ID');
      return;
    }

    if (!validateEmployeeIdFormat(id)) {
      setErrorMessage('ID not recognized');
      return;
    }

    setIsLoading(true);
    const checkResult = await checkEmployeeId(id);
    setIsLoading(false);

    if (checkResult.found) {
      // If it's an employee, auto-login and direct to QR attendance
      if (checkResult.role === 'employee') {
        setIsLoading(true);
        const loginResult = await loginUser(normalizeEmployeeCode(id), '', null);
        setIsLoading(false);
        
        if (loginResult.success) {
          setUser(loginResult.user);
          
          // Log successful login
          await logAudit('LOGIN', { 
            employeeId: loginResult.user.employeeId, 
            role: loginResult.user.userRole,
            timestamp: new Date().toISOString()
          });
          
          // Redirect to QR attendance
          setTimeout(() => {
            navigate('/qr-scanner');
          }, 300);
        } else {
          setErrorMessage(loginResult.error || 'Login failed. Please try again.');
        }
      } else {
        // For admin/super_admin, show password field
        setIdConfirmed(true);

        // Load user-specific lockout data
        const normalizedId = normalizeEmployeeCode(id);
        const savedAttempts = localStorage.getItem(`nexus_attempts_${normalizedId}`);
        const savedLockout = localStorage.getItem(`nexus_lockout_${normalizedId}`);
        
        setFailedAttempts(savedAttempts ? parseInt(savedAttempts, 10) : 0);
        setLockoutUntil(savedLockout ? parseInt(savedLockout, 10) : null);
      }
    }
  };

  const handleEmployeeIdChange = (e) => {
    const id = e.target.value.toUpperCase();
    setEmployeeId(id);
    if (employeeIdTouched) {
      setEmployeeIdError(id.trim() ? '' : 'You need to fill this up');
    }
    // Clear the helper message when input is cleared
    if (!id.trim()) {
      setEmployeeLookupMessage('');
    }
  };

  const handleEmployeeIdBlur = () => {
    setEmployeeIdTouched(true);
    const id = employeeId.trim();
    
    if (!id) {
      setEmployeeIdError('You need to fill this up');
    } else if (!validateEmployeeIdFormat(id)) {
      setEmployeeIdError('ID not recognized');
    } else {
      setEmployeeIdError('');
    }
  };

  const validateEmployeeIdFormat = (id) => {
    return /^[A-Za-z]{1,3}\d{1,4}$/.test(id);
  };

  const handlePasswordChange = (e) => {
    const value = e.target.value;
    setPassword(value);
    if (passwordTouched) {
      setPasswordError(value.trim() ? '' : 'You need to fill this up');
    }
  };

  const handlePasswordBlur = () => {
    setPasswordTouched(true);
    setPasswordError(password.trim() ? '' : 'You need to fill this up');
  };

  const handleResendVerification = async () => {
    if (!unverifiedEmail) return;
    
    setResendLoading(true);
    setResendMessage('');
    
    try {
      const { data } = await apiClient.post('/auth/resend-email-verification', {
        email: unverifiedEmail
      });
      
      if (data?.success) {
        setResendMessage('✅ ' + data.message);
        if (data.verified) {
          // Email verified successfully - redirect to login
          setTimeout(() => {
            setUnverifiedEmail(null);
            setErrorMessage('');
            setEmployeeId('');
            setPassword('');
            setIdConfirmed(false);
            transitionToStep('id-input');
          }, 2000);
        }
      } else {
        setResendMessage('❌ Failed to send verification email');
      }
    } catch (error) {
      console.error('Resend verification error:', error);
      setResendMessage('❌ ' + (error?.response?.data?.message || 'Failed to send verification email'));
    } finally {
      setResendLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErrorMessage('');
    setIsLoading(true);

    if (lockoutUntil && lockoutUntil > Date.now()) {
      const remaining = Math.ceil((lockoutUntil - Date.now()) / 1000);
      setErrorMessage(`Too many failed attempts. Try again in ${formatTimeRemaining(remaining)}`);
      setIsLoading(false);
      return;
    }

    const normalizedEmployeeId = normalizeEmployeeCode(employeeId);

    if (!normalizedEmployeeId) {
      setErrorMessage('Please enter Employee ID');
      setIsLoading(false);
      return;
    }

    if (!validateEmployeeId(normalizedEmployeeId)) {
      setErrorMessage('ID not recognized');
      setIsLoading(false);
      return;
    }

    if (requiresPassword && !password) {
      setErrorMessage('Please enter Password');
      setIsLoading(false);
      return;
    }

    // Get CAPTCHA token if enabled
    let captchaToken = null;
    if (failedAttempts >= 3) {
      try {
        captchaToken = await getCaptchaToken();
        if (!captchaToken) {
          console.warn('CAPTCHA token generation failed, but continuing without it');
        }
      } catch (error) {
        console.warn('CAPTCHA error:', error);
      }
    }

    // For employees, send without password. For admin/manager, send with password
    const result = await loginUser(normalizedEmployeeId, requiresPassword ? password : '', captchaToken);

    if (result.success) {
      setFailedAttempts(0);
      setLockoutUntil(null);
      setUser(result.user);
      
      // Log successful login
      await logAudit('LOGIN', { 
        employeeId: result.user.employeeId, 
        role: result.user.userRole,
        timestamp: new Date().toISOString()
      });
      
      // Redirect based on role using centralized role redirect utility
      // Ensures consistent redirect across all login methods
      setTimeout(() => {
        const redirectPath = getPostLoginRedirect(result.user);
        navigate(redirectPath);
      }, 300);
    } else if (result.code === 'EMAIL_NOT_VERIFIED') {
      // Handle email verification required
      setUnverifiedEmail(result.email);
      setErrorMessage('');
      setResendMessage('');
      setCurrentStep('verify-email');
    } else {
      // Log failed login attempt
      await logAudit('LOGIN_FAILED', {
        employeeId: normalizedEmployeeId,
        reason: result.error || 'Invalid credentials',
        timestamp: new Date().toISOString()
      });

      if (requiresPassword) {
        const nextAttempts = failedAttempts + 1;
        const attemptsLeft = Math.max(maxAttempts - nextAttempts, 0);
        setFailedAttempts(nextAttempts);

        if (nextAttempts >= maxAttempts) {
          setLockoutUntil(Date.now() + lockoutMs);
          setErrorMessage('🔒 Too many failed attempts. Account temporarily locked (5 min). Please try again later.');
        } else {
          setErrorMessage(result.error || `❌ Login failed. Attempts left: ${attemptsLeft}`);
        }
      } else {
        setErrorMessage(result.error || 'Login failed. Please try again.');
      }
    }
    
    setIsLoading(false);
  };


  return (
    <div className="login-container">
      <div className={`login-box ${fadingOut ? 'fade-out' : 'fade-in'}`}>
        <div 
          className="login-logo-circle"
          onClick={() => (currentStep !== 'splash') && transitionToStep('splash')}
          style={{ cursor: currentStep !== 'splash' ? 'pointer' : 'default' }}
        >
          <div className="logo-content">
            <img src={require('../assets/nexus-logo.png')} alt="Nexus Logo" />
          </div>
        </div>

        {/* STATE 1: SPLASH/LANDING */}
        {currentStep === 'splash' && (
          <div className="step-content splash-content">
            <h2>Welcome to Gracewell Nexus</h2>
            <p>Your modern HRIS solution</p>
            <button
              className="login-btn start-btn"
              onClick={handleStartClick}
            >
              Start
            </button>
          </div>
        )}

        {/* STATE 2: ID IDENTIFICATION */}
        {currentStep === 'id-input' && (
          <div className="step-content id-input-content">
            <h2 className={idConfirmed ? 'heading-confirmed' : ''}>
              {idConfirmed ? 'Welcome Back' : 'Log-in'}
            </h2>
            <p>{idConfirmed ? 'Complete your sign-in' : 'Enter your Employee ID to continue'}</p>
            
            <form onSubmit={(e) => {
              e.preventDefault();
              if (!idConfirmed) {
                handleConfirmId();
              }
            }}>
              <div className={`form-group ${idConfirmed ? 'form-group-confirmed' : ''}`}>
                <label htmlFor="employeeId">Employee ID</label>
                <input
                  id="employeeId"
                  type="text"
                  placeholder="Enter Employee ID"
                  value={employeeId}
                  onChange={handleEmployeeIdChange}
                  onBlur={handleEmployeeIdBlur}
                  disabled={isLoading || idConfirmed}
                  className={`login-input ${employeeIdError ? 'input-error' : ''}`}
                  maxLength={7}
                  autoFocus={!idConfirmed}
                />
                {employeeIdError && (
                  <p className="input-error-text">{employeeIdError}</p>
                )}
                {employeeLookupMessage && (
                  <p className="helper-text">{employeeLookupMessage}</p>
                )}
              </div>

              {!idConfirmed && (
                <button
                  type="button"
                  onClick={handleConfirmId}
                  disabled={isLoading || !employeeId.trim()}
                  className="confirm-btn"
                >
                  {isLoading ? 'Confirming...' : 'Confirm'}
                </button>
              )}

              {idConfirmed && (
                <div className="password-reveal">
                  <div className="form-group">
                    <label htmlFor="password">Password</label>
                    <div className="password-input-wrapper">
                      <input
                        id="password"
                        type={showPassword ? 'text' : 'password'}
                        placeholder="Enter Password"
                        value={password}
                        onChange={handlePasswordChange}
                        onBlur={handlePasswordBlur}
                        disabled={isLoading}
                        className={`login-input ${passwordError ? 'input-error' : ''}`}
                        autoFocus
                      />
                      <button
                        type="button"
                        className="toggle-password-btn"
                        onClick={() => setShowPassword(!showPassword)}
                        disabled={isLoading || !password}
                        title={showPassword ? 'Hide password' : 'Show password'}
                      >
                        {showPassword ? '👁️' : '👁️‍🗨️'}
                      </button>
                    </div>
                    {passwordError && (
                      <p className="input-error-text">{passwordError}</p>
                    )}
                  </div>

                  <button 
                    type="submit" 
                    disabled={isLoading || !password || (lockoutUntil && lockoutUntil > Date.now())}
                    className="login-btn"
                    onClick={handleSubmit}
                  >
                    {isLoading ? 'Signing In...' : 'Sign In'}
                  </button>

                  {failedAttempts > 0 && !lockoutUntil && (
                    <div className="attempts-message">
                      Attempts left: {Math.max(maxAttempts - failedAttempts, 0)}
                    </div>
                  )}

                  {lockoutUntil && lockoutRemaining > 0 && (
                    <div className="lockout-message">
                      Too many failed attempts. Try again in {lockoutRemaining}s.
                    </div>
                  )}

                  <div className="login-divider">
                    <span>OR</span>
                  </div>

                  <div className="login-footer">
                    <button
                      type="button"
                      className="forgot-password-btn"
                      onClick={() => navigate('/forgot-password')}
                    >
                      Forgot Password?
                    </button>
                  </div>
                </div>
              )}

              {errorMessage && (
                <div className="error-message">
                  {errorMessage}
                </div>
              )}
            </form>
          </div>
        )}

        {/* STATE 3: EMAIL VERIFICATION REQUIRED */}
        {currentStep === 'verify-email' && (
          <div className="step-content verify-email-content">
            <h2>📧 Verify Your Email</h2>
            <p>Your email needs to be verified before you can access your account.</p>
            
            <div className="verification-info">
              <p>Email: <strong>{unverifiedEmail}</strong></p>
              <p>Check your inbox for a verification link or request a new one below.</p>
            </div>

            {resendMessage && (
              <div className={`verification-message ${resendMessage.includes('✅') ? 'success' : 'error'}`}>
                {resendMessage}
              </div>
            )}

            <button
              type="button"
              onClick={handleResendVerification}
              disabled={resendLoading}
              className="resend-btn"
            >
              {resendLoading ? '⏳ Sending...' : '📨 Resend Verification Email'}
            </button>

            <div className="verification-link">
              <p>Already verified? 
                <button
                  type="button"
                  onClick={() => {
                    setUnverifiedEmail(null);
                    setResendMessage('');
                    setErrorMessage('');
                    setEmployeeId('');
                    setPassword('');
                    setIdConfirmed(false);
                    transitionToStep('id-input');
                  }}
                  className="link-btn"
                >
                  Try logging in again
                </button>
              </p>
            </div>

            <button
              type="button"
              onClick={() => transitionToStep('splash')}
              className="back-btn"
            >
              Back to Login
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default Login;