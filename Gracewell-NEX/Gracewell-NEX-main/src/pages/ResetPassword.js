import React, { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import './ResetPassword.css';
import { apiClient, validatePassword } from '../utils/authService';

const ResetPassword = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const token = searchParams.get('token');

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [status, setStatus] = useState('idle');
  const [message, setMessage] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [errors, setErrors] = useState({});

  useEffect(() => {
    const verifyToken = async () => {
      if (!token) {
        setStatus('error');
        setMessage('Reset link is missing or invalid.');
        setLoading(false);
        return;
      }

      try {
        const { data } = await apiClient.get(`/auth/verify-reset-token/${token}`);
        if (data?.valid) {
          setEmail(data?.email || '');
          setStatus('idle');
          setMessage('');
        } else {
          setStatus('error');
          setMessage('Reset link is invalid or expired.');
        }
      } catch (error) {
        setStatus('error');
        setMessage(error?.response?.data?.message || 'Reset link is invalid or expired.');
      } finally {
        setLoading(false);
      }
    };

    verifyToken();
  }, [token]);

  const validateForm = () => {
    const nextErrors = {};

    if (!password) {
      nextErrors.password = 'New password is required';
    } else {
      const check = validatePassword(password);
      if (!check.valid) {
        nextErrors.password = check.feedback;
      }
    }

    if (!confirmPassword) {
      nextErrors.confirmPassword = 'Please confirm your password';
    } else if (password !== confirmPassword) {
      nextErrors.confirmPassword = 'Passwords do not match';
    }

    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setMessage('');

    if (!validateForm()) {
      return;
    }

    setSubmitting(true);
    try {
      const { data } = await apiClient.post('/auth/reset-password-link', {
        token,
        newPassword: password,
        confirmPassword
      });

      if (data?.success) {
        setStatus('success');
        setMessage('Password reset successfully. Redirecting to login...');
        setTimeout(() => navigate('/login'), 2000);
      } else {
        setStatus('error');
        setMessage(data?.message || 'Failed to reset password');
      }
    } catch (error) {
      setStatus('error');
      setMessage(error?.response?.data?.message || 'Failed to reset password');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="reset-password-container">
        <div className="reset-card">
          <div className="reset-card-header">
            <h1>Reset Password</h1>
          </div>
          <div className="reset-card-body">
            <p>Verifying your reset link...</p>
          </div>
        </div>
      </div>
    );
  }

  if (status === 'error' && !token) {
    return (
      <div className="reset-password-container">
        <div className="reset-card error">
          <div className="reset-card-header">
            <h1>Reset Link Error</h1>
          </div>
          <div className="reset-card-body">
            <p className="status-message error">{message}</p>
            <button className="btn-primary" onClick={() => navigate('/login')}>
              Back to Login
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="reset-password-container">
      <div className={`reset-card ${status === 'error' ? 'error' : ''}`}>
        <div className="reset-card-header">
          <h1>Reset Your Password</h1>
          <p>Create a new password for your account.</p>
        </div>
        <div className="reset-card-body">
          {email && (
            <div className="reset-email">
              Resetting password for <strong>{email}</strong>
            </div>
          )}

          <form className="reset-form" onSubmit={handleSubmit}>
            <div className="form-group">
              <label htmlFor="password">New Password</label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className={errors.password ? 'input-error' : ''}
                placeholder="Enter new password"
              />
              {errors.password && <span className="error-text">{errors.password}</span>}
            </div>

            <div className="form-group">
              <label htmlFor="confirmPassword">Confirm Password</label>
              <input
                id="confirmPassword"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className={errors.confirmPassword ? 'input-error' : ''}
                placeholder="Re-enter new password"
              />
              {errors.confirmPassword && <span className="error-text">{errors.confirmPassword}</span>}
            </div>

            {message && (
              <div className={`status-message ${status === 'success' ? 'success' : 'error'}`}>
                {message}
              </div>
            )}

            <button type="submit" className="btn-primary" disabled={submitting}>
              {submitting ? 'Updating...' : 'Update Password'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};

export default ResetPassword;
