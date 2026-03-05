import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import './EmployeeDashboard.css';
import { apiClient, logAudit } from '../utils/authService';
import { 
  formatDateTime as formatDateTimeUtil, 
  formatDate as formatDateUtil, 
  formatTime, 
  formatAttendanceTime,
  getManilaDateString
} from '../utils/timezoneUtils';
import NexusLogo from '../assets/nexus-logo.png';

const EmployeeDashboard = ({ user, onLogout }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const [stats, setStats] = useState(null);
  const [attendanceFilter, setAttendanceFilter] = useState('week');
  const [salaryFilter, setSalaryFilter] = useState('week');
  const [attendanceRows, setAttendanceRows] = useState([]);
  const [salaryRows, setSalaryRows] = useState([]);
  const [attendanceLoading, setAttendanceLoading] = useState(false);
  const [salaryLoading, setSalaryLoading] = useState(false);
  const [showAbsenceModal, setShowAbsenceModal] = useState(false);
  const [showAbsenceConfirm, setShowAbsenceConfirm] = useState(false);
  const [absenceDate, setAbsenceDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [absenceReason, setAbsenceReason] = useState('');
  const [absenceSubmitting, setAbsenceSubmitting] = useState(false);
  const [absenceNotice, setAbsenceNotice] = useState('');
  const [absenceProofFile, setAbsenceProofFile] = useState(null);
  const [profileData, setProfileData] = useState(null);
  const [qrModalOpen, setQrModalOpen] = useState(false);
  const [correctionModalOpen, setCorrectionModalOpen] = useState(false);
  const [selectedAttendance, setSelectedAttendance] = useState(null);
  const [correctionCheckIn, setCorrectionCheckIn] = useState('');
  const [correctionCheckOut, setCorrectionCheckOut] = useState('');
  const [correctionReason, setCorrectionReason] = useState('');
  const [correctionProofFile, setCorrectionProofFile] = useState(null);
  const [correctionSubmitting, setCorrectionSubmitting] = useState(false);
  const [isAttendanceFilterOpen, setIsAttendanceFilterOpen] = useState(false);
  const [isSalaryFilterOpen, setIsSalaryFilterOpen] = useState(false);
  const [attendanceExportOpen, setAttendanceExportOpen] = useState(false);
  const [salaryExportOpen, setSalaryExportOpen] = useState(false);
  const [employeeNotifications, setEmployeeNotifications] = useState([]);
  const [employeeNotificationCount, setEmployeeNotificationCount] = useState(0);
  const [isEmployeeNotificationOpen, setIsEmployeeNotificationOpen] = useState(false);
  const [pendingAttendanceFocus, setPendingAttendanceFocus] = useState(null);
  const [highlightedAttendanceId, setHighlightedAttendanceId] = useState(null);
  
  // Get scanned employee ID from query parameter (from QR scanner)
  const queryParams = new URLSearchParams(location.search);
  const scannedEmployeeId = queryParams.get('empId');
  const viewingEmployeeId = scannedEmployeeId || user?.employeeId;
  const isScannedView = scannedEmployeeId && user?.userRole === 'qr_scanner';

  useEffect(() => {
    fetchDashboardStats();
  }, [viewingEmployeeId]);

  useEffect(() => {
    const loadProfile = async () => {
      try {
        const { data } = await apiClient.get('/users/profile');
        if (data?.user) {
          setProfileData(data.user);
        }
      } catch (error) {
        console.error('Failed to load profile:', error);
      }
    };

    loadProfile();
  }, []);

  useEffect(() => {
    if (viewingEmployeeId) {
      fetchAttendanceRecords();
    }
  }, [attendanceFilter, viewingEmployeeId]);

  useEffect(() => {
    if (viewingEmployeeId) {
      fetchSalaryRecords();
    }
  }, [salaryFilter, viewingEmployeeId]);

  useEffect(() => {
    if (user?.userRole !== 'employee') {
      return;
    }

    fetchEmployeeCorrectionNotifications();
    const interval = setInterval(fetchEmployeeCorrectionNotifications, 10000);

    const handleVisibilityRefresh = () => {
      if (!document.hidden) {
        fetchEmployeeCorrectionNotifications();
      }
    };

    window.addEventListener('focus', handleVisibilityRefresh);
    document.addEventListener('visibilitychange', handleVisibilityRefresh);

    return () => {
      clearInterval(interval);
      window.removeEventListener('focus', handleVisibilityRefresh);
      document.removeEventListener('visibilitychange', handleVisibilityRefresh);
    };
  }, [user?.userRole]);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (!event.target.closest('.dropdown-wrapper') && !event.target.closest('.export-dropdown-wrapper') && !event.target.closest('.employee-notification-wrapper')) {
        setIsAttendanceFilterOpen(false);
        setIsSalaryFilterOpen(false);
        setAttendanceExportOpen(false);
        setSalaryExportOpen(false);
        setIsEmployeeNotificationOpen(false);
      }
    };

    if (isAttendanceFilterOpen || isSalaryFilterOpen || attendanceExportOpen || salaryExportOpen || isEmployeeNotificationOpen) {
      document.addEventListener('click', handleClickOutside);
    }

    return () => {
      document.removeEventListener('click', handleClickOutside);
    };
  }, [isAttendanceFilterOpen, isSalaryFilterOpen, attendanceExportOpen, salaryExportOpen, isEmployeeNotificationOpen]);

  useEffect(() => {
    if (!pendingAttendanceFocus || !attendanceRows.length) {
      return;
    }

    const target = attendanceRows.find((row) => String(row.id) === String(pendingAttendanceFocus.attendanceId));

    if (target) {
      const targetElement = document.getElementById(`attendance-row-${target.id}`);
      if (targetElement) {
        targetElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }

      setHighlightedAttendanceId(target.id);
      setTimeout(() => setHighlightedAttendanceId(null), 2500);
      setPendingAttendanceFocus(null);
      return;
    }

    if (!pendingAttendanceFocus.expanded && attendanceFilter !== 'all') {
      setPendingAttendanceFocus({ ...pendingAttendanceFocus, expanded: true });
      setAttendanceFilter('all');
      return;
    }

    setPendingAttendanceFocus(null);
  }, [pendingAttendanceFocus, attendanceRows, attendanceFilter]);

  const fetchEmployeeCorrectionNotifications = async () => {
    try {
      const { data } = await apiClient.get('/notifications/employee-corrections');
      const notifications = data?.notifications || [];
      setEmployeeNotifications(notifications);
      setEmployeeNotificationCount(data?.unreadCount ?? notifications.length);
    } catch (error) {
      console.error('Failed to fetch employee notifications:', error);
      setEmployeeNotifications([]);
      setEmployeeNotificationCount(0);
    }
  };

  const markEmployeeNotificationViewed = async (notification) => {
    if (!notification?.issueId) {
      return;
    }

    try {
      await apiClient.put(`/notifications/employee-corrections/${notification.issueId}/viewed`);
    } catch (error) {
      console.error('Failed to mark employee notification as viewed:', error);
    }

    setEmployeeNotifications((prev) => prev.filter((item) => item.issueId !== notification.issueId));
    setEmployeeNotificationCount((prev) => Math.max(0, prev - 1));
    setPendingAttendanceFocus({
      attendanceId: notification.attendanceId,
      attendanceDate: notification.attendanceDate,
      expanded: false
    });
    setIsEmployeeNotificationOpen(false);
    fetchAttendanceRecords();
  };

  const fetchDashboardStats = async () => {
    try {
      const { data } = await apiClient.get('/dashboard/stats');
      setStats(data?.stats || null);
    } catch (error) {
      console.error('Failed to fetch dashboard stats:', error);
    }
  };

  const formatDate = (value) => {
    return formatDateUtil(value);
  };

  const formatDateTime = (value) => {
    return formatDateTimeUtil(value);
  };

  const getRange = (filter) => {
    if (filter === 'all') return { startDate: '', endDate: '' };
    const endDate = new Date();
    const startDate = new Date();
    if (filter === 'month') {
      startDate.setDate(endDate.getDate() - 30);
    } else if (filter === 'day') {
      startDate.setDate(endDate.getDate() - 1);
    } else {
      startDate.setDate(endDate.getDate() - 7);
    }
    return {
      startDate: formatDate(startDate),
      endDate: formatDate(endDate)
    };
  };

  const getFilterLabel = (filter) => {
    if (filter === 'all') return 'All Records';
    if (filter === 'day') return 'Last Day';
    if (filter === 'month') return 'Last Month';
    return 'Last Week';
  };

  const handleAttendanceFilterSelect = (filter) => {
    setAttendanceFilter(filter);
    setIsAttendanceFilterOpen(false);
  };

  const handleSalaryFilterSelect = (filter) => {
    setSalaryFilter(filter);
    setIsSalaryFilterOpen(false);
  };

  const fetchAttendanceRecords = async () => {
    setAttendanceLoading(true);
    try {
      const { startDate, endDate } = getRange(attendanceFilter);
      const params = new URLSearchParams();
      if (startDate) params.append('startDate', startDate);
      if (endDate) params.append('endDate', endDate);
      if (viewingEmployeeId) params.append('employeeId', viewingEmployeeId);

      const { data } = await apiClient.get(`/attendance/records?${params.toString()}`);
      const rows = (data?.records || []).map((record) => {
        // Use attendance_status from backend if available, otherwise fallback to check logic
        const status = record.attendance_status || (record.check_in && record.check_out
          ? 'Present'
          : record.check_in
            ? 'Incomplete'
            : 'Absent');

        // Determine the action button behavior based on correction status
        let action = 'Request Correction';
        let actionDisabled = false;
        let correctionInfo = null;

        if (record.correction_status) {
          if (record.correction_status === 'Pending') {
            action = 'Correction Pending';
            actionDisabled = true;
            correctionInfo = {
              type: 'pending',
              message: 'Your correction request is awaiting admin review'
            };
          } else if (record.correction_status === 'Approved') {
            action = 'Correction Approved';
            actionDisabled = true;
            correctionInfo = {
              type: 'approved',
              message: 'Your correction request was approved'
            };
          } else if (record.correction_status === 'Denied') {
            action = 'Correction Denied';
            actionDisabled = true;
            correctionInfo = {
              type: 'denied',
              message: `Denied: ${record.correction_notes || 'No reason provided'}`
            };
          } else if (record.correction_status === 'Viewed') {
            action = 'Correction Acknowledged';
            actionDisabled = true;
            correctionInfo = {
              type: 'viewed',
              message: 'Your correction acknowledgment was recorded'
            };
          }
        }

        const absenceNote = (record.issue_reason || '').trim();
        const correctionNote = (record.correction_details?.reason || '').trim();
        const deniedAdminNote = record.correction_status === 'Denied'
          ? (record.correction_notes || '').trim()
          : '';
        const noteEntries = [
          absenceNote ? { type: 'employee', text: `Absence: ${absenceNote}` } : null,
          correctionNote ? { type: 'employee', text: `Correction: ${correctionNote}` } : null,
          deniedAdminNote ? { type: 'admin', text: `Admin: ${deniedAdminNote}` } : null
        ].filter(Boolean);
        const notes = [
          absenceNote ? `Absence: ${absenceNote}` : '',
          correctionNote ? `Correction: ${correctionNote}` : '',
          deniedAdminNote ? `Admin: ${deniedAdminNote}` : ''
        ].filter(Boolean).join(' | ');

        return {
          id: record.id,
          date: record.date,
          checkIn: formatDateTime(record.check_in),
          checkOut: formatDateTime(record.check_out),
          status,
          reason: record.issue_reason,
          notes,
          noteEntries,
          action,
          actionDisabled,
          correctionInfo,
          correctionStatus: record.correction_status,
          correctionNotes: record.correction_notes
        };
      });
      setAttendanceRows(rows);
    } catch (error) {
      console.error('Failed to fetch attendance records:', error);
    } finally {
      setAttendanceLoading(false);
    }
  };

  const fetchSalaryRecords = async () => {
    setSalaryLoading(true);
    try {
      const { startDate, endDate } = getRange(salaryFilter);
      const params = new URLSearchParams();
      if (startDate) params.append('startDate', startDate);
      if (endDate) params.append('endDate', endDate);
      if (viewingEmployeeId) params.append('employeeId', viewingEmployeeId);

      const { data } = await apiClient.get(`/salary/records?${params.toString()}`);
      const rows = (data?.records || []).map((record) => {
        const periodStart = formatDate(record.period_start);
        const periodEnd = formatDate(record.period_end);
        const period = periodStart && periodEnd ? `${periodStart} - ${periodEnd}` : periodEnd || periodStart || '-';
        const actions = record.status === 'Released'
          ? ['Claim', 'View Receipt']
          : ['View Receipt'];

        return {
          id: record.id,
          period,
          salary: `₱ ${Number(record.amount || 0).toLocaleString('en-US')}`,
          status: record.status || 'Pending',
          releaseDate: record.released_at ? formatDate(record.released_at) : '-',
          actions
        };
      });
      setSalaryRows(rows);
    } catch (error) {
      console.error('Failed to fetch salary records:', error);
    } finally {
      setSalaryLoading(false);
    }
  };

  const handleNotifyAbsence = () => {
    setShowAbsenceModal(true);
  };

  const handleAbsenceSubmit = () => {
    if (!absenceDate) {
      alert('Please select a date');
      return;
    }
    setShowAbsenceModal(false);
    setShowAbsenceConfirm(true);
  };

  const confirmAbsenceNotice = () => {
    setShowAbsenceConfirm(false);
    submitAbsenceNotice();
  };

  const cancelAbsenceConfirm = () => {
    setShowAbsenceConfirm(false);
    setShowAbsenceModal(true);
  };

  const submitAbsenceNotice = async () => {
    // Validate proof file if provided
    if (absenceProofFile) {
      const maxSize = 5 * 1024 * 1024; // 5MB
      if (absenceProofFile.size > maxSize) {
        alert('Proof image must be less than 5MB');
        setAbsenceSubmitting(false);
        return;
      }
      
      const validTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'];
      if (!validTypes.includes(absenceProofFile.type)) {
        alert('Proof file must be an image (JPG, PNG, GIF, or WEBP)');
        setAbsenceSubmitting(false);
        return;
      }
    }

    setAbsenceSubmitting(true);
    try {
      // Create FormData for file upload
      const formData = new FormData();
      formData.append('employeeId', user?.employeeId || '');
      formData.append('date', absenceDate);
      formData.append('reason', absenceReason.trim());
      if (absenceProofFile) {
        formData.append('proofFile', absenceProofFile);
      }

      const token = localStorage.getItem('accessToken');
      const response = await fetch(`${process.env.REACT_APP_API_BASE_URL || 'http://localhost:4000'}/absence/notify`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`
        },
        body: formData
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData?.message || 'Failed to submit absence notification');
      }

      setShowAbsenceModal(false);
      setAbsenceReason('');
      setAbsenceProofFile(null);
      setAbsenceNotice('Absence notification sent successfully.');
      setTimeout(() => setAbsenceNotice(''), 3000);
      
      // Refresh attendance records to show the newly submitted absence
      fetchAttendanceRecords();
    } catch (error) {
      console.error('Absence notification error:', error);
      alert(error?.message || 'Failed to send absence notification');
    } finally {
      setAbsenceSubmitting(false);
    }
  };

  const handleAttendanceAction = async (row) => {
    setSelectedAttendance(row);
    // Pre-fill with current times if available
    const checkInMatch = row.checkIn?.match(/(\d{1,2}):(\d{2})\s*(AM|PM)/i);
    const checkOutMatch = row.checkOut?.match(/(\d{1,2}):(\d{2})\s*(AM|PM)/i);
    
    if (checkInMatch) {
      let hours = parseInt(checkInMatch[1]);
      const minutes = checkInMatch[2];
      const period = checkInMatch[3].toUpperCase();
      if (period === 'PM' && hours !== 12) hours += 12;
      if (period === 'AM' && hours === 12) hours = 0;
      setCorrectionCheckIn(`${String(hours).padStart(2, '0')}:${minutes}`);
    } else {
      setCorrectionCheckIn('');
    }
    
    if (checkOutMatch) {
      let hours = parseInt(checkOutMatch[1]);
      const minutes = checkOutMatch[2];
      const period = checkOutMatch[3].toUpperCase();
      if (period === 'PM' && hours !== 12) hours += 12;
      if (period === 'AM' && hours === 12) hours = 0;
      setCorrectionCheckOut(`${String(hours).padStart(2, '0')}:${minutes}`);
    } else {
      setCorrectionCheckOut('');
    }
    
    setCorrectionReason('');
    setCorrectionProofFile(null);
    setCorrectionModalOpen(true);
  };

  const closeCorrectionModal = () => {
    setCorrectionModalOpen(false);
    setCorrectionProofFile(null);
  };

  const submitCorrectionRequest = async () => {
    if (!selectedAttendance || (!correctionCheckIn && !correctionCheckOut)) {
      alert('Please provide at least one corrected time');
      return;
    }

    // Validate proof file if provided
    if (correctionProofFile) {
      const maxSize = 5 * 1024 * 1024; // 5MB
      if (correctionProofFile.size > maxSize) {
        alert('Proof image must be less than 5MB');
        return;
      }
      
      const validTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'];
      if (!validTypes.includes(correctionProofFile.type)) {
        alert('Proof file must be an image (JPG, PNG, GIF, or WEBP)');
        return;
      }
    }
    
    setCorrectionSubmitting(true);
    try {
      const formData = new FormData();
      formData.append('attendanceId', selectedAttendance.id);
      formData.append('requestedCheckIn', correctionCheckIn || '');
      formData.append('requestedCheckOut', correctionCheckOut || '');
      formData.append('reason', correctionReason.trim());
      if (correctionProofFile) {
        formData.append('proofFile', correctionProofFile);
      }

      const { data } = await apiClient.post('/attendance/correction-request', formData);
      
      if (data?.success) {
        closeCorrectionModal();
        setSelectedAttendance(null);
        setCorrectionCheckIn('');
        setCorrectionCheckOut('');
        setCorrectionReason('');
        setCorrectionProofFile(null);
        
        // Refresh attendance records to show updated status
        fetchAttendanceRecords();
        
        alert('Correction request submitted successfully. Awaiting manager approval.');
      } else {
        alert(data?.message || 'Failed to submit correction request');
      }
    } catch (error) {
      console.error('Correction request error:', error);
      alert(error?.response?.data?.message || 'Failed to submit correction request');
    } finally {
      setCorrectionSubmitting(false);
    }
  };

  const downloadReceipt = async (record) => {
    try {
      const response = await fetch(`${process.env.REACT_APP_API_BASE_URL || 'http://localhost:4000'}/salary/receipt/${record.id}`, {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('accessToken')}`
        }
      });

      if (!response.ok) {
        alert('Failed to download receipt');
        return;
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `salary_receipt_${user?.employeeId || 'employee'}.pdf`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (error) {
      console.error('Receipt download error:', error);
      alert('Failed to download receipt');
    }
  };

  const handleSalaryAction = async (actionLabel, row) => {
    if (actionLabel === 'Claim') {
      try {
        await apiClient.put(`/salary/claim/${row.id}`);
        await logAudit('SALARY_CLAIMED', {
          employeeId: user?.employeeId,
          recordId: row.id
        });
        await fetchSalaryRecords();
        alert('Salary claimed successfully.');
      } catch (error) {
        console.error('Claim error:', error);
        alert(error?.response?.data?.message || 'Failed to claim salary');
      }
      return;
    }

    if (actionLabel === 'View Receipt') {
      await downloadReceipt(row);
    }
  };

  const downloadSalary = (format) => {
    if (!salaryRows.length) {
      alert('No salary records to download.');
      return;
    }
    setSalaryExportOpen(false);

    const headers = ['Period', 'Salary', 'Status', 'Release Date'];
    const rows = salaryRows.map((row) => [row.period, row.salary, row.status, row.releaseDate]);
    const filename = `my_salary_${new Date().toISOString().split('T')[0]}`;

    if (format === 'csv') {
      const csvContent = [headers, ...rows].map((r) => r.join(',')).join('\n');
      const blob = new Blob([csvContent], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${filename}.csv`;
      link.click();
      URL.revokeObjectURL(url);
    } else if (format === 'xlsx') {
      const worksheet = [headers, ...rows];
      const csv = worksheet.map(row => row.join(',')).join('\n');
      const blob = new Blob([csv], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${filename}.xlsx`;
      link.click();
      URL.revokeObjectURL(url);
    } else if (format === 'pdf') {
      alert('PDF export will be implemented soon.');
    }
  };

  const downloadSalaryCsv = () => downloadSalary('csv');

  const downloadAttendance = (format) => {
    if (!attendanceRows.length) {
      alert('No attendance records to download.');
      return;
    }
    setAttendanceExportOpen(false);

    const headers = ['Date', 'Check-In', 'Check-Out', 'Status', 'Notes'];
    const rows = attendanceRows.map((row) => [row.date || '-', row.checkIn || '-', row.checkOut || '-', row.status, row.notes || '-']);
    const filename = `my_attendance_${new Date().toISOString().split('T')[0]}`;

    if (format === 'csv') {
      const csvContent = [headers, ...rows].map((r) => r.join(',')).join('\n');
      const blob = new Blob([csvContent], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${filename}.csv`;
      link.click();
      URL.revokeObjectURL(url);
    } else if (format === 'xlsx') {
      const worksheet = [headers, ...rows];
      const csv = worksheet.map(row => row.join(',')).join('\n');
      const blob = new Blob([csv], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${filename}.xlsx`;
      link.click();
      URL.revokeObjectURL(url);
    } else if (format === 'pdf') {
      alert('PDF export will be implemented soon.');
    }
  };

  const downloadAttendanceCsv = () => downloadAttendance('csv');

  const parseNameParts = (name) => {
    if (!name) return { firstName: '', middleName: '', lastName: '' };
    const parts = name.trim().split(/\s+/);
    if (parts.length === 1) return { firstName: parts[0], middleName: '', lastName: '' };
    if (parts.length === 2) return { firstName: parts[0], middleName: '', lastName: parts[1] };
    return { firstName: parts[0], middleName: parts.slice(1, -1).join(' '), lastName: parts[parts.length - 1] };
  };

  const fallbackNameParts = parseNameParts(user?.employeeName || profileData?.name);
  const profile = {
    firstName: profileData?.first_name || fallbackNameParts.firstName,
    middleName: profileData?.middle_name || fallbackNameParts.middleName,
    lastName: profileData?.last_name || fallbackNameParts.lastName,
    employeeId: profileData?.employee_id || user?.employeeId || '',
    email: profileData?.email || user?.email || '',
    contactNo: profileData?.contact_number || user?.contactNo || '',
    position: profileData?.position || user?.position || '',
    department: profileData?.department || user?.department || '',
    photo:
      user?.profileImage ||
      user?.profile_image_url ||
      profileData?.profile_image_url ||
      localStorage.getItem('userProfileImage') ||
      null
  };

  // Debug logging
  console.log('[EmployeeDashboard] Photo sources:', {
    userProfileImage: user?.profileImage,
    userProfileImageUrl: user?.profile_image_url,
    profileDataImageUrl: profileData?.profile_image_url,
    localStorage: localStorage.getItem('userProfileImage'),
    finalPhoto: profile.photo
  });

  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=400x400&data=${encodeURIComponent(
    profile.employeeId
  )}`;

  const handleEnlargeQr = () => {
    setQrModalOpen(true);
  };

  const downloadQr = async () => {
    try {
      const response = await fetch(qrUrl);
      const blob = await response.blob();
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = `employee_${profile.employeeId || 'qr'}.png`;
      document.body.appendChild(link);
      link.click();
      URL.revokeObjectURL(link.href);
      document.body.removeChild(link);
    } catch (error) {
      console.error('QR download error:', error);
      alert('Failed to download QR code. Please try again.');
    }
  };


  const getActionTone = (label, status) => {
    if (label === 'View Receipt') return 'green';
    if (label === 'Claim' && status === 'Claimed') return 'muted';
    return 'warn';
  };

  return (
    <>
    <div className="employee-container">
      <header className="employee-header">
        <div className="brand-block">
          <img src={NexusLogo} alt="Nexus Logo" className="brand-logo" />
          <span className="brand-text">Gracewell NEXUS</span>
        </div>
        <div className="header-actions">
          <div className="employee-notification-wrapper">
            <button
              className="employee-notification-bell"
              onClick={() => setIsEmployeeNotificationOpen(!isEmployeeNotificationOpen)}
              title="Approved correction notifications"
            >
              🔔
              {employeeNotificationCount > 0 && (
                <span className="employee-notification-badge">{employeeNotificationCount}</span>
              )}
            </button>
            {isEmployeeNotificationOpen && (
              <div className="employee-notification-dropdown">
                <div className="employee-notification-title">Approved Corrections</div>
                <div className="employee-notification-list">
                  {employeeNotifications.length === 0 ? (
                    <div className="employee-notification-empty">No new approvals</div>
                  ) : (
                    employeeNotifications.map((notification) => (
                      <button
                        key={notification.issueId}
                        type="button"
                        className="employee-notification-item"
                        onClick={() => markEmployeeNotificationViewed(notification)}
                      >
                        <span className="employee-notification-item-title">{notification.message}</span>
                        <span className="employee-notification-item-meta">
                          Date: {notification.attendanceDate || '-'}
                        </span>
                        {notification.submittedNote && (
                          <span className="employee-notification-item-note">Note: {notification.submittedNote}</span>
                        )}
                      </button>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>
          <button className="header-dashboard-btn" onClick={() => {
            if (location.pathname === '/employee') {
              window.location.reload();
            } else {
              navigate('/employee');
            }
          }}>
            Dashboard
          </button>
          <button className="header-logout" onClick={onLogout}>
            ↩ Log Out
          </button>
        </div>
      </header>

      <div className="employee-shell">
        <div className="welcome-row">
          <h2 className="welcome-title">Welcome, {profile.firstName}!</h2>
        </div>

        <div className="profile-card">
          <div className="profile-card-top">
            <span className="profile-chip">Employee Profile</span>
          </div>
          <div className="profile-grid">
            <div className="profile-photo-frame">
              {profile.photo && profile.photo.trim() !== '' ? (
                <img 
                  src={profile.photo} 
                  alt="Employee"
                />
              ) : (
                <div className="profile-photo-placeholder">
                  <div className="placeholder-initials">
                    {profile.firstName?.[0] || ''}{profile.lastName?.[0] || ''}
                  </div>
                </div>
              )}
            </div>

            <div className="profile-fields">
              <div className="field-row"><span className="field-label">First Name:</span><span className="field-value">{profile.firstName}</span></div>
              <div className="field-row"><span className="field-label">Middle Name:</span><span className="field-value">{profile.middleName}</span></div>
              <div className="field-row"><span className="field-label">Last Name:</span><span className="field-value">{profile.lastName}</span></div>
              <div className="field-row"><span className="field-label">Employee ID:</span><span className="field-value">{profile.employeeId}</span></div>
              <div className="field-row"><span className="field-label">Email:</span><span className="field-value">{profile.email}</span></div>
              <div className="field-row"><span className="field-label">Contact No:</span><span className="field-value">{profile.contactNo}</span></div>
              <div className="field-row"><span className="field-label">Position:</span><span className="field-value">{profile.position}</span></div>
              <div className="field-row"><span className="field-label">Department:</span><span className="field-value">{profile.department}</span></div>
            </div>

            <div className="profile-qr">
              <div className="qr-meta">
                <div className="qr-id">Employee ID: <strong>{profile.employeeId}</strong></div>
                <div className="qr-note">Scan the QR code for quick identification</div>
              </div>
              <div className="qr-box">
                <img
                  src={`https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(
                    profile.employeeId
                  )}`}
                  alt="Employee QR"
                />
              </div>
              <button className="btn-enlarge" onClick={handleEnlargeQr}>↗ Click to Enlarge</button>
            </div>
          </div>
          <div className="profile-card-footer">
            <button className="btn-edit-profile" onClick={() => navigate('/profile')}>Edit Profile</button>
          </div>
        </div>

        {qrModalOpen && (
          <div className="modal-overlay" onClick={() => setQrModalOpen(false)}>
            <div className="qr-modal-content" onClick={(event) => event.stopPropagation()}>
              <div className="modal-header">
                <h2>Employee QR Code</h2>
                <button className="close-btn" onClick={() => setQrModalOpen(false)}>×</button>
              </div>
              <div className="qr-modal-body">
                <div className="qr-employee-id">
                  <span className="qr-id-label">Employee ID:</span> <span className="qr-id-value">{profile.employeeId}</span>
                </div>
                <div className="qr-code-container">
                  <img 
                    src={qrUrl}
                    alt="Employee QR" 
                    className="qr-code-large"
                  />
                </div>
              </div>
              <div className="qr-modal-footer">
                <button className="btn-download-qr" onClick={downloadQr}>
                  Download QR
                </button>
              </div>
            </div>
          </div>
        )}

        <div className="unified-reports-card bg-white rounded-2xl shadow-xl">
          {/* Section 1: Attendance Report (Upper) */}
          <div className="report-section">
            <div className="report-section-header">
              <h3 className="report-section-title">My Attendance Report</h3>
              <div className="report-section-actions">
                <div className="dropdown-wrapper">
                  <button 
                    className="pill-btn soft" 
                    onClick={() => setIsAttendanceFilterOpen(!isAttendanceFilterOpen)}
                  >
                    {getFilterLabel(attendanceFilter)} <span className="caret">▾</span>
                  </button>
                  {isAttendanceFilterOpen && (
                    <div className="dropdown-menu">
                      <button 
                        className="dropdown-item" 
                        onClick={() => handleAttendanceFilterSelect('day')}
                      >
                        Last Day
                      </button>
                      <button 
                        className="dropdown-item" 
                        onClick={() => handleAttendanceFilterSelect('week')}
                      >
                        Last Week
                      </button>
                      <button 
                        className="dropdown-item" 
                        onClick={() => handleAttendanceFilterSelect('month')}
                      >
                        Last Month
                      </button>
                      <button
                        className="dropdown-item"
                        onClick={() => handleAttendanceFilterSelect('all')}
                      >
                        All Records
                      </button>
                    </div>
                  )}
                </div>
                <button className="btn-notify-absence" onClick={handleNotifyAbsence}>
                  Notify Absence
                </button>
                <div className="export-dropdown-wrapper">
                  <button className="btn-export" onClick={() => setAttendanceExportOpen(!attendanceExportOpen)}>Export</button>
                  {attendanceExportOpen && (
                    <div className="export-dropdown-menu">
                      <button onClick={() => downloadAttendance('pdf')}>Export as .pdf</button>
                      <button onClick={() => downloadAttendance('xlsx')}>Export as .xlsx</button>
                      <button onClick={() => downloadAttendance('csv')}>Export as .csv</button>
                    </div>
                  )}
                </div>
              </div>
            </div>
            {absenceNotice && <div className="inline-notice">{absenceNotice}</div>}
            <div className="table-wrap">
              <table className="plain-table table-fixed">
                <thead>
                  <tr>
                    <th className="w-[15%]">Date</th>
                    <th className="w-[20%]">Check-In</th>
                    <th className="w-[20%]">Check-Out</th>
                    <th className="w-[12%]">Status</th>
                    <th className="w-[18%]">Notes</th>
                    <th className="w-[15%] text-right">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {attendanceLoading && (
                    <tr>
                      <td colSpan="6">Loading attendance records...</td>
                    </tr>
                  )}
                  {!attendanceLoading && attendanceRows.length === 0 && (
                    <tr>
                      <td colSpan="6">No attendance records found.</td>
                    </tr>
                  )}
                  {!attendanceLoading && attendanceRows.map((row) => {
                    const getBadgeClass = (status) => {
                      if (status === 'Present') return 'badge success';
                      if (status === 'Notified Absence') return 'badge warning';
                      if (status === 'Absent') return 'badge error';
                      if (status === 'Incomplete') return 'badge info';
                      return 'badge';
                    };

                    const getCorrectionButtonClass = (correctionStatus) => {
                      if (correctionStatus === 'Pending') return 'btn-request-correction correction-pending';
                      if (correctionStatus === 'Approved') return 'btn-request-correction correction-approved';
                      if (correctionStatus === 'Denied') return 'btn-request-correction correction-denied';
                      if (correctionStatus === 'Viewed') return 'btn-request-correction correction-viewed';
                      return 'btn-request-correction';
                    };

                    return (
                      <tr
                        key={row.id}
                        id={`attendance-row-${row.id}`}
                        className={highlightedAttendanceId === row.id ? 'attendance-row-highlight' : ''}
                      >
                        <td className="w-[15%]">{row.date || '-'}</td>
                        <td className="w-[20%]">{row.checkIn || '-'}</td>
                        <td className="w-[20%]">{row.checkOut || '-'}</td>
                        <td className="w-[12%]">
                          <span className={getBadgeClass(row.status)} title={row.reason || ''}>
                            {row.status}
                          </span>
                        </td>
                        <td className="w-[18%] notes-cell" title={row.notes || ''}>
                          {row.noteEntries?.length ? (
                            row.noteEntries.map((entry, index) => (
                              <span
                                key={`${row.id}-note-${index}`}
                                className={entry.type === 'admin' ? 'note-admin-text-employee' : 'note-employee-text'}
                              >
                                {entry.text}
                              </span>
                            ))
                          ) : (
                            '-'
                          )}
                        </td>
                        <td className="w-[15%] text-right">
                          <div className="action-cell">
                            <button 
                              className={getCorrectionButtonClass(row.correctionStatus)}
                              onClick={() => !row.actionDisabled && handleAttendanceAction(row)}
                              disabled={row.actionDisabled}
                              title={row.correctionInfo ? row.correctionInfo.message : ''}
                            >
                              {row.action}
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Divider */}
          <div className="section-divider"></div>

          {/* Section 2: Salary Report (Lower) */}
          <div className="report-section">
            <div className="report-section-header">
              <h3 className="report-section-title">My Salary Report</h3>
              <div className="report-section-actions">
                <div className="dropdown-wrapper">
                  <button 
                    className="pill-btn soft" 
                    onClick={() => setIsSalaryFilterOpen(!isSalaryFilterOpen)}
                  >
                    {getFilterLabel(salaryFilter)} <span className="caret">▾</span>
                  </button>
                  {isSalaryFilterOpen && (
                    <div className="dropdown-menu">
                      <button 
                        className="dropdown-item" 
                        onClick={() => handleSalaryFilterSelect('day')}
                      >
                        Last Day
                      </button>
                      <button 
                        className="dropdown-item" 
                        onClick={() => handleSalaryFilterSelect('week')}
                      >
                        Last Week
                      </button>
                      <button 
                        className="dropdown-item" 
                        onClick={() => handleSalaryFilterSelect('month')}
                      >
                        Last Month
                      </button>
                    </div>
                  )}
                </div>
                <div className="export-dropdown-wrapper">
                  <button className="btn-export" onClick={() => setSalaryExportOpen(!salaryExportOpen)}>Export</button>
                  {salaryExportOpen && (
                    <div className="export-dropdown-menu">
                      <button onClick={() => downloadSalary('pdf')}>Export as .pdf</button>
                      <button onClick={() => downloadSalary('xlsx')}>Export as .xlsx</button>
                      <button onClick={() => downloadSalary('csv')}>Export as .csv</button>
                    </div>
                  )}
                </div>
              </div>
            </div>
            <div className="table-wrap">
              <table className="plain-table table-fixed">
                <thead>
                  <tr>
                    <th className="w-[35%]">Period</th>
                    <th className="w-[20%]">Salary</th>
                    <th className="w-[15%]">Status</th>
                    <th className="w-[15%]">Release Date</th>
                    <th className="w-[15%] text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {salaryLoading && (
                    <tr>
                      <td colSpan="5">Loading salary records...</td>
                    </tr>
                  )}
                  {!salaryLoading && salaryRows.length === 0 && (
                    <tr>
                      <td colSpan="5">No salary records found.</td>
                    </tr>
                  )}
                  {!salaryLoading && salaryRows.map((row) => (
                    <tr key={row.id}>
                      <td className="w-[35%]">{row.period}</td>
                      <td className="w-[20%]">{row.salary}</td>
                      <td className="w-[15%]"><span className={`badge ${row.status.toLowerCase()}`}>{row.status}</span></td>
                      <td className="w-[15%]">{row.releaseDate}</td>
                      <td className="w-[15%] text-right">
                        <div className="table-actions">
                          {row.actions.map((actionLabel) => (
                            <button
                              key={actionLabel}
                              className={`pill-action ${getActionTone(actionLabel, row.status)}`}
                              onClick={() => handleSalaryAction(actionLabel, row)}
                              disabled={actionLabel === 'Claim' && row.status !== 'Released'}
                            >
                              {actionLabel}
                            </button>
                          ))}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
    {showAbsenceModal && (
      <div className="modal-overlay" onClick={() => setShowAbsenceModal(false)}>
        <div className="modal-content" onClick={(e) => e.stopPropagation()}>
          <div className="modal-header">
            <h2>Notify Absence</h2>
            <button className="close-btn" onClick={() => setShowAbsenceModal(false)}>×</button>
          </div>
          <div className="modal-body">
            <p className="modal-description">
              Please confirm your absence details before sending.
            </p>
            <div className="form-group">
              <label>Date</label>
              <input
                type="date"
                className="form-input"
                value={absenceDate}
                onChange={(e) => setAbsenceDate(e.target.value)}
                min={(() => {
                  const tomorrow = new Date();
                  tomorrow.setDate(tomorrow.getDate() + 1);
                  return tomorrow.toISOString().split('T')[0];
                })()}
              />
            </div>
            <div className="form-group">
              <label>Reason (optional)</label>
              <textarea
                className="form-input textarea"
                rows="4"
                placeholder="Add a short note..."
                value={absenceReason}
                onChange={(e) => setAbsenceReason(e.target.value)}
              />
            </div>
            <div className="form-group">
              <label>Proof Attachment (optional)</label>
              <div className="file-upload-wrapper">
                <input
                  type="file"
                  id="proofFileInput"
                  className="file-input"
                  accept="image/*,.pdf"
                  onChange={(e) => setAbsenceProofFile(e.target.files?.[0] || null)}
                />
                <label htmlFor="proofFileInput" className="file-upload-label">
                  <span className="upload-icon">📎</span>
                  {absenceProofFile ? absenceProofFile.name : 'Choose file (Image or PDF)'}
                </label>
                {absenceProofFile && (
                  <button
                    type="button"
                    className="file-clear-btn"
                    onClick={() => setAbsenceProofFile(null)}
                    title="Remove file"
                  >
                    ✕
                  </button>
                )}
              </div>
              <small className="file-hint">Supported: JPG, PNG, PDF (Max 5MB)</small>
            </div>
          </div>
          <div className="modal-footer">
            <button className="btn-cancel" onClick={() => setShowAbsenceModal(false)}>Cancel</button>
            <button className="btn-submit" onClick={handleAbsenceSubmit} disabled={!absenceDate}>
              Continue
            </button>
          </div>
        </div>
      </div>
    )}
    {showAbsenceConfirm && (
      <div className="modal-overlay" onClick={() => setShowAbsenceConfirm(false)}>
        <div className="modal-content confirm-modal" onClick={(e) => e.stopPropagation()}>
          <div className="modal-header">
            <h2>⚠️ Confirm Absence Notification</h2>
            <button className="close-btn" onClick={() => setShowAbsenceConfirm(false)}>×</button>
          </div>
          <div className="modal-body">
            <p className="confirm-description">
              Please confirm that you will be absent on:
            </p>
            <div className="confirm-details">
              <div className="confirm-item">
                <strong>Date:</strong> {new Date(absenceDate).toLocaleDateString('en-US', { 
                  weekday: 'long', 
                  year: 'numeric', 
                  month: 'long', 
                  day: 'numeric' 
                })}
              </div>
              {absenceReason && (
                <div className="confirm-item">
                  <strong>Reason:</strong> {absenceReason}
                </div>
              )}
              {absenceProofFile && (
                <div className="confirm-item">
                  <strong>Attachment:</strong> {absenceProofFile.name}
                </div>
              )}
            </div>
            <p className="confirm-warning">
              This notification will be sent to your manager and recorded in the system.
            </p>
          </div>
          <div className="modal-footer">
            <button className="btn-cancel" onClick={cancelAbsenceConfirm}>Go Back</button>
            <button className="btn-submit" onClick={confirmAbsenceNotice} disabled={absenceSubmitting}>
              {absenceSubmitting ? 'Sending...' : 'Confirm & Send'}
            </button>
          </div>
        </div>
      </div>
    )}
    {correctionModalOpen && (
      <div className="modal-overlay" onClick={closeCorrectionModal}>
        <div className="modal-content" onClick={(e) => e.stopPropagation()}>
          <div className="modal-header">
            <h2>Request Time Correction</h2>
            <button className="close-btn" onClick={closeCorrectionModal}>×</button>
          </div>
          <div className="modal-body">
            <p className="modal-description">
              Request a correction for your attendance times. Your manager will review and approve/deny this request.
            </p>
            <div className="form-group">
              <label>Current Check-In: <strong>{selectedAttendance?.checkIn || 'N/A'}</strong></label>
            </div>
            <div className="form-group">
              <label>Corrected Check-In Time</label>
              <input
                type="time"
                className="form-input"
                value={correctionCheckIn}
                onChange={(e) => setCorrectionCheckIn(e.target.value)}
              />
            </div>
            <div className="form-group">
              <label>Current Check-Out: <strong>{selectedAttendance?.checkOut || 'N/A'}</strong></label>
            </div>
            <div className="form-group">
              <label>Corrected Check-Out Time</label>
              <input
                type="time"
                className="form-input"
                value={correctionCheckOut}
                onChange={(e) => setCorrectionCheckOut(e.target.value)}
              />
            </div>
            <div className="form-group">
              <label>Reason for Correction <span style={{color: '#f56565'}}>*</span></label>
              <textarea
                className="form-input textarea"
                rows="3"
                placeholder="Explain why this correction is needed..."
                value={correctionReason}
                onChange={(e) => setCorrectionReason(e.target.value)}
                required
              />
            </div>
            <div className="form-group">
              <label>Proof Image (optional)</label>
              <div className="file-upload-wrapper">
                <input
                  type="file"
                  id="correctionProofInput"
                  className="file-input"
                  accept="image/*"
                  onChange={(e) => setCorrectionProofFile(e.target.files?.[0] || null)}
                />
                <label htmlFor="correctionProofInput" className="file-upload-label">
                  <span className="upload-icon">📎</span>
                  {correctionProofFile ? correctionProofFile.name : 'Choose image'}
                </label>
                {correctionProofFile && (
                  <button
                    type="button"
                    className="file-clear-btn"
                    onClick={() => setCorrectionProofFile(null)}
                    title="Remove file"
                  >
                    ✕
                  </button>
                )}
              </div>
              <small className="file-hint">Supported: JPG, PNG (Max 5MB)</small>
            </div>
          </div>
          <div className="modal-footer">
            <button className="btn-cancel" onClick={closeCorrectionModal}>Cancel</button>
            <button 
              className="btn-submit" 
              onClick={submitCorrectionRequest} 
              disabled={correctionSubmitting || !correctionReason.trim()}
            >
              {correctionSubmitting ? 'Submitting...' : 'Submit Request'}
            </button>
          </div>
        </div>
      </div>
    )}
    </>
  );
};

export default EmployeeDashboard;