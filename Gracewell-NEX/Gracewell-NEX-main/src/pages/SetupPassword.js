import React, { useState, useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import './SetupPassword.css';
import { apiClient } from '../utils/authService';

const SetupPassword = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const token = searchParams.get('token');

  const [loading, setLoading] = useState(true);
  const [verifying, setVerifying] = useState(false);
  const [user, setUser] = useState(null);
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [errors, setErrors] = useState({});
  const [message, setMessage] = useState('');
  const [status, setStatus] = useState('idle'); // idle, success, error

  // Verify token on mount
  useEffect(() => {
    const verifyToken = async () => {
      if (!token) {
        setStatus('error');
        setMessage('Invalid activation link - token missing');
        setLoading(false);
        return;
      }

      try {
        setVerifying(true);
        const { data } = await apiClient.get(`/auth/verify-token/${token}`);
        
        if (data.valid && data.user) {
          setUser(data.user);
          setStatus('idle');
          setMessage('');
        }
      } catch (error) {
        setStatus('error');
        setMessage(error?.response?.data?.message || 'Invalid or expired activation link');
      } finally {
        setVerifying(false);
        setLoading(false);
      }
    };

    verifyToken();
  }, [token]);

  const validateForm = () => {
    const newErrors = {};

    if (!password) {
      newErrors.password = 'Password is required';
    } else if (password.length < 6) {
      newErrors.password = 'Password must be at least 6 characters';
    }

    if (!confirmPassword) {
      newErrors.confirmPassword = 'Please confirm your password';
    } else if (password !== confirmPassword) {
      newErrors.confirmPassword = 'Passwords do not match';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!validateForm()) {
      return;
    }

    try {
      setVerifying(true);
      const { data } = await apiClient.post('/auth/setup-password', {
        token,
        password,
        confirmPassword
      });

      if (data.success) {
        setStatus('success');
        setMessage('✅ Password set successfully! Redirecting to login...');
        
        setTimeout(() => {
          navigate('/login');
        }, 2000);
      }
    } catch (error) {
      setStatus('error');
      setMessage(error?.response?.data?.message || 'Failed to set password');
      setPassword('');
      setConfirmPassword('');
    } finally {
      setVerifying(false);
    }
  };

  if (loading) {
    return (
      <div className="setup-password-container">
        <div className="setup-card">
          <div className="card-header">
            <h1>Setting up your account...</h1>
          </div>
          <div className="card-body">
            <p>Verifying your activation link...</p>
          </div>
        </div>
      </div>
    );
  }

  if (status === 'error') {
    return (
      <div className="setup-password-container">
        <div className="setup-card error">
          <div className="card-header error-header">
            <h1>❌ Invalid Link</h1>
          </div>
          <div className="card-body">
            <p className="error-message">{message}</p>
            <button className="btn-primary" onClick={() => navigate('/login')}>
              Back to Login
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="setup-password-container">
      <div className="setup-card">
        <div className="card-header">
          <h1>🔐 Set Your Password</h1>
          <p className="subtitle">Create a secure password for your account</p>
        </div>

        {user && (
          <div className="user-info">
            <div className="info-row">
              <span className="info-label">Name:</span>
              <span className="info-value">{user.name}</span>
            </div>
            <div className="info-row">
              <span className="info-label">Email:</span>
              <span className="info-value">{user.email}</span>
            </div>
            <div className="info-row">
              <span className="info-label">Employee ID:</span>
              <span className="info-value">{user.employeeId}</span>
            </div>
          </div>
        )}

        <form onSubmit={handleSubmit} className="setup-form">
          <div className="form-group">
            <label htmlFor="password">Password</label>
            <input
              id="password"
              type="password"
              placeholder="Enter a strong password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className={errors.password ? 'input-error' : ''}
              disabled={verifying || status === 'success'}
            />
            {errors.password && <span className="error-text">{errors.password}</span>}
          </div>

          <div className="form-group">
            <label htmlFor="confirmPassword">Confirm Password</label>
            <input
              id="confirmPassword"
              type="password"
              placeholder="Re-enter your password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className={errors.confirmPassword ? 'input-error' : ''}
              disabled={verifying || status === 'success'}
            />
            {errors.confirmPassword && <span className="error-text">{errors.confirmPassword}</span>}
          </div>

          {message && (
            <div className={`message ${status}`}>
              {message}
            </div>
          )}

          <button
            type="submit"
            className="btn-primary"
            disabled={verifying || status === 'success'}
          >
            {verifying ? '⏳ Setting Password...' : status === 'success' ? '✅ Success!' : 'Set Password'}
          </button>
        </form>

        <div className="password-hint">
          <p>💡 <strong>Password Tips:</strong></p>
          <ul>
            <li>At least 6 characters</li>
            <li>Mix uppercase and lowercase letters</li>
            <li>Include numbers and symbols for extra security</li>
          </ul>
        </div>
      </div>
    </div>
  );
};

export default SetupPassword;
