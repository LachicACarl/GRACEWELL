import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { QrReader } from 'react-qr-reader';
import './QRScanLogin.css';
import { apiClient, logAudit } from '../utils/authService';
import Navbar from '../components/Navbar';

const QRScanLogin = ({ user, onLogout }) => {
  const navigate = useNavigate();
  const [scanStatus, setScanStatus] = useState('idle'); // idle, success, error
  const [statusMessage, setStatusMessage] = useState('');
  const [cameraError, setCameraError] = useState('');
  const [cameraReady, setCameraReady] = useState(false);
  const [showManualEntry, setShowManualEntry] = useState(false);
  const [manualEmpId, setManualEmpId] = useState('');
  const [qrReaderKey, setQrReaderKey] = useState(0);
  const [scannedEmployee, setScannedEmployee] = useState(null);
  const [scannedEmployeeStatus, setScannedEmployeeStatus] = useState(null); // 'checked-in', 'checked-out', 'new'
  const [isProcessing, setIsProcessing] = useState(false);
  const isMountedRef = useRef(true);
  const scanLockRef = useRef(false);
  const lastScanRef = useRef({ value: '', at: 0 });
  const scanCooldownMs = 3000;

  const normalizeEmployeeCode = (value) => String(value || '').trim().toUpperCase();

  // Redirect non-admin users away
  useEffect(() => {
    if (!user || user.userRole !== 'admin') {
      navigate('/login', { replace: true });
    }
  }, [user, navigate]);

  // Request camera permissions on component mount
  useEffect(() => {
    isMountedRef.current = true;

    // Suppress non-critical console warnings
    const originalWarn = console.warn;
    const originalError = console.error;
    
    console.warn = function(...args) {
      const message = String(args[0]);
      if (message.includes('React Router') ||
          message.includes('Future Flag') ||
          message.includes('BrowserCodeReader') || 
          message.includes('Canvas2D') ||
          message.includes('Trying to play video') ||
          message.includes('defaultProps')) {
        return;
      }
      originalWarn(...args);
    };

    console.error = function(...args) {
      const message = String(args[0]);
      if (message.includes('BrowserCodeReader') || 
          message.includes('Canvas2D') ||
          message.includes('React Router') ||
          message.includes('defaultProps')) {
        return;
      }
      originalError(...args);
    };

    return () => {
      isMountedRef.current = false;
      console.warn = originalWarn;
      console.error = originalError;
    };
  }, []);

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
      const resolvedCode = resolveEmployeeCode(scannedValue);
      if (!resolvedCode) {
        setScanStatus('error');
        setStatusMessage('Invalid QR code format');
        setTimeout(() => {
          setScanStatus('idle');
          setStatusMessage('');
          scanLockRef.current = false;
          setIsProcessing(false);
        }, 2000);
        return;
      }

      // Fetch employee details to show who was scanned
      const { data: empData } = await apiClient.get(`/employees/${resolvedCode}`);
      
      if (!empData?.employee) {
        setScanStatus('error');
        setStatusMessage('Employee not found');
        setTimeout(() => {
          setScanStatus('idle');
          setStatusMessage('');
          scanLockRef.current = false;
          setIsProcessing(false);
        }, 2000);
        return;
      }

      setScannedEmployee({
        employeeId: resolvedCode,
        name: empData.employee.name || `${empData.employee.first_name} ${empData.employee.last_name}`,
        department: empData.employee.department_name || 'N/A'
      });

      // Check current attendance status
      const today = new Date().toISOString().split('T')[0];
      const { data: attendanceData } = await apiClient.get(`/attendance/employee-status/${resolvedCode}?date=${today}`);
      
      if (attendanceData?.hasCheckedIn && !attendanceData?.hasCheckedOut) {
        setScannedEmployeeStatus('checked-in');
      } else if (attendanceData?.hasCheckedOut) {
        setScannedEmployeeStatus('checked-out');
      } else {
        setScannedEmployeeStatus('new');
      }

      setScanStatus('success');
      setStatusMessage(`${empData.employee.first_name || 'Employee'} found - Ready for action`);
    } catch (error) {
      console.error('Scan error:', error);
      setScanStatus('error');
      setStatusMessage(error?.response?.data?.message || 'Error scanning employee');
      setTimeout(() => {
        setScanStatus('idle');
        setStatusMessage('');
        scanLockRef.current = false;
        setIsProcessing(false);
      }, 2000);
    }
  };

  const resolveEmployeeCode = (value) => {
    const raw = String(value || '').trim();
    if (!raw) return '';

    // Handle pipe-separated format
    if (raw.includes('|')) {
      return normalizeEmployeeCode(raw.split('|')[0]);
    }

    // Handle JSON format
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

  const handleManualEntry = async () => {
    const resolvedCode = resolveEmployeeCode(manualEmpId);
    if (!resolvedCode) {
      setStatusMessage('Please enter a valid employee ID');
      return;
    }

    setIsProcessing(true);
    try {
      const { data: empData } = await apiClient.get(`/employees/${resolvedCode}`);
      
      if (!empData?.employee) {
        setStatusMessage('Employee not found');
        setIsProcessing(false);
        return;
      }

      setScannedEmployee({
        employeeId: resolvedCode,
        name: empData.employee.name || `${empData.employee.first_name} ${empData.employee.last_name}`,
        department: empData.employee.department_name || 'N/A'
      });

      // Check current attendance status
      const today = new Date().toISOString().split('T')[0];
      const { data: attendanceData } = await apiClient.get(`/attendance/employee-status/${resolvedCode}?date=${today}`);
      
      if (attendanceData?.hasCheckedIn && !attendanceData?.hasCheckedOut) {
        setScannedEmployeeStatus('checked-in');
      } else if (attendanceData?.hasCheckedOut) {
        setScannedEmployeeStatus('checked-out');
      } else {
        setScannedEmployeeStatus('new');
      }

      setShowManualEntry(false);
      setManualEmpId('');
      setScanStatus('success');
      setStatusMessage(`${empData.employee.first_name || 'Employee'} found - Ready for action`);
    } catch (error) {
      setStatusMessage(error?.response?.data?.message || 'Error fetching employee');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleCheckIn = async () => {
    if (!scannedEmployee) {
      setStatusMessage('Please scan an employee first');
      return;
    }

    if (scannedEmployeeStatus === 'checked-in') {
      setStatusMessage('Employee already checked in. Use Check-Out instead.');
      return;
    }

    setIsProcessing(true);
    try {
      const { data } = await apiClient.post('/qr-attendance/check-in', {
        employeeId: scannedEmployee.employeeId,
        method: 'qr',
        source: 'qr-scanner'
      });

      // Log audit
      await logAudit('QR_CHECK_IN', {
        employeeId: scannedEmployee.employeeId,
        scannedBy: user.employeeId,
        timestamp: new Date().toISOString()
      });

      setScanStatus('success');
      setStatusMessage(`✓ Check-in successful for ${scannedEmployee.name}`);
      setScannedEmployeeStatus('checked-in');
      
      setTimeout(() => {
        setScannedEmployee(null);
        setScanStatus('idle');
        setStatusMessage('');
        setQrReaderKey(prev => prev + 1); // Reset QR reader
      }, 2000);
    } catch (error) {
      setScanStatus('error');
      setStatusMessage(error?.response?.data?.message || 'Check-in failed');
      setTimeout(() => {
        setScanStatus('idle');
        setStatusMessage('');
      }, 2000);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleCheckOut = async () => {
    if (!scannedEmployee) {
      setStatusMessage('Please scan an employee first');
      return;
    }

    if (scannedEmployeeStatus === 'checked-out' || scannedEmployeeStatus === 'new') {
      setStatusMessage('Employee has not checked in yet. Use Check-In instead.');
      return;
    }

    setIsProcessing(true);
    try {
      const { data } = await apiClient.post('/qr-attendance/check-out', {
        employeeId: scannedEmployee.employeeId,
        method: 'qr',
        source: 'qr-scanner'
      });

      // Log audit
      await logAudit('QR_CHECK_OUT', {
        employeeId: scannedEmployee.employeeId,
        scannedBy: user.employeeId,
        timestamp: new Date().toISOString()
      });

      setScanStatus('success');
      setStatusMessage(`✓ Check-out successful for ${scannedEmployee.name}`);
      setScannedEmployeeStatus('checked-out');
      
      setTimeout(() => {
        setScannedEmployee(null);
        setScanStatus('idle');
        setStatusMessage('');
        setQrReaderKey(prev => prev + 1); // Reset QR reader
      }, 2000);
    } catch (error) {
      setScanStatus('error');
      setStatusMessage(error?.response?.data?.message || 'Check-out failed');
      setTimeout(() => {
        setScanStatus('idle');
        setStatusMessage('');
      }, 2000);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleClearScan = () => {
    setScannedEmployee(null);
    setScannedEmployeeStatus(null);
    setScanStatus('idle');
    setStatusMessage('');
    setQrReaderKey(prev => prev + 1); // Reset QR reader
  };

  return (
    <div className="qr-scan-login-container">
      <Navbar user={user} onLogout={onLogout} />
      
      <div className="qr-scan-content">
        <div className="qr-scan-header">
          <h1>QR Attendance Scanner</h1>
          <p className="qr-scan-subtitle">Admin-Only Module for Employee Check-In/Out</p>
        </div>

        <div className="qr-scan-main">
          {!scannedEmployee ? (
            <div className="qr-scanner-section">
              <div className="qr-scanner-wrapper">
                <div className={`qr-reader ${scanStatus}`}>
                  <QrReader
                    key={qrReaderKey}
                    onResult={handleScan}
                    constraints={{
                      facingMode: { ideal: 'environment' },
                      width: { ideal: 1280 },
                      height: { ideal: 720 }
                    }}
                    videoStyle={{ width: '100%', height: '100%' }}
                    ViewFinder={() => (
                      <div className="qr-frame">
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
                    <p>Please ensure camera access is granted and the browser supports camera access.</p>
                  </div>
                )}

                <div className={`scanner-status ${scanStatus}`}>
                  {scanStatus === 'idle' && (
                    <p>Point camera at QR code to scan employee</p>
                  )}
                  {scanStatus === 'success' && (
                    <p className="success-message">{statusMessage}</p>
                  )}
                  {scanStatus === 'error' && (
                    <p className="error-message">{statusMessage}</p>
                  )}
                </div>
              </div>

              <div className="qr-scanner-options">
                <button 
                  className="btn-manual-entry"
                  onClick={() => setShowManualEntry(!showManualEntry)}
                  disabled={isProcessing}
                >
                  {showManualEntry ? 'Use Camera' : 'Manual Entry'}
                </button>
              </div>

              {showManualEntry && (
                <div className="manual-entry-section">
                  <input
                    type="text"
                    placeholder="Enter Employee ID"
                    value={manualEmpId}
                    onChange={(e) => setManualEmpId(e.target.value)}
                    onKeyPress={(e) => e.key === 'Enter' && handleManualEntry()}
                    disabled={isProcessing}
                    className="manual-input"
                  />
                  <button 
                    onClick={handleManualEntry}
                    disabled={isProcessing || !manualEmpId}
                    className="btn-search"
                  >
                    {isProcessing ? 'Searching...' : 'Search'}
                  </button>
                </div>
              )}
            </div>
          ) : (
            <div className="scanned-employee-section">
              <div className={`employee-card status-${scannedEmployeeStatus}`}>
                <div className="employee-header">
                  <h2>{scannedEmployee.name}</h2>
                  <p className="employee-id">ID: {scannedEmployee.employeeId}</p>
                  <p className="employee-dept">{scannedEmployee.department}</p>
                </div>

                <div className="employee-status">
                  <span className={`status-badge ${scannedEmployeeStatus}`}>
                    {scannedEmployeeStatus === 'checked-in' && '✓ Checked In'}
                    {scannedEmployeeStatus === 'checked-out' && '✓ Checked Out'}
                    {scannedEmployeeStatus === 'new' && 'Ready to Check In'}
                  </span>
                  <p className="status-time">{new Date().toLocaleTimeString()}</p>
                </div>

                <div className="action-buttons">
                  <button 
                    className="btn-check-in"
                    onClick={handleCheckIn}
                    disabled={isProcessing || scannedEmployeeStatus === 'checked-in'}
                  >
                    {isProcessing ? 'Processing...' : 'Check In'}
                  </button>
                  <button 
                    className="btn-check-out"
                    onClick={handleCheckOut}
                    disabled={isProcessing || scannedEmployeeStatus !== 'checked-in'}
                  >
                    {isProcessing ? 'Processing...' : 'Check Out'}
                  </button>
                </div>

                <button 
                  className="btn-clear"
                  onClick={handleClearScan}
                  disabled={isProcessing}
                >
                  Scan Another
                </button>
              </div>

              {statusMessage && (
                <div className={`message ${scanStatus}`}>
                  {statusMessage}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default QRScanLogin;
