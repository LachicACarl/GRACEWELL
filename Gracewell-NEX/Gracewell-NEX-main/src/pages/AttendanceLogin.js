import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import './AttendanceLogin.css';
import { apiClient } from '../utils/authService';

const AttendanceLogin = ({ onAttendanceLogin }) => {
  const [employeeId, setEmployeeId] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const { data } = await apiClient.post('/auth/qr-login', {
        employeeId: employeeId.trim()
      });

      if (data?.success) {
        setSuccess(true);
        setError('');
        // Store attendance session
        localStorage.setItem('attendanceToken', data.accessToken);
        localStorage.setItem('attendanceUser', JSON.stringify(data.user));
        
        // Call callback to update parent state
        onAttendanceLogin(data.user, data.accessToken);
        
        // Redirect to QR scanner
        setTimeout(() => {
          navigate('/attendance-scanner', { 
            state: { 
              employeeId: data.user.employeeId,
              employeeName: data.user.employeeName,
              token: data.accessToken
            } 
          });
        }, 500);
      } else {
        setError(data?.message || 'Failed to verify Employee ID');
      }
    } catch (err) {
      setError(err?.response?.data?.message || 'Employee ID not found or inactive');
      console.error('QR Login error:', err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="attendance-login-container">
      <div className="attendance-login-card">
        <div className="attendance-header">
          <h1>📱 Employee Attendance</h1>
          <p>Enter Employee ID to scan QR code</p>
        </div>

        {error && <div className="error-message">{error}</div>}
        {success && <div className="success-message">✅ Employee found! Redirecting...</div>}

        <form onSubmit={handleSubmit} className="attendance-form">
          <div className="form-group">
            <label>Employee ID</label>
            <input
              type="text"
              value={employeeId}
              onChange={(e) => setEmployeeId(e.target.value.toUpperCase())}
              placeholder="e.g., E001"
              required
              autoFocus
              disabled={loading}
              className="employee-id-input"
            />
          </div>

          <button 
            type="submit" 
            disabled={loading || !employeeId.trim()}
            className="submit-btn"
          >
            {loading ? '🔍 Verifying...' : '✓ Continue to QR Scanner'}
          </button>
        </form>

        <div className="attendance-info">
          <p>💡 <strong>No password required</strong></p>
          <p>Just enter your Employee ID and scan the QR code to mark attendance</p>
        </div>

        <button 
          onClick={() => navigate('/login')}
          className="back-to-login-btn"
        >
          ← Back to Regular Login
        </button>
      </div>
    </div>
  );
};

export default AttendanceLogin;
