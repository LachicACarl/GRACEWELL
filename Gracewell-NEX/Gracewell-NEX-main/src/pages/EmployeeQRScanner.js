import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import StableQrReader from '../components/StableQrReader';
import './EmployeeQRScanner.css';
import { apiClient, logAudit } from '../utils/authService';

const EmployeeQRScanner = ({ user, onLogout }) => {
  const navigate = useNavigate();
  const [scanStatus, setScanStatus] = useState('idle'); // idle, success, error
  const [statusMessage, setStatusMessage] = useState('');
  const [qrReaderKey, setQrReaderKey] = useState(0);
  const [attendanceStatus, setAttendanceStatus] = useState(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [cameraError, setCameraError] = useState('');
  const isMountedRef = useRef(true);
  const scanLockRef = useRef(false);
  const lastScanRef = useRef({ value: '', at: 0 });
  const scanCooldownMs = 3000;

  // Check authentication - only employees can access
  useEffect(() => {
    if (!user || user.userRole !== 'employee') {
      navigate('/login', { replace: true });
    }
    isMountedRef.current = true;

    return () => {
      isMountedRef.current = false;
    };
  }, [user, navigate]);

  const handleScan = async (result) => {
    if (!result?.text || !isMountedRef.current) return;

    const scannedValue = result.text.trim();
    const now = Date.now();
    const timeSinceLastScan = now - lastScanRef.current.at;

    // Debounce identical scans
    if (scannedValue === lastScanRef.current.value && timeSinceLastScan < scanCooldownMs) {
      return;
    }

    // Debounce if already processing
    if (isProcessing || scanLockRef.current) {
      return;
    }

    lastScanRef.current = { value: scannedValue, at: now };
    scanLockRef.current = true;
    setIsProcessing(true);

    try {
      // For employees, they scan their own location/terminal code
      setScanStatus('success');
      setStatusMessage('Scan successful! Ready to check in.');
      
      // Automatically attempt check-in after successful scan
      await handleCheckIn();
    } catch (error) {
      console.error('Scan error:', error);
      setScanStatus('error');
      setStatusMessage(error?.response?.data?.message || 'Error scanning');
      setTimeout(() => {
        setScanStatus('idle');
        setStatusMessage('');
        scanLockRef.current = false;
        setIsProcessing(false);
      }, 2000);
    }
  };

  const handleCheckIn = async () => {
    try {
      const { data } = await apiClient.post('/qr-attendance/check-in', {
        employeeId: user.employeeId
      });

      if (data.success) {
        setScanStatus('success');
        setStatusMessage('✅ Checked In Successfully!');
        setAttendanceStatus('checked-in');
        
        await logAudit('EMPLOYEE_CHECK_IN', {
          employeeId: user.employeeId,
          method: 'qr_scan',
          timestamp: new Date().toISOString()
        });

        setTimeout(() => {
          navigate('/employee', { replace: true });
        }, 1500);
      }
    } catch (error) {
      console.error('Check-in error:', error);
      setScanStatus('error');
      setStatusMessage(error?.response?.data?.message || 'Check-in failed');
      scanLockRef.current = false;
      setIsProcessing(false);
    }
  };

  const handleCheckOut = async () => {
    try {
      const { data } = await apiClient.post('/qr-attendance/check-out', {
        employeeId: user.employeeId
      });

      if (data.success) {
        setScanStatus('success');
        setStatusMessage('✅ Checked Out Successfully!');
        setAttendanceStatus('checked-out');
        
        await logAudit('EMPLOYEE_CHECK_OUT', {
          employeeId: user.employeeId,
          method: 'qr_scan',
          timestamp: new Date().toISOString()
        });

        setTimeout(() => {
          navigate('/employee', { replace: true });
        }, 1500);
      }
    } catch (error) {
      console.error('Check-out error:', error);
      setScanStatus('error');
      setStatusMessage(error?.response?.data?.message || 'Check-out failed');
    }
  };

  const handleClearScan = () => {
    setScanStatus('idle');
    setStatusMessage('');
    setAttendanceStatus(null);
    setQrReaderKey(prev => prev + 1);
  };

  const handleLogout = () => {
    onLogout();
    navigate('/login', { replace: true });
  };

  return (
    <div className="employee-qr-container">
      {/* Header */}
      <header className="employee-qr-header">
        <div className="header-content">
          <h1 className="header-title">Employee Check-In</h1>
          <p className="header-status">Logged in as: <strong>{user?.employeeName || 'Employee'}</strong></p>
        </div>
        <div className="header-buttons">
          <button onClick={() => navigate('/employee')} className="dashboard-button employee-dashboard">
            📊 Dashboard
          </button>
          <button onClick={handleLogout} className="logout-button">
            🚪 Logout
          </button>
        </div>
      </header>

      {/* Main Content */}
      <div className="employee-qr-content">
        {!attendanceStatus || attendanceStatus === 'checked-in' ? (
          <div className="scanner-section employee-scanner">
            <div className="scanner-wrapper">
              <div className={`qr-reader ${scanStatus}`}>
                <StableQrReader
                  key={qrReaderKey}
                  onResult={handleScan}
                  onError={(error) => {
                    console.error('Camera error:', error);
                    setCameraError(error?.message || 'Unable to access camera');
                  }}
                  constraints={{
                    facingMode: { ideal: 'environment' },
                    width: { ideal: 1280 },
                    height: { ideal: 720 }
                  }}
                  videoStyle={{ width: '100%', height: '100%' }}
                  ViewFinder={() => (
                    <div className="qr-frame employee-frame">
                      <div className="qr-frame-corner qr-frame-corner-tl"></div>
                      <div className="qr-frame-corner qr-frame-corner-tr"></div>
                      <div className="qr-frame-corner qr-frame-corner-bl"></div>
                      <div className="qr-frame-corner qr-frame-corner-br"></div>
                      <div className="qr-scan-line"></div>
                    </div>
                  )}
                />
              </div>

              {cameraError && (
                <div className="camera-error">
                  <p>Camera Error: {cameraError}</p>
                  <p>Please ensure camera access is granted</p>
                </div>
              )}

              <div className={`scanner-status ${scanStatus}`}>
                {scanStatus === 'idle' && (
                  <p>Scan QR code to check in</p>
                )}
                {scanStatus === 'success' && (
                  <p className="success-message">{statusMessage}</p>
                )}
                {scanStatus === 'error' && (
                  <p className="error-message">{statusMessage}</p>
                )}
              </div>
            </div>

            <div className="scanner-options">
              <button 
                onClick={handleCheckIn}
                disabled={isProcessing}
                className="btn-checkin"
              >
                ✅ Check In
              </button>
              <button 
                onClick={handleCheckOut}
                disabled={isProcessing}
                className="btn-checkout"
              >
                🚪 Check Out
              </button>
              <button 
                onClick={handleClearScan}
                disabled={isProcessing}
                className="btn-clear"
              >
                🔄 Clear
              </button>
            </div>
          </div>
        ) : (
          <div className="success-card">
            <div className="success-icon">✅</div>
            <h2>Check-Out Successful!</h2>
            <p>You have successfully checked out. Have a great day!</p>
            <button onClick={handleClearScan} className="btn-continue">
              Continue
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default EmployeeQRScanner;
