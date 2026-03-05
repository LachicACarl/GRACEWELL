import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import './QRScannerLogin.css';
import { apiClient } from '../utils/authService';

const QRScannerLogin = ({ setUser }) => {
  const navigate = useNavigate();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  useEffect(() => {
    // If already logged in as QR Scanner, redirect to scanner
    const token = localStorage.getItem('qrScannerToken');
    if (token) {
      navigate('/qr-scanner', { replace: true });
    }
  }, [navigate]);

  const handleLogin = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    if (!username.trim() || !password.trim()) {
      setError('Please enter both username and password');
      setLoading(false);
      return;
    }

    try {
      const response = await apiClient.post('/auth/qr-scanner-login', {
        username: username.trim().toUpperCase(),
        password: password
      });

      if (response.data?.accessToken) {
        const { accessToken, user } = response.data;
        const sessionUser = {
          ...user,
          isQRScanner: true,
          userRole: 'qr_scanner'
        };

        // Store QR Scanner session
        localStorage.setItem('accessToken', accessToken);
        localStorage.setItem('qrScannerToken', accessToken);
        localStorage.setItem('authData', JSON.stringify(sessionUser));
        localStorage.setItem('qrScannerUser', JSON.stringify(sessionUser));

        // Set user state for authenticated session
        setUser(sessionUser);

        // Redirect to QR Scanner dashboard
        navigate('/qr-scanner', { replace: true });
      } else {
        setError('Login failed: No token received');
      }
    } catch (err) {
      const message = err.response?.data?.message || 'Login failed. Please try again.';
      setError(message);
      console.error('QR Scanner Login Error:', err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="qr-scanner-login-container">
      <div className="login-background"></div>
      
      <div className="login-wrapper">
        <div className="login-card">
          {/* Header */}
          <div className="login-header">
            <div className="qr-logo-icon">
              <svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
                <rect x="10" y="10" width="35" height="35" fill="none" stroke="currentColor" strokeWidth="2"/>
                <rect x="55" y="10" width="35" height="35" fill="none" stroke="currentColor" strokeWidth="2"/>
                <rect x="10" y="55" width="35" height="35" fill="none" stroke="currentColor" strokeWidth="2"/>
                <g opacity="0.5">
                  <rect x="62" y="62" width="5" height="5" fill="currentColor"/>
                  <rect x="71" y="62" width="5" height="5" fill="currentColor"/>
                  <rect x="62" y="71" width="5" height="5" fill="currentColor"/>
                  <rect x="71" y="71" width="5" height="5" fill="currentColor"/>
                </g>
              </svg>
            </div>
            <h1>QR Scanner</h1>
            <p className="subtitle">Attendance System</p>
          </div>

          {/* Form */}
          <form onSubmit={handleLogin} className="login-form">
            {/* Error Message */}
            {error && (
              <div className="error-alert">
                <span className="error-icon">⚠</span>
                <span>{error}</span>
              </div>
            )}

            {/* Username Field */}
            <div className="form-group">
              <label htmlFor="username">Username</label>
              <input
                id="username"
                type="text"
                placeholder="Enter username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                disabled={loading}
                className="form-input"
                autoComplete="off"
              />
            </div>

            {/* Password Field */}
            <div className="form-group">
              <label htmlFor="password">Password</label>
              <div className="password-wrapper">
                <input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  placeholder="Enter password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  disabled={loading}
                  className="form-input"
                  autoComplete="off"
                />
                <button
                  type="button"
                  className="show-password-btn"
                  onClick={() => setShowPassword(!showPassword)}
                  disabled={loading}
                  title={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? '👁️‍🗨️' : '👁️'}
                </button>
              </div>
            </div>

            {/* Login Button */}
            <button 
              type="submit" 
              disabled={loading}
              className="login-button"
            >
              {loading ? (
                <>
                  <span className="spinner"></span>
                  Logging in...
                </>
              ) : (
                '🔐 Login'
              )}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};

export default QRScannerLogin;
