import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import Html5QrScanner from '../components/Html5QrScanner';
import './QRScanner.css';
import { apiClient, logAudit } from '../utils/authService';
import NexusLogo from '../assets/nexus-logo.png';

const QRScanner = ({ user, onLogout }) => {
  const navigate = useNavigate();
  const [selectedAction, setSelectedAction] = useState(null); // null, 'check-in', 'check-out'
  const [scanStatus, setScanStatus] = useState('idle'); // idle, success, error
  const [statusMessage, setStatusMessage] = useState('');
  const [showManualEntry, setShowManualEntry] = useState(false);
  const [manualEmpId, setManualEmpId] = useState('');
  const [qrReaderKey, setQrReaderKey] = useState(0);
  const [scannedEmployee, setScannedEmployee] = useState(null);
  const [scannedEmployeeStatus, setScannedEmployeeStatus] = useState(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [cameraError, setCameraError] = useState('');
  const isMountedRef = useRef(true);
  const scanLockRef = useRef(false);
  const lastScanRef = useRef({ value: '', at: 0 });
  const autoExecutedRef = useRef(false);
  const scanCooldownMs = 3000;

  // Check authentication - QR Scanner, admin, super_admin, or employee can access
  useEffect(() => {
    if (!user || (user.userRole !== 'qr_scanner' && user.userRole !== 'admin' && user.userRole !== 'super_admin' && user.userRole !== 'employee')) {
      navigate('/login', { replace: true });
    }
    isMountedRef.current = true;
    
    // Clear any pre-filled manual entry
    setManualEmpId('');

    return () => {
      isMountedRef.current = false;
    };
  }, [user, navigate]);

  const normalizeEmployeeCode = (value) => {
    const code = String(value || '').trim().toUpperCase();
    // Just normalize - don't reject based on format, let backend validate
    return code;
  };

  const isValidEmployeeId = (value) => {
    return /^[A-Za-z]{1,3}\d{1,4}$/.test(String(value || '').trim());
  };

  const handleScan = async (result) => {
    if (!isMountedRef.current) return;

    const scannedValue = typeof result === 'string'
      ? result.trim()
      : String(result?.text || '').trim();

    if (!scannedValue) return;
    console.log('[QR Scanner] Scanned value:', scannedValue);
    
    if (cameraError) {
      setCameraError('');
    }
    const now = Date.now();
    const timeSinceLastScan = now - lastScanRef.current.at;

    // Debounce identical scans
    if (scannedValue === lastScanRef.current.value && timeSinceLastScan < scanCooldownMs) {
      console.log('[QR Scanner] Duplicate scan detected, ignoring');
      return;
    }

    // Debounce if already processing
    if (isProcessing || scanLockRef.current) {
      console.log('[QR Scanner] Already processing, ignoring');
      return;
    }

    lastScanRef.current = { value: scannedValue, at: now };
    scanLockRef.current = true;
    setIsProcessing(true);

    try {
      const resolvedCode = resolveEmployeeCode(scannedValue);
      console.log('[QR Scanner] Resolved employee code:', resolvedCode);
      
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

      // Fetch employee details
      console.log('[QR Scanner] Fetching employee:', resolvedCode);
      const { data: empData } = await apiClient.get(`/employees/${resolvedCode}`);
      console.log('[QR Scanner] Employee data received:', empData);
      
      if (!empData?.employee) {
        setScanStatus('error');
        setStatusMessage(`❌ Employee ${resolvedCode} not found. Check employee ID or create new employee.`);
        setTimeout(() => {
          setScanStatus('idle');
          setStatusMessage('');
          scanLockRef.current = false;
          setIsProcessing(false);
        }, 3000);
        return;
      }

      setScannedEmployee({
        employeeId: resolvedCode,
        name: empData.employee.name || `${empData.employee.first_name} ${empData.employee.last_name}`,
        department: empData.employee.department_name || 'N/A'
      });

      // Check attendance status
      const today = new Date().toISOString().split('T')[0];
      console.log('[QR Scanner] Checking attendance for today:', today);
      const { data: attendanceData } = await apiClient.get(`/attendance/employee-status/${resolvedCode}?date=${today}`);
      console.log('[QR Scanner] Attendance status:', attendanceData);
      
      if (attendanceData?.hasCheckedIn && !attendanceData?.hasCheckedOut) {
        setScannedEmployeeStatus('checked-in');
      } else if (attendanceData?.hasCheckedOut) {
        setScannedEmployeeStatus('checked-out');
      } else {
        setScannedEmployeeStatus('new');
      }

      setScanStatus('success');
      setStatusMessage(`${empData.employee.first_name || 'Employee'} found - Ready for action`);

      // Release scan processing lock so auto-execute effect can run
      setIsProcessing(false);
      scanLockRef.current = false;
      
      // Don't auto-execute here - let the useEffect handle it after state updates
    } catch (error) {
      console.error('[QR Scanner] Scan error:', error);
      setScanStatus('error');
      const errorMsg = error?.response?.data?.message || error?.message || 'Error scanning employee';
      // Check if it's a 404 (not found) vs other errors
      if (error?.response?.status === 404) {
        setStatusMessage(`❌ ${errorMsg} - Employee code may be incorrect or not registered.`);
      } else {
        setStatusMessage(`❌ ${errorMsg}`);
      }
      setTimeout(() => {
        setScanStatus('idle');
        setStatusMessage('');
        scanLockRef.current = false;
        setIsProcessing(false);
      }, 3000);
    }
  };

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

  const handleManualEntry = async () => {
    const resolvedCode = resolveEmployeeCode(manualEmpId);
    if (!resolvedCode || !isValidEmployeeId(resolvedCode)) {
      setScanStatus('error');
      setStatusMessage('Please enter a valid Employee ID (e.g., GW001)');
      return;
    }

    console.log('[QR Scanner] Manual entry - employee ID:', resolvedCode);
    setIsProcessing(true);
    try {
      const { data: empData } = await apiClient.get(`/employees/${resolvedCode}`);
      console.log('[QR Scanner] Manual entry - employee data:', empData);
      
      if (!empData?.employee) {
        setStatusMessage('Employee not found');
        setIsProcessing(false);
        return;
      }

      setShowManualEntry(false);
      setManualEmpId('');

      setScannedEmployee({
        employeeId: resolvedCode,
        name: empData.employee.name || `${empData.employee.first_name} ${empData.employee.last_name}`,
        department: empData.employee.department_name || 'N/A'
      });

      const today = new Date().toISOString().split('T')[0];
      const { data: attendanceData } = await apiClient.get(`/attendance/employee-status/${resolvedCode}?date=${today}`);
      console.log('[QR Scanner] Manual entry - attendance status:', attendanceData);
      
      if (attendanceData?.hasCheckedIn && !attendanceData?.hasCheckedOut) {
        setScannedEmployeeStatus('checked-in');
      } else if (attendanceData?.hasCheckedOut) {
        setScannedEmployeeStatus('checked-out');
      } else {
        setScannedEmployeeStatus('new');
      }

      setScanStatus('success');
      setStatusMessage(`${empData.employee.first_name || 'Employee'} found - Executing action...`);

      // Let the auto-execute effect run after state updates settle
      autoExecutedRef.current = false;
      setIsProcessing(false);
    } catch (error) {
      console.error('[QR Scanner] Manual entry error:', error);
      setScanStatus('error');
      setStatusMessage(error?.response?.data?.message || 'Error fetching employee');
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
    console.log('[QR Scanner] Starting check-in for:', scannedEmployee.employeeId);
    try {
      const response = await apiClient.post('/qr-attendance/check-in', {
        employeeId: scannedEmployee.employeeId,
        method: 'qr',
        source: 'qr-scanner'
      });
      
      console.log('[QR Scanner] Check-in response:', response.data);

      // Log audit
      try {
        await logAudit('QR_CHECK_IN', {
          employeeId: scannedEmployee.employeeId,
          scannedBy: user.employeeCode || user.employeeId,
          timestamp: new Date().toISOString()
        });
      } catch (auditError) {
        console.error('[QR Scanner] Audit log error:', auditError);
      }

      // Show success message and redirect to super_admin dashboard
      setScanStatus('success');
      setStatusMessage(`✅ Check-in successful! Redirecting to dashboard...`);
      console.log('[QRScanner] Redirecting to admin dashboard');
      
      // Redirect to admin dashboard
      setTimeout(() => {
        if (isMountedRef.current) {
          console.log('[QRScanner] Executing navigate to /admin');
          navigate('/admin', { replace: true });
          // Fallback after delay in case navigate fails
          setTimeout(() => {
            if (isMountedRef.current) {
              console.log('[QRScanner] Navigate failed, using window.location');
              window.location.href = '/admin';
            }
          }, 500);
        }
      }, 1500);
    } catch (error) {
      console.error('[QR Scanner] Check-in error:', error);
      setScanStatus('error');
      const errorMsg = error?.response?.data?.message || error?.message || 'Check-in failed';
      setStatusMessage(errorMsg);
      console.error('[QR Scanner] Error message:', errorMsg);
      setTimeout(() => {
        setScanStatus('idle');
        setStatusMessage('');
        setScannedEmployee(null);
        setSelectedAction(null);
      }, 3000);
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
    console.log('[QR Scanner] Starting check-out for:', scannedEmployee.employeeId);
    try {
      const response = await apiClient.post('/qr-attendance/check-out', {
        employeeId: scannedEmployee.employeeId,
        method: 'qr',
        source: 'qr-scanner'
      });
      
      console.log('[QR Scanner] Check-out response:', response.data);

      // Log audit
      try {
        await logAudit('QR_CHECK_OUT', {
          employeeId: scannedEmployee.employeeId,
          scannedBy: user.employeeCode || user.employeeId,
          timestamp: new Date().toISOString()
        });
      } catch (auditError) {
        console.error('[QR Scanner] Audit log error:', auditError);
      }

      // Show success message and redirect to super_admin dashboard
      setScanStatus('success');
      setStatusMessage(`✅ Check-out successful! Redirecting to dashboard...`);
      console.log('[QRScanner] Redirecting to admin dashboard');
      
      // Redirect to admin dashboard
      setTimeout(() => {
        if (isMountedRef.current) {
          console.log('[QRScanner] Executing navigate to /admin');
          navigate('/admin', { replace: true });
          // Fallback after delay in case navigate fails
          setTimeout(() => {
            if (isMountedRef.current) {
              console.log('[QRScanner] Navigate failed, using window.location');
              window.location.href = '/admin';
            }
          }, 500);
        }
      }, 1500);
    } catch (error) {
      console.error('[QR Scanner] Check-out error:', error);
      setScanStatus('error');
      const errorMsg = error?.response?.data?.message || error?.message || 'Check-out failed';
      setStatusMessage(errorMsg);
      console.error('[QR Scanner] Error message:', errorMsg);
      setTimeout(() => {
        setScanStatus('idle');
        setStatusMessage('');
        setScannedEmployee(null);
        setSelectedAction(null);
      }, 3000);
    } finally {
      setIsProcessing(false);
    }
  };

  // Auto-execute check-in/check-out when employee is scanned and action is selected
  useEffect(() => {
    if (scannedEmployee && selectedAction && !isProcessing && !autoExecutedRef.current) {
      autoExecutedRef.current = true;
      console.log('[QR Scanner] Auto-executing:', selectedAction, 'for', scannedEmployee.employeeId);
      
      if (selectedAction === 'check-in') {
        setTimeout(() => handleCheckIn(), 100);
      } else if (selectedAction === 'check-out') {
        setTimeout(() => handleCheckOut(), 100);
      }
    }
  }, [scannedEmployee?.employeeId, selectedAction, isProcessing]);

  // Reset auto-execute flag when action changes
  useEffect(() => {
    autoExecutedRef.current = false;
  }, [selectedAction]);

  const handleClearScan = () => {
    setScannedEmployee(null);
    setScannedEmployeeStatus(null);
    setScanStatus('idle');
    setStatusMessage('');
    setQrReaderKey(prev => prev + 1);
  };

  const handleLogout = () => {
    onLogout();
    navigate('/login', { replace: true });
  };

  return (
    <div className="scanner-page">
      <div className="scanner-navbar">
        <div className="scanner-logo">
          <img src={NexusLogo} alt="Nexus Logo" className="scanner-logo-image" />
          <span className="scanner-logo-text">Gracewell NEXUS</span>
        </div>
        <div className="scanner-user">
          <span className="scanner-user-name">{user?.employeeName || user?.employeeCode || 'User'}</span>
          <div className="user-avatar" style={{ overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            {user?.profile_image_url || user?.profileImage ? (
              <img 
                src={user?.profile_image_url || user?.profileImage} 
                alt={`${user?.employeeName || 'User'} avatar`}
                style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '50%' }}
              />
            ) : (
              (user?.employeeName || user?.employeeCode || 'U').charAt(0)
            )}
          </div>
          <button className="scanner-logout-btn" onClick={handleLogout}>Logout</button>
        </div>
      </div>

      <div className="scanner-left-panel">
        <h1>Gracewell NEXUS</h1>
        <h2>QR Scanner</h2>
      </div>

      <div className="scanner-right-panel">
        {/* STEP 1: Show ONLY Check In/Out buttons initially */}
        {!selectedAction && !scannedEmployee ? (
          <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', height: '100%', gap: '20px' }}>
            <h2 style={{ marginBottom: '40px' }}>Select Action</h2>
            <div className="action-buttons" style={{ gap: '20px', marginBottom: '20px' }}>
              <button
                className="btn-check-in"
                onClick={() => setSelectedAction('check-in')}
                disabled={isProcessing}
                style={{ padding: '15px 40px', fontSize: '18px' }}
              >
                {isProcessing ? '⏳ Processing...' : '✓ Check In'}
              </button>
              <button
                className="btn-check-out"
                onClick={() => setSelectedAction('check-out')}
                disabled={isProcessing}
                style={{ padding: '15px 40px', fontSize: '18px' }}
              >
                {isProcessing ? '⏳ Processing...' : '✗ Check Out'}
              </button>
            </div>
          </div>
        ) : !scannedEmployee ? (
          /* STEP 2: Show scanner after action selected */
          <>
            <button className="manual-entry-btn" onClick={() => setShowManualEntry(!showManualEntry)}>
              <span>⌨️</span> {showManualEntry ? 'Use Camera' : 'Manual Entry'}
            </button>

            <button 
              className="btn-clear"
              onClick={() => setSelectedAction(null)}
              disabled={isProcessing}
              style={{ marginBottom: '10px' }}
            >
              ← Back
            </button>

            <div className="scanner-container">
              <div className="qr-frame">
                <div className="qr-frame-corners-2"></div>
                <div className="scanner-camera-wrapper">
                  <Html5QrScanner
                    key={`qr-scanner-${qrReaderKey}`}
                    onScanSuccess={handleScan}
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
                      <button type="button" className="btn-retry" onClick={() => {
                        setCameraError('');
                        setQrReaderKey(prev => prev + 1);
                      }}>
                        Retry Camera
                      </button>
                    </div>
                  </div>
                ) : (
                  <p>Point camera at employee QR code to scan</p>
                )}
              </div>

              {statusMessage && (
                <div className={`scan-status ${scanStatus === 'success' ? 'status-success' : 'status-error'}`}>
                  {statusMessage}
                </div>
              )}
            </div>

            {showManualEntry && (
              <div className="scanner-overlay">
                <div className="scanner-modal">
                  <h3>Manual Entry</h3>
                  <p className="scanner-modal-description">
                    Enter Employee ID to scan manually
                  </p>

                  <form onSubmit={(e) => {
                    e.preventDefault();
                    handleManualEntry();
                  }}>
                    <div className="form-group">
                      <label htmlFor="manualEmpId">Employee ID</label>
                      <input 
                        id="manualEmpId"
                        name="employeeId"
                        type="text" 
                        value={manualEmpId}
                        onChange={(e) => setManualEmpId(e.target.value.toUpperCase())}
                        placeholder="Enter Employee ID (e.g., GW001)"
                        autoFocus
                        maxLength="10"
                      />
                    </div>

                    <div className="scanner-modal-buttons">
                      <button type="button" className="btn-cancel" onClick={() => {
                        setShowManualEntry(false);
                        setManualEmpId('');
                      }}>
                        Cancel
                      </button>
                      <button type="submit" className="btn-confirm" disabled={isProcessing || !isValidEmployeeId(manualEmpId)}>
                        {isProcessing ? 'Searching...' : 'Search'}
                      </button>
                    </div>
                  </form>
                </div>
              </div>
            )}
          </>
        ) : (
          /* STEP 3: Show success and redirect */
          <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', height: '100%', gap: '20px' }}>
            <div style={{ fontSize: '80px', animation: 'spin 2s linear infinite' }}>✅</div>
            <h2>Success!</h2>
            <p>{scannedEmployee.name}</p>
            <p style={{ fontSize: '14px', color: '#999' }}>Redirecting...</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default QRScanner;
