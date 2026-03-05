import React, { useMemo, useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import Navbar from '../components/Navbar';
import './AttendanceManagement.css';
import { apiClient } from '../utils/authService';
import { formatTime } from '../utils/timezoneUtils';

const AttendanceManagement = ({ user, onLogout }) => {
  const [searchParams, setSearchParams] = useSearchParams();
  const [records, setRecords] = useState([]);
  const [correctionRequests, setCorrectionRequests] = useState([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState(searchParams.get('status') || 'all');
  const [department, setDepartment] = useState('all');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [selectedRecord, setSelectedRecord] = useState(null);
  const [editCheckIn, setEditCheckIn] = useState('');
  const [editCheckOut, setEditCheckOut] = useState('');
  const [exportDropdownOpen, setExportDropdownOpen] = useState(false);
  const [openDropdownId, setOpenDropdownId] = useState(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(5);
  const [correctionModalOpen, setCorrectionModalOpen] = useState(false);
  const [correctionModalData, setCorrectionModalData] = useState(null);
  const [correctionActionPending, setCorrectionActionPending] = useState(null); // 'Approved' or 'Denied'
  const [denialReason, setDenialReason] = useState('');
  const [proofModalOpen, setProofModalOpen] = useState(false);
  const [proofModalUrl, setProofModalUrl] = useState(null);
  const [proofModalIssueId, setProofModalIssueId] = useState(null);
  const [proofModalLoading, setProofModalLoading] = useState(false);
  const [proofModalError, setProofModalError] = useState('');
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [recordToDelete, setRecordToDelete] = useState(null);

  // Initialize status filter from URL
  useEffect(() => {
    const urlStatus = searchParams.get('status');
    if (urlStatus && ['present', 'absent', 'pending'].includes(urlStatus.toLowerCase())) {
      setStatusFilter(urlStatus.toLowerCase());
    }
  }, [searchParams]);

  // Apply attendanceId from URL to search for quick navigation
  useEffect(() => {
    const attendanceId = searchParams.get('attendanceId');
    if (attendanceId) {
      setSearch(attendanceId);
    }
  }, [searchParams]);

  // Set default date range on page load
  useEffect(() => {
    if (!startDate && !endDate) {
      const today = new Date();
      const thirtyDaysAgo = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000);
      const thirtyDaysAhead = new Date(today.getTime() + 30 * 24 * 60 * 60 * 1000);
      setStartDate(thirtyDaysAgo.toISOString().split('T')[0]);
      setEndDate(thirtyDaysAhead.toISOString().split('T')[0]);
    }
  }, []);

  // Fetch attendance records and correction requests from backend
  useEffect(() => {
    if (startDate && endDate) {
      fetchAttendanceRecords();
    }
  }, [department, startDate, endDate]);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (!event.target.closest('.action-manage-wrapper')) {
        setOpenDropdownId(null);
      }
      // Close export dropdown when clicking outside
      if (!event.target.closest('.export-dropdown-wrapper')) {
        setExportDropdownOpen(false);
      }
    };
    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, []);

  const fetchAttendanceRecords = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (department && department !== 'all') params.append('department', department);
      if (startDate) params.append('startDate', startDate);
      if (endDate) params.append('endDate', endDate);

      const [attendanceResponse, correctionResponse] = await Promise.all([
        apiClient.get(`/attendance/records?${params.toString()}`),
        apiClient.get('/attendance/correction-requests?status=Pending')
      ]);
      
      const attendanceData = attendanceResponse.data;
      const correctionData = correctionResponse.data;
      const corrections = correctionData?.requests || [];
      
      setCorrectionRequests(corrections);
      
      // Transform backend data to frontend format
      const transformed = (attendanceData.records || []).map(r => {
        // Find if there's a pending correction request for this attendance record
        const pendingCorrection = corrections.find(req => req.attendanceId === r.id && req.status === 'Pending');
        const correctionDetails = pendingCorrection || r.correction_details || null;
        const correctionStatus = r.correction_status || (pendingCorrection ? 'Pending' : 'N/A');
        const correctionStatusLabel = correctionStatus === 'Approved'
          ? 'Correction Approved'
          : correctionStatus === 'Pending'
            ? 'Correction Pending'
            : correctionStatus === 'Denied'
              ? 'Correction Denied'
              : correctionStatus;
        
        // Get proof URL and path from multiple sources (prefer pending correction data)
        const issueProofUrl = pendingCorrection?.proofUrl || 
                              correctionDetails?.proofUrl || 
                              r.correction_proof_url || 
                              r.issue_proof_url || 
                              null;
        const issueProofPath = pendingCorrection?.proofPath || 
                               correctionDetails?.proofPath || 
                               r.correction_proof_path || 
                               null;
        const issueProofBucket = pendingCorrection?.proofBucket || 
                                 correctionDetails?.proofBucket || 
                                 r.correction_proof_bucket || 
                                 null;

        const correctedTimeParts = [];
        if (correctionStatus === 'Approved' && correctionDetails) {
          if (correctionDetails.requestedCheckIn) {
            correctedTimeParts.push(`In: ${correctionDetails.requestedCheckIn}`);
          }
          if (correctionDetails.requestedCheckOut) {
            correctedTimeParts.push(`Out: ${correctionDetails.requestedCheckOut}`);
          }
        }
        
        return {
          id: r.id,
          employeeId: r.employee_id,
          name: r.name,
          department: r.department || 'N/A',
          date: r.date,
          checkIn: r.check_in ? formatTime(r.check_in) : '-',
          checkOut: r.check_out ? formatTime(r.check_out) : '-',
          status: r.attendance_status || (r.check_in ? 'Present' : 'Absent'),
          approvalStatus: r.approval_status || 'Pending',
          correctedTime: correctedTimeParts.length > 0 ? correctedTimeParts.join(' | ') : '-',
          correctionStatus,
          correctionStatusLabel,
          correctionIssueId: pendingCorrection?.issueId || r.correction_issue_id || null,
          correctionDetails,
          correctionNotes: r.correction_notes || '',
          issueStatus: r.issue_status || 'N/A',
          issueType: r.issue_type,
          issueReason: r.issue_reason || '',
          issueProofUrl,
          issueProofPath,
          issueProofBucket,
          issueNote: r.issue_reason || ''
        };
      });
      
      setRecords(transformed);
    } catch (error) {
      console.error('Failed to fetch attendance:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchCorrectionRequests = async () => {
    try {
      const { data } = await apiClient.get('/attendance/correction-requests?status=Pending');
      setCorrectionRequests(data?.requests || []);
    } catch (error) {
      console.error('Failed to fetch correction requests:', error);
    }
  };

  const totals = useMemo(() => {
    const totalEmployees = records.length;
    const present = records.filter((r) => r.status === 'Present').length;
    const absent = records.filter((r) => r.status === 'Absent').length;
    const pending = records.filter((r) => r.correctionStatus === 'Pending').length;
    return { totalEmployees, present, absent, pending };
  }, [records]);

  const filteredRecords = useMemo(() => {
    return records.filter((rec) => {
      const term = search.toLowerCase();
      const inSearch = !term ||
        rec.name.toLowerCase().includes(term) ||
        rec.department.toLowerCase().includes(term) ||
        rec.status.toLowerCase().includes(term) ||
        String(rec.id).toLowerCase().includes(term);

      const deptOk = department === 'all' || rec.department === department;
      
      // Handle different status filters
      let statusOk = true;
      if (statusFilter === 'all') {
        statusOk = true;
      } else if (statusFilter === 'pending') {
        // Show only records with pending corrections
        statusOk = rec.correctionStatus === 'Pending';
      } else {
        // Show records with matching attendance status (Present, Absent)
        statusOk = rec.status.toLowerCase() === statusFilter.toLowerCase();
      }

      const dateValue = rec.date ? new Date(rec.date) : null;
      const startOk = startDate && dateValue ? dateValue >= new Date(startDate) : true;
      const endOk = endDate && dateValue ? dateValue <= new Date(endDate) : true;

      return inSearch && deptOk && statusOk && startOk && endOk;
    });
  }, [records, search, department, statusFilter, startDate, endDate]);

  const totalPages = Math.ceil(filteredRecords.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const paginatedRecords = filteredRecords.slice(startIndex, endIndex);

  useEffect(() => {
    setCurrentPage(1);
  }, [search, department, statusFilter, startDate, endDate]);

  useEffect(() => {
    if (totalPages === 0 && currentPage !== 1) {
      setCurrentPage(1);
      return;
    }
    if (totalPages > 0 && currentPage > totalPages) {
      setCurrentPage(totalPages);
    }
  }, [currentPage, totalPages]);

  const openEditModal = (rec) => {
    setSelectedRecord(rec);
    setEditCheckIn(rec.checkIn === '-' ? '' : rec.checkIn);
    setEditCheckOut(rec.checkOut === '-' ? '' : rec.checkOut);
    setEditModalOpen(true);
  };

  const saveEdits = async () => {
    try {
      const { data } = await apiClient.put(`/attendance/records/${selectedRecord.id}`, {
        check_in: editCheckIn || selectedRecord.checkIn,
        check_out: editCheckOut || selectedRecord.checkOut
      });

      if (data?.success) {
        await fetchAttendanceRecords();
        setEditModalOpen(false);
        setSelectedRecord(null);
      } else {
        alert(data?.message || 'Failed to update attendance record');
      }
    } catch (error) {
      console.error('Update error:', error);
      alert(error?.response?.data?.message || 'Failed to update attendance record');
    }
  };

  const setCorrectionStatus = async (status, resolutionNotes) => {
    if (!correctionModalData) return;

    if (correctionModalData.correctionIssueId && correctionModalData.correctionStatus === 'Pending') {
      try {
        let notes = resolutionNotes || 'Approved by admin';
        
        if (status === 'Denied' && !notes.trim()) {
          alert('Reason required for denial');
          return;
        }

        setCorrectionActionPending(status);
        const { data } = await apiClient.put(`/attendance/correction-request/${correctionModalData.correctionIssueId}/approval`, { 
          status,
          resolutionNotes: notes
        });
        
        if (data?.success) {
          const message = status === 'Approved' 
            ? `Correction request approved. Requested correction is now shown under Corrected Time.`
            : `Correction request denied. Reason: ${notes}`;
          
          alert(message);
          
          // Close modal and refresh
          setCorrectionModalOpen(false);
          setCorrectionModalData(null);
          setCorrectionActionPending(null);
          setDenialReason('');
          
          // Refresh both attendance records and correction requests
          await fetchCorrectionRequests();
          await fetchAttendanceRecords();
        } else {
          alert(data?.message || 'Failed to process correction request');
          setCorrectionActionPending(null);
        }
      } catch (error) {
        console.error('Correction approval error:', error);
        alert(error?.response?.data?.message || 'Failed to process correction request');
        setCorrectionActionPending(null);
      }
    }
  };

  const openProofModalForIssue = async (issueId, fallbackUrl = null) => {
    if (!issueId && !fallbackUrl) {
      setProofModalError('No proof attachment found for this correction request.');
      return;
    }

    setProofModalOpen(true);
    setProofModalIssueId(issueId || null);
    setProofModalLoading(true);
    setProofModalError('');
    setProofModalUrl(null);

    try {
      if (issueId) {
        const { data } = await apiClient.get(`/attendance/correction-request/${issueId}/proof-url`);
        if (data?.url) {
          setProofModalUrl(data.url);
          if (data?.fallback) {
            setProofModalError(data?.message || 'Using fallback proof URL.');
          }
        } else {
          setProofModalError('Proof image URL is unavailable.');
        }
      } else if (fallbackUrl) {
        setProofModalUrl(fallbackUrl);
      }
    } catch (error) {
      setProofModalError(error?.response?.data?.message || 'Unable to fetch proof image.');
      if (fallbackUrl) {
        setProofModalUrl(fallbackUrl);
      }
    } finally {
      setProofModalLoading(false);
    }
  };

  const downloadProofForIssue = async (issueId) => {
    if (!issueId) {
      setProofModalError('Cannot download proof: missing correction request ID.');
      return;
    }

    try {
      const { data } = await apiClient.get(`/attendance/correction-request/${issueId}/proof-url?download=1`);
      if (!data?.url) {
        setProofModalError('Failed to generate proof download link.');
        return;
      }

      const link = document.createElement('a');
      link.href = data.url;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (error) {
      setProofModalError(error?.response?.data?.message || 'Unable to download proof image.');
    }
  };

  const openDeleteModal = (record) => {
    setRecordToDelete(record);
    setShowDeleteModal(true);
  };

  const closeDeleteModal = () => {
    setRecordToDelete(null);
    setShowDeleteModal(false);
  };

  const deleteAttendanceRecord = async () => {
    if (!recordToDelete) return;

    try {
      await apiClient.delete(`/attendance/records/${recordToDelete.id}`);
      
      // Log audit trail
      await apiClient.post('/audit-logs', {
        action: 'ATTENDANCE_RECORD_DELETED',
        module: 'attendance',
        notes: JSON.stringify({
          attendanceId: recordToDelete.id,
          employeeId: recordToDelete.employeeId,
          name: recordToDelete.name,
          date: recordToDelete.date,
          checkIn: recordToDelete.checkIn,
          checkOut: recordToDelete.checkOut
        })
      });

      alert('Attendance record deleted successfully');
      closeDeleteModal();
      
      // Refresh the attendance records to reflect the deletion
      fetchAttendanceRecords();
    } catch (error) {
      console.error('Delete error:', error);
      const errorMessage = error?.response?.data?.message || 'Failed to delete attendance record';
      alert(errorMessage);
    }
  };

  const setIssueStatus = (rec, status) => {
    const timestamp = new Date().toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
    const note = status === 'Resolved'
      ? `Resolved on ${timestamp}`
      : rec.issueNote || 'Flagged for review';

    setRecords((prev) => prev.map((r) => r.id === rec.id ? {
      ...r,
      issueStatus: status,
      issueNote: note
    } : r));
  };

  const exportReport = async (format) => {
    const formatLower = format.toLowerCase();
    
    if (!['pdf', 'xlsx', 'csv'].includes(formatLower)) {
      alert('Invalid export format');
      return;
    }

    try {
      const token = localStorage.getItem('accessToken');
      const response = await fetch(`${process.env.REACT_APP_API_BASE_URL || 'http://localhost:4000'}/reports/attendance`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          startDate: startDate || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
          endDate: endDate || new Date().toISOString().split('T')[0],
          format: formatLower
        })
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Export failed');
      }

      // Handle blob response
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `attendance_export_${new Date().toISOString().split('T')[0]}.${formatLower}`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);

      setExportDropdownOpen(false);
    } catch (error) {
      console.error('Export error:', error);
      alert(error?.message || 'Failed to export. Please try again.');
    }
  };

  const rangeLabel = () => {
    if (!startDate && !endDate) return 'Awaiting database date range';
    const start = startDate ? new Date(startDate).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }) : 'Start';
    const end = endDate ? new Date(endDate).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }) : 'End';
    return `${start} to ${end}`;
  };

  return (
    <div className="attendance-page">
      <Navbar user={user} onLogout={onLogout} />

      <div className="attendance-container">
        <div className="header-row">
          <div>
            <h1>Attendance Management</h1>
            <p className="subtitle">Track employee attendance and work hours</p>
          </div>
        </div>

        <div className="cards-row">
          <div className="summary-card">
            <div className="card-label">Total Employees</div>
            <div className="card-value">{totals.totalEmployees}</div>
            <div className="card-icon icon-blue">👥</div>
          </div>
          <div className="summary-card">
            <div className="card-label">Present</div>
            <div className="card-value green">{totals.present}</div>
            <div className="card-icon status-dot green"></div>
          </div>
          <div className="summary-card">
            <div className="card-label">Absent</div>
            <div className="card-value red">{totals.absent}</div>
            <div className="card-icon status-dot red"></div>
          </div>
          <div className="summary-card">
            <div className="card-label">Pending Corrections</div>
            <div className="card-value orange">{totals.pending}</div>
            <div className="card-icon status-dot orange"></div>
          </div>
        </div>

        <div className="filters-bar compact">
          <div className="range-label">Attendance Records - {rangeLabel()}</div>
          <div className="filter-controls" style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            <label style={{ fontWeight: 500, marginRight: 4 }}>From:</label>
            <input
              type="date"
              value={startDate}
              onChange={e => setStartDate(e.target.value)}
              style={{ padding: '6px 10px', borderRadius: 6, border: '1px solid #ccc' }}
              max={endDate || undefined}
            />
            <label style={{ fontWeight: 500, marginLeft: 8, marginRight: 4 }}>To:</label>
            <input
              type="date"
              value={endDate}
              onChange={e => setEndDate(e.target.value)}
              style={{ padding: '6px 10px', borderRadius: 6, border: '1px solid #ccc' }}
              min={startDate || undefined}
            />
            <select
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value);
                if (e.target.value === 'all') {
                  searchParams.delete('status');
                } else {
                  searchParams.set('status', e.target.value);
                }
                setSearchParams(searchParams);
              }}
              className="status-filter-dropdown"
              style={{ marginLeft: 16 }}
            >
              <option value="all">All Status</option>
              <option value="present">Present</option>
              <option value="absent">Absent</option>
              <option value="pending">Pending Corrections</option>
            </select>
          </div>
          <div className="search-actions">
            <div className="search-field">
              <input
                aria-label="Search attendance"
                type="text"
                placeholder="Search by name, department, or status..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              <button className="search-btn" aria-label="Search" type="button">
                <span>🔍</span>
              </button>
            </div>
            {(user?.userRole === 'admin' || user?.userRole === 'super_admin') && (
              <div className="export-dropdown-wrapper">
                <button className="export-btn" onClick={() => setExportDropdownOpen(!exportDropdownOpen)}>
                  Export
                </button>
                {exportDropdownOpen && (
                  <div className="export-dropdown-menu">
                    <button onClick={() => exportReport('PDF')}>Export as .pdf</button>
                    <button onClick={() => exportReport('XLSX')}>Export as .xlsx</button>
                    <button onClick={() => exportReport('CSV')}>Export as .csv</button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        <div className="table-wrapper">
          <table className="attendance-table">
            <thead>
              <tr>
                <th>Employee Name</th>
                <th>Department</th>
                <th>Check In</th>
                <th>Check Out</th>
                <th>Corrected Time</th>
                <th>Issue Status</th>
                <th>Resolution Notes</th>
                <th>Status</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr>
                  <td colSpan="9" className="empty-state">Loading attendance records...</td>
                </tr>
              )}
              {!loading && filteredRecords.length === 0 && (
                <tr>
                  <td colSpan="9" className="empty-state">No attendance records found. Adjust filters or check date range.</td>
                </tr>
              )}
              {!loading && paginatedRecords.map((record) => (
                <tr key={`${record.id}-${record.date}`} className={openDropdownId === record.id ? 'dropdown-active' : ''}>
                  <td>{record.name}</td>
                  <td>{record.department}</td>
                  <td>{record.checkIn}</td>
                  <td>{record.checkOut}</td>
                  <td>
                    {record.correctedTime !== '-' ? (
                      <div style={{ fontSize: '0.9em' }}>{record.correctedTime}</div>
                    ) : record.correctionDetails ? (
                      <div style={{ fontSize: '0.9em' }}>
                        {record.correctionDetails.requestedCheckIn && (
                          <div><strong>In:</strong> {record.correctionDetails.requestedCheckIn}</div>
                        )}
                        {record.correctionDetails.requestedCheckOut && (
                          <div><strong>Out:</strong> {record.correctionDetails.requestedCheckOut}</div>
                        )}
                      </div>
                    ) : '-'}
                  </td>
                  <td>
                    <span className={`issue-pill ${record.correctionStatus.toLowerCase()}`}>
                      {record.correctionStatusLabel || record.correctionStatus}
                    </span>
                  </td>
                  <td className="resolution-note">
                    <div className="note-content">
                      <span className="note-text">{record.correctionDetails?.reason || record.issueNote || 'No notes yet'}</span>
                      {record.correctionStatus === 'Denied' && record.correctionNotes && (
                        <span className="note-admin-text">Admin: {record.correctionNotes}</span>
                      )}
                      {(record.issueProofUrl || record.issueProofPath) && (
                        <button
                          className="view-proof-btn"
                          onClick={() => {
                            openProofModalForIssue(record.correctionIssueId, record.issueProofUrl);
                          }}
                          title="View attached proof"
                        >
                          📎 View Proof
                        </button>
                      )}
                    </div>
                  </td>
                  <td>
                    <span className={`status-pill ${record.status?.toLowerCase()}`}>
                      {record.status}
                    </span>
                  </td>
                  <td>
                    <div className="action-manage-wrapper">
                      <button
                        type="button"
                        className="table-split-btn"
                        onClick={() => setOpenDropdownId(openDropdownId === record.id ? null : record.id)}
                      >
                        <span className="table-split-btn__label">Manage</span>
                        <span className="table-split-btn__divider" />
                        <span className="table-split-btn__arrow">▾</span>
                      </button>
                      {openDropdownId === record.id && (
                        <div className="manage-dropdown">
                          {user?.userRole === 'super_admin' ? (
                            // Super Admin: Only Edit action
                            <button
                              className="dropdown-item edit-item"
                              onClick={() => {
                                openEditModal(record);
                                setOpenDropdownId(null);
                              }}
                            >
                              Edit
                            </button>
                          ) : user?.userRole === 'admin' ? (
                            // Admin: Full access
                            <>
                              {record.correctionStatus === 'Pending' && (
                                <>
                                  <button
                                    className="dropdown-item approve-item"
                                    onClick={() => {
                                      setCorrectionModalData(record);
                                      setCorrectionActionPending('Approved');
                                      setCorrectionModalOpen(true);
                                      setOpenDropdownId(null);
                                    }}
                                    title="Approve correction request"
                                  >
                                    Approve
                                  </button>
                                  <button
                                    className="dropdown-item deny-item"
                                    onClick={() => {
                                      setCorrectionModalData(record);
                                      setCorrectionActionPending('Denied');
                                      setCorrectionModalOpen(true);
                                      setOpenDropdownId(null);
                                    }}
                                    title="Deny correction request"
                                  >
                                    Deny
                                  </button>
                                </>
                              )}
                              <button
                                className="dropdown-item edit-item"
                                onClick={() => {
                                  openEditModal(record);
                                  setOpenDropdownId(null);
                                }}
                              >
                                Edit
                              </button>
                              <button
                                className="dropdown-item delete-item"
                                onClick={() => {
                                  openDeleteModal(record);
                                  setOpenDropdownId(null);
                                }}
                                title="Delete this attendance record"
                              >
                                Delete Record
                              </button>
                            </>
                          ) : (
                            // Manager or other roles: View only (no actions)
                            <div className="dropdown-no-actions">
                              No actions available
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {filteredRecords.length > 0 && (
          <div className="pagination-wrapper">
            <div className="pagination-info">
              Showing {startIndex + 1}-{Math.min(endIndex, filteredRecords.length)} of {filteredRecords.length} records
            </div>
            <div className="pagination-controls">
              <button
                className="pagination-btn"
                onClick={() => setCurrentPage(1)}
                disabled={currentPage === 1}
              >
                {'<<'}
              </button>
              <button
                className="pagination-btn"
                onClick={() => setCurrentPage(currentPage - 1)}
                disabled={currentPage === 1}
              >
                {'<'}
              </button>
              {Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => {
                if (
                  page === 1 ||
                  page === totalPages ||
                  (page >= currentPage - 1 && page <= currentPage + 1)
                ) {
                  return (
                    <button
                      key={page}
                      className={`pagination-btn ${currentPage === page ? 'active' : ''}`}
                      onClick={() => setCurrentPage(page)}
                    >
                      {page}
                    </button>
                  );
                }
                if (page === currentPage - 2 || page === currentPage + 2) {
                  return <span key={page} className="pagination-ellipsis">...</span>;
                }
                return null;
              })}
              <button
                className="pagination-btn"
                onClick={() => setCurrentPage(currentPage + 1)}
                disabled={currentPage === totalPages || totalPages === 0}
              >
                {'>'}
              </button>
              <button
                className="pagination-btn"
                onClick={() => setCurrentPage(totalPages)}
                disabled={currentPage === totalPages || totalPages === 0}
              >
                {'>>'}
              </button>
            </div>
            <div className="items-per-page">
              <label>Items per page:</label>
              <select
                value={itemsPerPage}
                onChange={(e) => {
                  setItemsPerPage(Number(e.target.value));
                  setCurrentPage(1);
                }}
              >
                <option value={5}>5</option>
                <option value={10}>10</option>
                <option value={20}>20</option>
                <option value={50}>50</option>
              </select>
            </div>
          </div>
        )}
      </div>

      {editModalOpen && (
        <div className="modal-overlay" onClick={() => setEditModalOpen(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Edit Time In/Out</h2>
              <button className="close-btn" onClick={() => setEditModalOpen(false)}>×</button>
            </div>
            <div className="modal-body">
              <div className="form-group">
                <label>Employee</label>
                <div className="readonly">{selectedRecord?.name}</div>
              </div>
              <div className="form-group">
                <label>Date</label>
                <div className="readonly">{selectedRecord?.date}</div>
              </div>
              <div className="form-group inline">
                <div>
                  <label>Time In</label>
                  <input type="text" value={editCheckIn} onChange={(e) => setEditCheckIn(e.target.value)} placeholder="08:00 AM" />
                </div>
                <div>
                  <label>Time Out</label>
                  <input type="text" value={editCheckOut} onChange={(e) => setEditCheckOut(e.target.value)} placeholder="05:00 PM" />
                </div>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn secondary" onClick={() => setEditModalOpen(false)}>Cancel</button>
              <button className="btn primary" onClick={saveEdits}>Save</button>
            </div>
          </div>
        </div>
      )}

      {/* Correction Approval Modal */}
      {correctionModalOpen && correctionModalData && (
        <div className="modal-overlay" onClick={() => { setCorrectionModalOpen(false); setCorrectionActionPending(null); setDenialReason(''); }}>
          <div className="modal-content correction-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Time Correction Request</h2>
              <button className="close-btn" onClick={() => { setCorrectionModalOpen(false); setCorrectionActionPending(null); setDenialReason(''); }}>×</button>
            </div>
            
            <div className="modal-body correction-body">
              {/* Employee Info */}
              <div className="correction-section">
                <h3>Employee Information</h3>
                <div className="info-row">
                  <span className="label">Name:</span>
                  <span className="value">{correctionModalData.name}</span>
                </div>
                <div className="info-row">
                  <span className="label">Date:</span>
                  <span className="value">{correctionModalData.date}</span>
                </div>
              </div>

              {/* Time Comparison */}
              <div className="correction-section">
                <h3>Time Adjustment</h3>
                <div className="time-comparison">
                  <div className="time-box original">
                    <div className="time-label">Original Time</div>
                    {correctionModalData.checkIn && (
                      <div className="time-value">
                        <span className="time-type">Check In:</span> {correctionModalData.checkIn}
                      </div>
                    )}
                    {correctionModalData.checkOut && (
                      <div className="time-value">
                        <span className="time-type">Check Out:</span> {correctionModalData.checkOut}
                      </div>
                    )}
                  </div>

                  <div className="arrow-separator">→</div>

                  <div className="time-box corrected">
                    <div className="time-label">Requested Correction</div>
                    {correctionModalData.correctionDetails?.requestedCheckIn && (
                      <div className="time-value">
                        <span className="time-type">Check In:</span> {correctionModalData.correctionDetails.requestedCheckIn}
                      </div>
                    )}
                    {correctionModalData.correctionDetails?.requestedCheckOut && (
                      <div className="time-value">
                        <span className="time-type">Check Out:</span> {correctionModalData.correctionDetails.requestedCheckOut}
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Reason */}
              <div className="correction-section">
                <h3>Reason for Correction</h3>
                <div className="reason-box">
                  {correctionModalData.correctionDetails?.reason || 'No reason provided'}
                </div>
              </div>

              {/* Proof */}
              {(correctionModalData.issueProofUrl || correctionModalData.issueProofPath) && (
                <div className="correction-section">
                  <h3>Attached Proof</h3>
                  <button 
                    className="proof-button"
                    onClick={() => {
                      openProofModalForIssue(correctionModalData.correctionIssueId, correctionModalData.issueProofUrl);
                    }}
                  >
                    📎 View Attached Proof
                  </button>
                </div>
              )}

              {/* Resolution Notes Input (for Denial) */}
              {correctionActionPending === 'Denied' && (
                <div className="correction-section">
                  <h3>Reason for Denial</h3>
                  <textarea
                    value={denialReason}
                    onChange={(e) => setDenialReason(e.target.value)}
                    placeholder="Please provide a reason for denying this correction..."
                    rows="3"
                    style={{ width: '100%', padding: '8px', fontFamily: 'inherit', boxSizing: 'border-box' }}
                  />
                </div>
              )}
            </div>

            <div className="modal-footer">
              <button
                className="btn-cancel"
                onClick={() => { setCorrectionModalOpen(false); setCorrectionActionPending(null); setDenialReason(''); }}
              >
                Cancel
              </button>
              <button
                className="btn-approve"
                onClick={() => {
                  if (correctionActionPending === 'Approved') {
                    setCorrectionStatus('Approved', 'Approved by admin');
                  } else if (correctionActionPending === 'Denied') {
                    if (!denialReason.trim()) {
                      alert('Please provide a reason for denial');
                      return;
                    }
                    setCorrectionStatus('Denied', denialReason);
                  }
                }}
                disabled={correctionActionPending === 'Denied' && !denialReason.trim()}
              >
                {correctionActionPending === 'Approved' ? 'Approve Correction' : 'Deny Correction'}
              </button>
            </div>
          </div>
        </div>
      )}

      {proofModalOpen && (
        <div className="modal-overlay" onClick={() => {
          setProofModalOpen(false);
          setProofModalIssueId(null);
          setProofModalLoading(false);
          setProofModalError('');
          setProofModalUrl(null);
        }}>
          <div className="modal-content proof-modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Proof Attachment</h2>
              <button className="close-btn" onClick={() => {
                setProofModalOpen(false);
                setProofModalIssueId(null);
                setProofModalLoading(false);
                setProofModalError('');
                setProofModalUrl(null);
              }}>×</button>
            </div>
            <div className="modal-body">
              {proofModalLoading && (
                <div style={{ padding: '16px', textAlign: 'center' }}>Loading proof image...</div>
              )}

              {proofModalError && (
                <div style={{ marginBottom: '12px', padding: '10px', borderRadius: '6px', backgroundColor: '#fff3f3', color: '#b42318', border: '1px solid #fecdca' }}>
                  {proofModalError}
                </div>
              )}

              {!proofModalLoading && proofModalUrl ? (
                <>
                  <img
                    src={proofModalUrl}
                    alt="Proof Attachment"
                    style={{ maxWidth: '100%', maxHeight: '60vh', borderRadius: '8px' }}
                    onError={() => setProofModalError('Unable to render proof image. Try Download instead.')}
                  />
                  <div style={{ marginTop: '12px', display: 'flex', gap: '10px', justifyContent: 'center' }}>
                    <a
                      href={proofModalUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="btn secondary"
                    >
                      View in New Tab
                    </a>
                    <button
                      type="button"
                      className="btn primary"
                      onClick={() => downloadProofForIssue(proofModalIssueId)}
                      disabled={!proofModalIssueId}
                    >
                      Download
                    </button>
                  </div>
                </>
              ) : null}
            </div>
          </div>
        </div>
      )}

      {showDeleteModal && recordToDelete && (
        <div className="modal-overlay" onClick={closeDeleteModal}>
          <div className="modal-content delete-modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Delete Attendance Record</h2>
              <button className="close-btn" onClick={closeDeleteModal}>×</button>
            </div>
            <div className="modal-body">
              <div className="warning-icon" style={{ fontSize: '48px', textAlign: 'center', marginBottom: '16px' }}>⚠️</div>
              <p style={{ marginBottom: '16px', textAlign: 'center', fontSize: '16px' }}>
                Are you sure you want to delete this attendance record?
              </p>
              <div className="record-details" style={{ backgroundColor: '#f9fafb', padding: '16px', borderRadius: '8px', marginBottom: '16px' }}>
                <p style={{ marginBottom: '8px' }}><strong>Employee:</strong> {recordToDelete.name} ({recordToDelete.employeeId})</p>
                <p style={{ marginBottom: '8px' }}><strong>Date:</strong> {recordToDelete.date}</p>
                <p style={{ marginBottom: '8px' }}><strong>Check In:</strong> {recordToDelete.checkIn}</p>
                <p style={{ marginBottom: '8px' }}><strong>Check Out:</strong> {recordToDelete.checkOut}</p>
                <p><strong>Status:</strong> {recordToDelete.status}</p>
              </div>
              <p style={{ color: '#d32f2f', fontSize: '14px', textAlign: 'center' }}>
                <strong>Warning:</strong> This action cannot be undone.
              </p>
            </div>
            <div className="modal-footer">
              <button className="btn-cancel" onClick={closeDeleteModal}>
                Cancel
              </button>
              <button className="btn-delete" onClick={deleteAttendanceRecord}>
                Delete Record
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AttendanceManagement;
