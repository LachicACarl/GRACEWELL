import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import './ForgotPassword.css';
import { apiClient, getCaptchaToken, loadCaptcha, validateEmail } from '../utils/authService';

const ForgotPassword = () => {
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  
  useEffect(() => {
    loadCaptcha();
  }, []);

  const handleEmailSubmit = async (e) => {
    e.preventDefault();
    setMessage('');
    setError('');

    if (!email) {
      setError('Please enter your email address');
      return;
    }

    if (!validateEmail(email)) {
      setError('Please enter a valid email address');
      return;
    }

    setLoading(true);
    try {
      const captchaToken = await getCaptchaToken();
      console.log('CAPTCHA Token:', captchaToken ? 'Generated' : 'Not available');
      console.log('Sending reset link request for:', email);
      
      const { data } = await apiClient.post('/auth/request-password-reset-link', {
        email: email.trim(),
        captchaToken
      });

      console.log('Response received:', data);
      setMessage(data?.message || 'If the email exists, a reset link has been sent.');
      setError('');
      setEmail('');
    } catch (err) {
      console.error('Error details:', err);
      const errorMsg = err?.response?.data?.message || err?.message || 'Failed to send reset link';
      setError(errorMsg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="forgot-password-container">
      <div className="forgot-password-box">
        <div className="forgot-password-header">
          <h1>🔐 Password Recovery</h1>
          <p>Regain access to your Gracewell NEXUS account</p>
        </div>

        <form className="forgot-password-form" onSubmit={handleEmailSubmit}>
          <h2>Request a Reset Link</h2>
          <p className="step-info">
            Enter your registered email and we will send a one-time secure reset link.
          </p>
          <div className="form-group">
            <label htmlFor="email">Email Address</label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Enter your registered email"
              className="form-input"
            />
          </div>
          {error && <div className="error-message">{error}</div>}
          {message && <div className="success-message">{message}</div>}
          <button type="submit" className="btn-submit" disabled={loading}>
            {loading ? 'Sending...' : 'Send Reset Link'}
          </button>
        </form>

        <div className="forgot-password-footer">
          <p>
            Remember your password?{' '}
            <Link to="/login" className="login-link">
              Back to Login
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
};

export default ForgotPassword;
