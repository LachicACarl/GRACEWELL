import React from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import './QRScanner.css';
import NexusLogo from '../assets/nexus-logo.png';

const QRAttendanceResult = ({ user, onLogout }) => {
  const { employeeId, action } = useParams();
  const navigate = useNavigate();

  console.log('[QRAttendanceResult] Mounted with:', { employeeId, action });

  const handleBackToScanner = () => {
    navigate('/qr-scanner', { replace: true });
  };

  const actionText = action === 'check-in' ? 'Check-In' : 'Check-Out';
  const timestamp = new Date().toLocaleTimeString();

  return (
    <div className="scanner-page">
      <div className="scanner-navbar">
        <div className="scanner-logo">
          <img src={NexusLogo} alt="Nexus Logo" className="scanner-logo-image" />
          <span className="scanner-logo-text">Gracewell NEXUS</span>
        </div>
        <div className="scanner-user">
          <span className="scanner-user-name">{user?.employeeName || user?.employeeCode || 'User'}</span>
          <div className="user-avatar">
            {(user?.employeeName || user?.employeeCode || 'U').charAt(0)}
          </div>
          <button className="scanner-logout-btn" onClick={() => { onLogout(); navigate('/login', { replace: true }); }}>Logout</button>
        </div>
      </div>

      <div className="scanner-left-panel">
        <h1>Gracewell NEXUS</h1>
        <h2>QR Scanner</h2>
      </div>

      <div className="scanner-right-panel">
        <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', height: '100%', gap: '30px', padding: '40px' }}>
          {/* Success Icon */}
          <div style={{ fontSize: '80px', animation: 'bounce 0.6s ease-in-out' }}>
            ✅
          </div>

          {/* Success Message */}
          <h2 style={{ color: '#4CAF50', fontSize: '28px', margin: '0' }}>
            ✓ {actionText} Successful
          </h2>

          {/* Employee Details */}
          <div style={{
            backgroundColor: '#f5f5f5',
            padding: '20px',
            borderRadius: '10px',
            textAlign: 'center',
            minWidth: '300px'
          }}>
            <p style={{ margin: '10px 0', fontSize: '18px', fontWeight: 'bold' }}>
              Employee ID: {employeeId}
            </p>
            <p style={{ margin: '10px 0', fontSize: '14px', color: '#666' }}>
              {actionText} Time: {timestamp}
            </p>
          </div>

          {/* Auto-redirect message */}
          <p style={{ fontSize: '14px', color: '#999' }}>
            Attendance recorded successfully
          </p>

          {/* Manual redirect button */}
          <button 
            onClick={handleBackToScanner}
            style={{
              padding: '10px 20px',
              fontSize: '16px',
              backgroundColor: '#0047AB',
              color: 'white',
              border: 'none',
              borderRadius: '5px',
              cursor: 'pointer'
            }}
          >
            Back to Scanner
          </button>
        </div>
      </div>

      <style>{`
        @keyframes bounce {
          0%, 100% { transform: scale(1); }
          50% { transform: scale(1.1); }
        }
      `}</style>
    </div>
  );
};

export default QRAttendanceResult;
