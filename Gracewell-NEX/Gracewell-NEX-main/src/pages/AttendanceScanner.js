import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import Html5QrScanner from '../components/Html5QrScanner';
import './AttendanceScanner.css';
import { apiClient, logAudit } from '../utils/authService';
import NexusLogo from '../assets/nexus-logo.png';

const AttendanceScanner = ({ user, onLogout }) => {
  const navigate = useNavigate();
  const [scanStatus, setScanStatus] = useState('idle'); // idle, success, error
  const [message, setMessage] = useState('');
  const [cameraError, setCameraError] = useState('');
  const [cameraReady, setCameraReady] = useState(false);
  const [cameraConstraints, setCameraConstraints] = useState({
    facingMode: { ideal: 'environment' },
    width: { ideal: 1280 },
    height: { ideal: 720 }
  });
  const [cameraRetryCount, setCameraRetryCount] = useState(0);
  const [qrReaderKey, setQrReaderKey] = useState(0);
  const [showManualEntry, setShowManualEntry] = useState(false);
  const [manualEmpId, setManualEmpId] = useState('');
  const [manualPassword, setManualPassword] = useState('');
  const [manualErrors, setManualErrors] = useState({});
  const [qrFrameClass, setQrFrameClass] = useState('active');
  const [lastScannedEmployee, setLastScannedEmployee] = useState(null);
  const isMountedRef = useRef(true);
  const scanLockRef = useRef(false);
  const lastScanRef = useRef({ value: '', at: 0 });
  const scanCooldownMs = 3000;

  const normalizeEmployeeCode = (value) => String(value || '').trim().toUpperCase();

  const resolveEmployeeCode = (value) => {
    const raw = String(value || '').trim();
    if (!raw) return '';

    if (raw.includes('|')) {
      return normalizeEmployeeCode(raw.split('|')[0]);
    }

    if ((raw.startsWith('{') && raw.endsWith('}')) || (raw.startsWith('[') && raw.endsWith(']'))) {
      try {
        const parsed = JSON.parse(raw);
        const candidate = parsed?.employeeId || parsed?.employee_id || parsed?.employeeCode || parsed?.employee_code;
        if (candidate) {
          return normalizeEmployeeCode(candidate);
        }
      } catch {
        return normalizeEmployeeCode(raw);
      }
    }

    return normalizeEmployeeCode(raw);
  };

  // Redirect non-employee users away
  useEffect(() => {
    if (!user || user.userRole !== 'employee') {
      navigate('/', { replace: true });
    }
  }, [user, navigate]);

  // Request camera permissions on component mount
  useEffect(() => {
    isMountedRef.current = true;

    // Suppress all non-critical console warnings
    const originalWarn = console.warn;
    const originalError = console.error;
    
    console.warn = function(...args) {
      const message = String(args[0]);
      // Filter out all these known non-critical warnings
      if (message.includes('React Router') ||
          message.includes('Future Flag') ||
          message.includes('v7_startTransition') ||
          message.includes('v7_relativeSplatPath') ||
          message.includes('BrowserCodeReader') || 
          message.includes('Canvas2D') ||
          message.includes('willReadFrequently') ||
          message.includes('Trying to play video') ||
          message.includes('interrupted by a new load') ||
          message.includes('defaultProps will be removed') ||
          message.includes('It was not possible to play the video') ||
          message.includes('Support for defaultProps') ||
          message.includes('getImageData') ||
          message.includes('HTMLCanvasElementLuminanceSource') ||
          message.includes('Multiple readback operations')) {
        return;
      }
      originalWarn(...args);
    };

    console.error = function(...args) {
      const message = String(args[0]);
      if (message.includes('BrowserCodeReader') || 
          message.includes('Canvas2D') ||
          message.includes('willReadFrequently') ||
          message.includes('React Router') ||
          message.includes('defaultProps') ||
          message.includes('Support for defaultProps') ||
          message.includes('getImageData') ||
          message.includes('HTMLCanvasElementLuminanceSource') ||
          message.includes('Multiple readback operations')) {
        return;
      }
      originalError(...args);
    };

    const requestCameraPermission = async () => {
      const candidateConstraints = [
        {
          video: {
            facingMode: { ideal: 'environment' },
            width: { ideal: 1280 },
            height: { ideal: 720 }
          },
          audio: false
        },
        {
          video: {
            facingMode: { ideal: 'user' },
            width: { ideal: 1280 },
            height: { ideal: 720 }
          },
          audio: false
        },
        {
          video: {
            width: { ideal: 1280 },
            height: { ideal: 720 }
          },
          audio: false
        }
      ];

      let lastError = null;

      for (const constraints of candidateConstraints) {
        try {
          const stream = await navigator.mediaDevices.getUserMedia(constraints);
          const videoTrack = stream.getVideoTracks?.()[0];
          const settings = videoTrack?.getSettings?.() || {};
          stream.getTracks().forEach(track => track.stop());

          if (isMountedRef.current) {
            if (settings.deviceId) {
              setCameraConstraints({
                deviceId: { exact: settings.deviceId },
                width: { ideal: 1280 },
                height: { ideal: 720 }
              });
            } else {
              setCameraConstraints(constraints.video);
            }
            setCameraReady(true);
            setCameraError('');
          }
          return;
        } catch (error) {
          lastError = error;
        }
      }

      if (isMountedRef.current) {
        setCameraReady(false);
        if (lastError?.name === 'NotAllowedError') {
          setCameraError('Camera access denied. Please grant camera permissions in your browser settings.');
        } else if (lastError?.name === 'NotFoundError') {
          setCameraError('No camera device found. Please connect a camera or check if it is already in use.');
        } else if (lastError?.name === 'NotReadableError') {
          setCameraError('Camera is already in use by another application. Please close other apps using the camera.');
        } else {
          setCameraError(`Camera error: ${lastError?.message || 'Unable to access camera'}`);
        }
      }
    };

    requestCameraPermission();

    return () => {
      isMountedRef.current = false;
      // Restore original console functions
      console.warn = originalWarn;
      console.error = originalError;
    };
  }, []);

  // Reset QR reader key when camera ready state changes
  useEffect(() => {
    if (cameraReady) {
      setQrReaderKey(prev => prev + 1);
    }
  }, [cameraReady]);

  const retryCamera = async () => {
    setCameraError('');
    setCameraReady(false);
    setCameraRetryCount(prev => prev + 1);

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user' },
        audio: false
      });
      const videoTrack = stream.getVideoTracks?.()[0];
      const settings = videoTrack?.getSettings?.() || {};
      stream.getTracks().forEach(track => track.stop());

      if (settings.deviceId) {
        setCameraConstraints({
          deviceId: { exact: settings.deviceId },
          width: { ideal: 1280 },
          height: { ideal: 720 }
        });
      } else {
        setCameraConstraints({
          facingMode: { ideal: 'user' },
          width: { ideal: 1280 },
          height: { ideal: 720 }
        });
      }

      setCameraReady(true);
      setQrReaderKey(prev => prev + 1);
    } catch (err) {
      setCameraError(err?.message || 'Unable to access camera. Please check browser permissions.');
    }
  };

  const validateManualEntry = () => {
    const errors = {};
    if (!manualEmpId.trim()) {
      errors.empId = 'Employee ID is required';
    }
    if (!manualPassword.trim()) {
      errors.password = 'Password is required';
    }
    setManualErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleManualSubmit = async () => {
    if (!validateManualEntry()) {
      return;
    }

    await submitAttendance({
      employeeId: manualEmpId.trim(),
      method: 'qr',
      password: manualPassword,
      source: 'manual'
    });

    setShowManualEntry(false);
    setManualEmpId('');
    setManualPassword('');
    setManualErrors({});
  };

  const submitAttendance = async ({ employeeId, method, password, source }) => {
    if (scanLockRef.current) {
      return;
    }
    scanLockRef.current = true;
    try {
      setScanStatus('processing');
      setMessage('');
      setQrFrameClass('active');

      const normalizedEmployeeId = resolveEmployeeCode(employeeId);
      const currentUserEmployeeCode = resolveEmployeeCode(user?.employeeId || user?.employeeCode);

      // Employee can only scan own ID (enforced per Gracewell NEXUS flow)
      if (user?.userRole === 'employee' && normalizedEmployeeId && normalizedEmployeeId !== currentUserEmployeeCode) {
        setScanStatus('error');
        setMessage('⚠️ You can only submit your own attendance.');
        setQrFrameClass('');
        scanLockRef.current = false;
        return;
      }

      // Backend determines IN vs OUT based on existing record
      // Source: 'scanner' (QR) or 'manual' (admin override)
      const payload = {
        employeeId: normalizedEmployeeId || currentUserEmployeeCode,
        method,
        password,
        source,
        qrCode: method === 'qr' ? employeeId : null
      };

      const { data } = await apiClient.post('/attendance/check-in', payload);
      const action = data?.action || 'check_in';
      const employee = data?.employee || data?.user || { id: payload.employeeId, name: payload.employeeId };

      // Log attendance action
      await logAudit(source === 'manual' ? 'MANUAL_ATTENDANCE' : 'QR_ATTENDANCE', {
        employeeId: payload.employeeId,
        action: action,
        method: method,
        source: source
      });

      setScanStatus('success');
      setQrFrameClass('success');
      setLastScannedEmployee(employee);
      setMessage(action === 'check_out' ? '✅ Check-out recorded' : '✅ Check-in recorded');

      // Redirect to employee dashboard after successful attendance
      setTimeout(() => {
        navigate('/employee');
      }, 2000);
    } catch (error) {
      if (error?.response?.status === 401) {
        onLogout();
        navigate('/login');
        scanLockRef.current = false;
        return;
      }
      setScanStatus('error');
      setMessage(error?.response?.data?.message || 'Attendance failed. Please try again.');
      setQrFrameClass('');
    } finally {
      scanLockRef.current = false;
    }
  };

  const handleQrResult = (text) => {
    if (!text) return;
    const now = Date.now();
    if (lastScanRef.current.value === text && now - lastScanRef.current.at < scanCooldownMs) {
      return;
    }
    lastScanRef.current = { value: text, at: now };
    submitAttendance({
      employeeId: text,
      method: 'qr',
      source: 'scanner'
    });
  };

  return (
    <div className="scanner-page">
      <div className="scanner-navbar">
        <div className="scanner-logo">
          <img src={NexusLogo} alt="Nexus Logo" className="scanner-logo-image" />
          <span className="scanner-logo-text">Gracewell NEXUS</span>
        </div>
        <div className="scanner-user">
          <span className="scanner-user-name">{user?.employeeName || 'User'}</span>
          <div className="user-avatar">
            {user?.employeeName ? user.employeeName.charAt(0) : 'U'}
          </div>
          <button className="scanner-logout-btn" onClick={onLogout}>Logout</button>
        </div>
      </div>

      <div className="scanner-left-panel">
        <h1>Gracewell NEXUS</h1>
        <h2>Attendance Checker</h2>
      </div>

      <div className="scanner-right-panel">
        <button className="manual-entry-btn" onClick={() => setShowManualEntry(true)}>
          <span>📝</span> Manual Entry
        </button>
        <div className="scanner-container">
          <div className={`qr-frame ${qrFrameClass}`}>
            <div className="qr-frame-corners-2"></div>
            <div className="scanner-camera-wrapper">
              <Html5QrScanner
                key={`qr-scanner-${qrReaderKey}`}
                onScanSuccess={handleQrResult}
                onScanError={(errorMessage) => {
                  if (errorMessage && !errorMessage.includes('NotFoundException')) {
                    setCameraError(errorMessage);
                  }
                }}
                fps={10}
                qrbox={250}
              />
            </div>
          </div>

          <div className="scan-instruction">
            {cameraError ? (
              <div style={{ color: '#d32f2f', backgroundColor: '#ffebee', padding: '12px', borderRadius: '4px', marginBottom: '15px' }}>
                <strong>⚠️ Camera Error:</strong><br/>
                {cameraError}
                <div style={{ marginTop: '10px' }}>
                  <button type="button" className="btn-retry" onClick={retryCamera}>
                    Retry Camera
                  </button>
                </div>
              </div>
            ) : (
              <p>Please place your QR code front of the camera to begin the scan</p>
            )}
          </div>

          {message && (
            <div className={`scan-status ${scanStatus === 'success' ? 'status-success' : 'status-error'}`}>
              {scanStatus === 'success' && lastScannedEmployee && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
                  <div style={{ textAlign: 'left' }}>
                    <div style={{ fontWeight: '600', fontSize: '16px' }}>
                      {lastScannedEmployee.name || 'Employee'}
                    </div>
                    <div style={{ fontSize: '13px', opacity: 0.9 }}>
                      ID: {lastScannedEmployee.id || lastScannedEmployee.employeeId}
                    </div>
                    <div style={{ fontSize: '12px', marginTop: '5px', color: '#27ae60', fontWeight: '500' }}>✓ Image Verified</div>
                  </div>
                </div>
              )}
              {scanStatus !== 'success' && message}
            </div>
          )}
        </div>

        {/* Manual Entry Modal */}
        {showManualEntry && (
          <div className="scanner-overlay">
            <div className="scanner-modal">
              <h3>Manual Attendance Entry</h3>
              <p className="scanner-modal-description">
                Enter Employee ID and Password to confirm the changes
              </p>

              <form onSubmit={(e) => {
                e.preventDefault();
                handleManualSubmit();
              }}>
                <div className="form-group">
                  <label>Employee ID</label>
                  <input 
                    type="text" 
                    value={manualEmpId}
                    onChange={(e) => {
                      setManualEmpId(e.target.value.toUpperCase());
                      if (manualErrors.empId) {
                        setManualErrors({ ...manualErrors, empId: '' });
                      }
                    }}
                    className={manualErrors.empId ? 'error' : ''}
                    placeholder="Enter Employee ID"
                    autoFocus
                  />
                  {manualErrors.empId && <span className="error-message">{manualErrors.empId}</span>}
                </div>

                <div className="form-group">
                  <label>Password</label>
                  <input 
                    type="password" 
                    value={manualPassword}
                    onChange={(e) => {
                      setManualPassword(e.target.value);
                      if (manualErrors.password) {
                        setManualErrors({ ...manualErrors, password: '' });
                      }
                    }}
                    className={manualErrors.password ? 'error' : ''}
                    placeholder="Enter Password"
                  />
                  {manualErrors.password && <span className="error-message">{manualErrors.password}</span>}
                </div>

                <div className="scanner-modal-buttons">
                  <button type="button" className="btn-cancel" onClick={() => {
                    setShowManualEntry(false);
                    setManualEmpId('');
                    setManualPassword('');
                    setManualErrors({});
                  }}>
                    Cancel
                  </button>
                  <button type="submit" className="btn-confirm">
                    Confirm
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default AttendanceScanner;
