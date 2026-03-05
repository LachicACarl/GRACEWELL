import React, { useMemo, useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import Navbar from '../components/Navbar';
import './SalaryTracker.css';
import { logAudit, apiClient } from '../utils/authService';

const SalaryTracker = ({ user, onLogout }) => {
  const [records, setRecords] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [search, setSearch] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [datePreset, setDatePreset] = useState('week');
  const [statusFilter, setStatusFilter] = useState('All');
  const [showAddModal, setShowAddModal] = useState(false);
  const [showManageModal, setShowManageModal] = useState(false);
  const [selectedRecord, setSelectedRecord] = useState(null);
  const [editData, setEditData] = useState({ salary: '', trips: '' });
  const [exportDropdownOpen, setExportDropdownOpen] = useState(false);
  const [reportRange, setReportRange] = useState('week');
  const [addData, setAddData] = useState({ employeeId: '', employeeName: '', periodStart: '', periodEnd: '', salary: '', trips: 1 });
  const [addError, setAddError] = useState('');
  const [actionDropdownOpen, setActionDropdownOpen] = useState(null);
  const [showReceiptModal, setShowReceiptModal] = useState(false);
  const [receiptRecord, setReceiptRecord] = useState(null);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteRecord, setDeleteRecord] = useState(null);
  const [deleteSubmitting, setDeleteSubmitting] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(5);
  const [searchParams] = useSearchParams();

  // Fetch salary records from backend
  const fetchEmployees = useCallback(async () => {
    try {
      const { data } = await apiClient.get('/employees');
      setEmployees(data?.employees || []);
    } catch (error) {
      console.error('Error fetching employees:', error);
    }
  }, []);

  const fetchSalaryRecords = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (statusFilter && statusFilter !== 'All') params.append('status', statusFilter);
      if (startDate) params.append('startDate', startDate);
      if (endDate) params.append('endDate', endDate);

      const { data } = await apiClient.get(`/salary/records?${params.toString()}`);
      
      // Transform backend data to frontend format
      const transformed = (data.records || []).map(r => ({
        id: r.id,
        employeeId: r.users?.employee_id || r.employee_id || '',
        employeeName: r.users?.name || r.name || '',
        trips: r.trips || 0,
        salary: r.amount,
        status: r.status,
        releaseDate: r.released_at ? r.released_at.split('T')[0] : null,
        claimedDate: r.claimed_at ? r.claimed_at.split('T')[0] : null,
        periodStart: r.period_start || null,
        periodEnd: r.period_end || null,
        position: r.users?.role || r.position || 'Employee',
        department: r.users?.department || r.department || 'N/A'
      }));
      
      setRecords(transformed);
    } catch (error) {
      console.error('Failed to fetch salary records:', error);
    }
  }, [statusFilter, startDate, endDate]);

  useEffect(() => {
    fetchSalaryRecords();
    fetchEmployees();
  }, [fetchSalaryRecords, fetchEmployees]);

  useEffect(() => {
    if (!startDate && !endDate) {
      applyDatePreset('week');
    }
  }, []);

  useEffect(() => {
    const statusParam = searchParams.get('status');
    if (!statusParam) {
      setStatusFilter('All');
      return;
    }

    const normalized = statusParam.toLowerCase();
    if (normalized === 'pending') {
      setStatusFilter('Pending');
    } else if (normalized === 'released') {
      setStatusFilter('Released');
    } else {
      setStatusFilter('All');
    }
  }, [searchParams]);

  const totals = useMemo(() => {
    const totalSalary = records.reduce((sum, r) => sum + (parseFloat(r.salary) || 0), 0);
    const pending = records.filter((r) => r.status === 'Pending').reduce((sum, r) => sum + (parseFloat(r.salary) || 0), 0);
    const released = records.filter((r) => r.status === 'Released').reduce((sum, r) => sum + (parseFloat(r.salary) || 0), 0);
    const pendingCount = records.filter((r) => r.status === 'Pending').length;
    return { totalSalary, pending, released, pendingCount };
  }, [records]);

  const statusCounts = useMemo(() => {
    return {
      All: records.length,
      Pending: records.filter((r) => r.status === 'Pending').length,
      Released: records.filter((r) => r.status === 'Released').length,
      Claimed: records.filter((r) => r.status === 'Claimed').length,
      Released: records.filter((r) => r.status === 'Released').length,
    };
  }, [records]);

  const filteredRecords = useMemo(() => {
    return records.filter((rec) => {
      const term = search.toLowerCase();
      const inSearch = !term ||
        rec.employeeId.toLowerCase().includes(term) ||
        rec.employeeName.toLowerCase().includes(term);

      const statusOk = statusFilter === 'All' || rec.status === statusFilter;

      const periodStart = rec.periodStart ? new Date(rec.periodStart) : null;
      const periodEnd = rec.periodEnd ? new Date(rec.periodEnd) : null;
      const startBoundary = startDate ? new Date(startDate) : null;
      const endBoundary = endDate ? new Date(endDate) : null;

      let startOk = true;
      let endOk = true;

      if (startBoundary && periodEnd) {
        startOk = periodEnd >= startBoundary;
      }
      if (endBoundary && periodStart) {
        endOk = periodStart <= endBoundary;
      }

      return inSearch && statusOk && startOk && endOk;
    });
  }, [records, search, statusFilter, startDate, endDate]);

  // Pagination calculations
  const totalPages = Math.ceil(filteredRecords.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const paginatedRecords = filteredRecords.slice(startIndex, endIndex);

  // Reset to page 1 when filters change
  React.useEffect(() => {
    setCurrentPage(1);
  }, [search, statusFilter, startDate, endDate]);

  React.useEffect(() => {
    const handleClickOutside = () => setActionDropdownOpen(null);
    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, []);

  const salaryPeriod = startDate && endDate
    ? `${new Date(startDate).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })} - ${new Date(endDate).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}`
    : 'October 16-31, 2025';

  const formatIsoDate = (value) => value.toISOString().split('T')[0];

  const applyDatePreset = (preset) => {
    const today = new Date();
    const end = new Date(today);
    const start = new Date(today);

    if (preset === 'today') {
      // start and end are today
    } else if (preset === 'week') {
      start.setDate(end.getDate() - 6);
    } else if (preset === 'month') {
      start.setDate(end.getDate() - 29);
    }

    setDatePreset(preset);
    setStartDate(formatIsoDate(start));
    setEndDate(formatIsoDate(end));
  };

  const getReportRange = (rangeOverride) => {
    if (startDate && endDate) {
      return { startIso: startDate, endIso: endDate, label: 'custom' };
    }

    const fallback = rangeOverride || datePreset || 'week';
    const today = new Date();
    const end = new Date(today);
    const start = new Date(today);

    if (fallback === 'today') {
      // start and end are today
    } else if (fallback === 'month') {
      start.setDate(end.getDate() - 29);
    } else {
      start.setDate(end.getDate() - 6);
    }

    return {
      startIso: formatIsoDate(start),
      endIso: formatIsoDate(end),
      label: fallback
    };
  };

  const handleManageClick = (rec) => {
    // Don't allow editing if already released
    if (rec.status === 'Released') {
      alert('Cannot edit salary records that have been released');
      return;
    }
    setSelectedRecord(rec);
    setEditData({ salary: rec.salary, trips: rec.trips });
    setShowManageModal(true);
  };

  const saveManageChanges = async () => {
    // Double check before saving
    if (selectedRecord.status === 'Released') {
      alert('Cannot edit released salary records');
      return;
    }
    
    try {
      const { data } = await apiClient.put(`/salary/records/${selectedRecord.id}`, {
        baseSalary: parseFloat(editData.salary)
      });
      
      if (data?.success) {
        await fetchSalaryRecords();
        setShowManageModal(false);
        setSelectedRecord(null);
      } else {
        alert(data?.message || 'Failed to update salary record');
      }
    } catch (error) {
      console.error('Update error:', error);
      alert(error?.response?.data?.message || 'Failed to update salary record');
    }
  };

  const releasePayment = async (record) => {
    try {
      const { data } = await apiClient.put(`/salary/release/${record.id}`);
      if (data?.success) {
        await fetchSalaryRecords();
        await logAudit('SALARY_RELEASE', {
          employeeId: record.employeeId,
          employeeName: record.employeeName,
          amount: record.salary,
          periodStart: record.periodStart,
          periodEnd: record.periodEnd
        });
      } else {
        alert(data?.message || 'Failed to release payment');
      }
    } catch (error) {
      console.error('Release error:', error);
      alert(error?.response?.data?.message || 'Failed to release payment');
    }
  };

  const openDeleteModal = (record) => {
    setDeleteRecord(record);
    setShowDeleteModal(true);
  };

  const closeDeleteModal = () => {
    if (deleteSubmitting) return;
    setShowDeleteModal(false);
    setDeleteRecord(null);
  };

  const deleteSalaryRecord = async () => {
    if (!deleteRecord?.id) return;

    setDeleteSubmitting(true);
    try {
      const { data } = await apiClient.delete(`/salary/records/${deleteRecord.id}`);
      if (!data?.success) {
        alert(data?.message || 'Failed to delete salary record');
        return;
      }

      await logAudit('SALARY_RECORD_DELETED', {
        salaryId: deleteRecord.id,
        employeeId: deleteRecord.employeeId,
        employeeName: deleteRecord.employeeName,
        periodStart: deleteRecord.periodStart,
        periodEnd: deleteRecord.periodEnd,
        amount: deleteRecord.salary,
        status: deleteRecord.status
      });

      await fetchSalaryRecords();
      setShowDeleteModal(false);
      setDeleteRecord(null);
      setActionDropdownOpen(null);
    } catch (error) {
      console.error('Delete salary error:', error);
      alert(error?.response?.data?.message || 'Failed to delete salary record');
    } finally {
      setDeleteSubmitting(false);
    }
  };

  const exportReport = async (format, range = reportRange) => {
    const formatLower = format.toLowerCase();
    const { startIso, endIso, label } = getReportRange(range);

    try {
      const response = await fetch(`${process.env.REACT_APP_API_BASE_URL || 'http://localhost:4000'}/reports/salary`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('accessToken')}`
        },
        body: JSON.stringify({ startDate: startIso, endDate: endIso, format: formatLower })
      });

      if (!response.ok) {
        const text = await response.text();
        throw new Error(text || 'Export failed');
      }

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `salary_${label}_${startIso}_${endIso}.${formatLower}`;
      document.body.appendChild(a);
      a.click();
      URL.revokeObjectURL(url);
      document.body.removeChild(a);

      await logAudit('SALARY_EXPORT', { format, range: label, recordCount: filteredRecords.length });
    } catch (error) {
      console.error('Export error:', error);
      alert(error?.message || 'Failed to export report');
    } finally {
      setExportDropdownOpen(false);
    }
  };

  const formatDisplayDate = (value) => {
    if (!value) return '-';
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? value : parsed.toLocaleDateString('en-US');
  };

  const resetAddForm = () => {
    setAddData({ employeeId: '', employeeName: '', periodStart: '', periodEnd: '', salary: '', trips: 1 });
    setAddError('');
  };

  const handleAddRecord = async () => {
    const employeeId = String(addData.employeeId ?? '').trim();
    const employeeName = String(addData.employeeName ?? '').trim();
    const periodStart = String(addData.periodStart ?? '').trim();
    const periodEnd = String(addData.periodEnd ?? '').trim();
    const salaryNum = parseFloat(String(addData.salary ?? ''));
    const tripsNum = parseInt(addData.trips || 0, 10);

    if (!employeeId || !employeeName || !periodStart || !periodEnd || Number.isNaN(salaryNum) || salaryNum <= 0) {
      setAddError('Please complete all fields and ensure salary is greater than 0.');
      return;
    }

    try {
      const { data } = await apiClient.post('/salary/add', {
        employeeId,
        periodStart,
        periodEnd,
        amount: salaryNum,
        trips: Number.isNaN(tripsNum) ? 0 : tripsNum
      });

      if (data?.success) {
        await fetchSalaryRecords();
        setShowAddModal(false);
        resetAddForm();
      } else {
        setAddError(data?.message || 'Failed to add salary record');
      }
    } catch (error) {
      console.error('Add salary error:', error);
      setAddError(error?.response?.data?.message || 'Failed to add salary record');
    }
  };

  const isAdmin = user?.userRole === 'admin' || user?.userRole === 'super_admin';
  const isManager = user?.userRole === 'manager';

  const downloadReceipt = async (record) => {
    try {
      const response = await fetch(`${process.env.REACT_APP_API_BASE_URL}/salary/receipt/${record.id}`, {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('accessToken')}`
        }
      });

      if (response.ok) {
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `salary_receipt_${record.employeeId}.pdf`;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
      } else {
        alert('Failed to download receipt');
      }
    } catch (error) {
      console.error('Receipt download error:', error);
      alert('Failed to download receipt');
    }
  };

  return (
    <div className="salary-page">
      <Navbar user={user} onLogout={onLogout} />

      <div className="salary-container">
        <div className="header-section">
          <div>
            <h1>Employee Salary Tracker</h1>
            <p className="subtitle">{isAdmin ? 'Manage and track employee salaries' : 'View salary records and release payments'}</p>
          </div>
        </div>

        {isAdmin && (
          <div className="summary-cards-row">
            <div className="summary-card">
              <div className="card-label">Total Salary</div>
              <div className="card-value">₱{(totals.totalSalary || 0).toLocaleString('en-US', { maximumFractionDigits: 0 })}</div>
            </div>
            <div className="summary-card">
              <div className="card-label">Pending Salaries</div>
              <div className="card-value orange">₱{(totals.pending || 0).toLocaleString('en-US', { maximumFractionDigits: 0 })}</div>
            </div>
            <div className="summary-card">
              <div className="card-label">Released Salaries</div>
              <div className="card-value green">₱{(totals.released || 0).toLocaleString('en-US', { maximumFractionDigits: 0 })}</div>
            </div>
            <div className="summary-card">
              <div className="card-label">Pending Employees</div>
              <div className="card-value">{totals.pendingCount}</div>
            </div>
          </div>
        )}

        {isManager && (
          <div className="summary-cards-row">
            <div className="summary-card">
              <div className="card-label">Total Salary</div>
              <div className="card-value">₱{(totals.totalSalary || 0).toLocaleString('en-US', { maximumFractionDigits: 0 })}</div>
            </div>
            <div className="summary-card">
              <div className="card-label">Pending Salaries</div>
              <div className="card-value orange">₱{(totals.pending || 0).toLocaleString('en-US', { maximumFractionDigits: 0 })}</div>
            </div>
            <div className="summary-card">
              <div className="card-label">Released Salaries</div>
              <div className="card-value green">₱{(totals.released || 0).toLocaleString('en-US', { maximumFractionDigits: 0 })}</div>
            </div>
            <div className="summary-card">
              <div className="card-label">Pending Employees</div>
              <div className="card-value">{totals.pendingCount}</div>
            </div>
          </div>
        )}

        {!isAdmin && !isManager && (
          <div className="permission-notice">
            <p>⚠️ Salary management features are restricted to admin and manager users only.</p>
          </div>
        )}

        {isAdmin && (
          <div className="salary-header">
            <h1>Salary Period: {salaryPeriod}</h1>
            <div className="subtext">Manage salary records, release payments, and export reports.</div>
          </div>
        )}

        {isManager && (
          <div className="salary-header">
            <h1>Salary Period: {salaryPeriod}</h1>
            <div className="subtext">Release payments and generate reports.</div>
          </div>
        )}

        <div className="search-actions">
          <div className="search-field">
            <input
              type="text"
              placeholder="Search by employee ID, name, or period..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <button className="search-btn" aria-label="Search">🔍</button>
          </div>
          {(user?.userRole === 'admin' || user?.userRole === 'super_admin') && (
            <button className="add-record-btn" onClick={() => setShowAddModal(true)}>+ Add Salary Record</button>
          )}
          {(user?.userRole === 'admin' || user?.userRole === 'super_admin') && (
            <div className="export-dropdown-wrapper">
              <button className="export-btn" onClick={() => setExportDropdownOpen(!exportDropdownOpen)}>
                Export
              </button>
              {exportDropdownOpen && (
                <div className="export-dropdown-menu">
                  <div className="export-range">
                    <label>
                      <input type="radio" checked={reportRange === 'week'} onChange={() => setReportRange('week')} /> Weekly
                    </label>
                    <label>
                      <input type="radio" checked={reportRange === 'month'} onChange={() => setReportRange('month')} /> Monthly
                    </label>
                  </div>
                  <button onClick={() => exportReport('PDF')}>Export as .pdf</button>
                  <button onClick={() => exportReport('XLSX')}>Export as .xlsx</button>
                  <button onClick={() => exportReport('CSV')}>Export as .csv</button>
                </div>
              )}
            </div>
          )}
          {isManager && (
            <div className="export-dropdown-wrapper">
              <button className="export-btn" onClick={() => setExportDropdownOpen(!exportDropdownOpen)}>
                Export Report
              </button>
              {exportDropdownOpen && (
                <div className="export-dropdown-menu">
                  <div className="export-range">
                    <label>
                      <input type="radio" checked={reportRange === 'week'} onChange={() => setReportRange('week')} /> Weekly
                    </label>
                    <label>
                      <input type="radio" checked={reportRange === 'month'} onChange={() => setReportRange('month')} /> Monthly
                    </label>
                  </div>
                  <button onClick={() => exportReport('PDF')}>Generate as .pdf</button>
                  <button onClick={() => exportReport('XLSX')}>Generate as .xlsx</button>
                  <button onClick={() => exportReport('CSV')}>Generate as .csv</button>
                </div>
              )}
            </div>
          )}
        </div>

        {isAdmin && (
          <div className="period-controls">
            <div className="date-filter-buttons">
              <button
                className={datePreset === 'today' ? 'active' : ''}
                onClick={() => applyDatePreset('today')}
              >
                Today
              </button>
              <button
                className={datePreset === 'week' ? 'active' : ''}
                onClick={() => applyDatePreset('week')}
              >
                Last Week
              </button>
              <button
                className={datePreset === 'month' ? 'active' : ''}
                onClick={() => applyDatePreset('month')}
              >
                Last Month
              </button>
            </div>
            <div className="date-inputs">
              <div className="date-group">
                <label>From:</label>
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => {
                    setStartDate(e.target.value);
                    setDatePreset('custom');
                  }}
                  placeholder="mm/dd/yyyy"
                />
              </div>
              <div className="date-group">
                <label>To:</label>
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => {
                    setEndDate(e.target.value);
                    setDatePreset('custom');
                  }}
                  placeholder="mm/dd/yyyy"
                />
              </div>
            </div>
          </div>
        )}

        {isAdmin && (
          <div className="status-filters">
            {Object.keys(statusCounts).map((status) => (
              <button
                key={status}
                className={`filter-btn ${statusFilter === status ? 'active' : ''}`}
                onClick={() => setStatusFilter(status)}
              >
                {status} ({statusCounts[status]})
              </button>
            ))}
          </div>
        )}

        {(isAdmin || isManager) && (
          <div className="table-wrapper">
            <table className="salary-table">
            <thead>
              <tr>
                <th>Employee Name</th>
                <th>Employee ID</th>
                <th>Pay Period</th>
                <th>Salary</th>
                <th>Status</th>
                <th>Release Date</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {paginatedRecords.length === 0 && (
                <tr>
                  <td colSpan="7" className="empty-state">No salary records yet. Connect to the database to load data.</td>
                </tr>
              )}
              {paginatedRecords.map((record) => (
                <tr key={record.id || `${record.employeeId}-${record.periodEnd || record.releaseDate || 'row'}`} className={actionDropdownOpen === record.id ? 'dropdown-active' : ''}>
                  <td><strong>{record.employeeName}</strong></td>
                  <td>{record.employeeId}</td>
                  <td>
                    {record.periodStart && record.periodEnd ? (
                      <>
                        {new Date(record.periodStart).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                        {' - '}
                        {new Date(record.periodEnd).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                      </>
                    ) : '-'}
                  </td>
                  <td>₱{(parseFloat(record.salary) || 0).toLocaleString('en-US')}</td>
                  <td>
                    <span className={`status-pill ${record.status.toLowerCase()}`}>
                      {record.status}
                    </span>
                  </td>
                  <td>{formatDisplayDate(record.releaseDate)}</td>
                  <td>
                    {user?.userRole === 'super_admin' && (
                      <button
                        type="button"
                        className="table-view-btn"
                        onClick={(e) => {
                          e.stopPropagation();
                          setReceiptRecord(record);
                          setShowReceiptModal(true);
                        }}
                      >
                        View
                      </button>
                    )}
                    {user?.userRole === 'admin' && (
                      <div className="action-dropdown-wrapper" onClick={(e) => e.stopPropagation()}>
                        <button
                          type="button"
                          className="table-split-btn"
                          onClick={(e) => {
                            e.stopPropagation();
                            setActionDropdownOpen(actionDropdownOpen === record.id ? null : record.id);
                          }}
                        >
                          <span className="table-split-btn__label">Manage</span>
                          <span className="table-split-btn__divider" />
                          <span className="table-split-btn__arrow" aria-label="Manage salary actions">▾</span>
                        </button>
                        {actionDropdownOpen === record.id && (
                          <div className="action-dropdown-menu" onClick={(e) => e.stopPropagation()}>
                            {/* Admin: Full access */}
                            {record.status === 'Pending' && (
                              <button onClick={() => { handleManageClick(record); setActionDropdownOpen(null); }}>
                                <span className="menu-text">Edit Details</span>
                              </button>
                            )}
                            {record.status === 'Pending' && (
                              <button onClick={() => { releasePayment(record); setActionDropdownOpen(null); }}>
                                <span className="menu-text">Release Payment</span>
                              </button>
                            )}
                            {(record.status === 'Released' || record.status === 'Claimed') && (
                              <button onClick={() => { setReceiptRecord(record); setShowReceiptModal(true); setActionDropdownOpen(null); }}>
                                <span className="menu-text">View Receipt</span>
                              </button>
                            )}
                            <button onClick={() => { openDeleteModal(record); setActionDropdownOpen(null); }}>
                              <span className="menu-text">Delete Record</span>
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                    {isManager && (
                      <div className="action-dropdown-wrapper" onClick={(e) => e.stopPropagation()}>
                        <button
                          type="button"
                          className="table-split-btn"
                          onClick={(e) => {
                            e.stopPropagation();
                            setActionDropdownOpen(actionDropdownOpen === record.id ? null : record.id);
                          }}
                        >
                          <span className="table-split-btn__label">Manage</span>
                          <span className="table-split-btn__divider" />
                          <span className="table-split-btn__arrow" aria-label="Manage salary actions">▾</span>
                        </button>
                        {actionDropdownOpen === record.id && (
                          <div className="action-dropdown-menu" onClick={(e) => e.stopPropagation()}>
                            {record.status === 'Pending' && (
                              <button onClick={() => { releasePayment(record); setActionDropdownOpen(null); }}>
                                <span className="menu-text">Release Payment</span>
                              </button>
                            )}
                            {(record.status === 'Released' || record.status === 'Claimed') && (
                              <button onClick={() => { setReceiptRecord(record); setShowReceiptModal(true); setActionDropdownOpen(null); }}>
                                <span className="menu-text">View Receipt</span>
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
            </table>
          </div>
        )}

        {/* Pagination Controls */}
        {(isAdmin || isManager) && filteredRecords.length > 0 && (
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
                // Show first, last, current, and pages around current
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
                } else if (page === currentPage - 2 || page === currentPage + 2) {
                  return <span key={page} className="pagination-ellipsis">...</span>;
                }
                return null;
              })}
              <button 
                className="pagination-btn"
                onClick={() => setCurrentPage(currentPage + 1)}
                disabled={currentPage === totalPages}
              >
                {'>'}
              </button>
              <button 
                className="pagination-btn"
                onClick={() => setCurrentPage(totalPages)}
                disabled={currentPage === totalPages}
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

      {/* Add Salary Record Modal */}
      {showAddModal && (
        <div className="modal-overlay" onClick={() => { setShowAddModal(false); resetAddForm(); }}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Add Salary Record</h2>
              <button className="close-btn" onClick={() => { setShowAddModal(false); resetAddForm(); }}>×</button>
            </div>
            <div className="modal-body">
              <p className="modal-description">Add a new salary record for a pay period. Existing records cannot be edited to prevent disputes.</p>
              {addError && <div className="error-text">{addError}</div>}
              <div className="form-group">
                <label>Select Employee</label>
                <select
                  value={addData.employeeId}
                  onChange={(e) => {
                    const selectedEmp = employees.find(emp => String(emp.employee_id) === String(e.target.value));
                    setAddData({
                      ...addData,
                      employeeId: e.target.value,
                      employeeName: selectedEmp?.name || ''
                    });
                  }}
                >
                  <option value="">-- Select an Employee --</option>
                  {employees.map(emp => (
                    <option key={emp.id} value={emp.employee_id}>
                      {emp.employee_id} - {emp.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label>Employee Name</label>
                <input
                  type="text"
                  placeholder="John Doe"
                  value={addData.employeeName}
                  disabled
                />
              </div>
              <div className="form-group">
                <label>Pay Period</label>
                <div className="pay-period-inputs">
                  <input
                    type="date"
                    value={addData.periodStart}
                    onChange={(e) => setAddData({ ...addData, periodStart: e.target.value })}
                  />
                  <span className="pay-period-separator">to</span>
                  <input
                    type="date"
                    value={addData.periodEnd}
                    onChange={(e) => setAddData({ ...addData, periodEnd: e.target.value })}
                  />
                </div>
              </div>
              <div className="form-group">
                <label>Salary</label>
                <input
                  type="number"
                  min="0"
                  placeholder="50000"
                  value={addData.salary}
                  onChange={(e) => setAddData({ ...addData, salary: e.target.value })}
                />
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn-cancel" onClick={() => { setShowAddModal(false); resetAddForm(); }}>Cancel</button>
              <button className="btn-add" onClick={handleAddRecord}>Add Record</button>
            </div>
          </div>
        </div>
      )}

      {/* Manage Salary Modal */}
      {showManageModal && selectedRecord && (
        <div className="modal-overlay" onClick={() => setShowManageModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Manage Salary Record</h2>
              <button className="close-btn" onClick={() => setShowManageModal(false)}>×</button>
            </div>
            <div className="modal-body">
              <div className="form-group">
                <label>Employee Name</label>
                <div className="readonly">{selectedRecord.employeeName}</div>
              </div>
              <div className="form-group">
                <label>Employee ID</label>
                <div className="readonly">{selectedRecord.employeeId}</div>
              </div>
              <div className="form-group">
                <label>Pay Period</label>
                <div className="readonly">
                  {selectedRecord.periodStart && selectedRecord.periodEnd ? (
                    `${formatDisplayDate(selectedRecord.periodStart)} - ${formatDisplayDate(selectedRecord.periodEnd)}`
                  ) : 'N/A'}
                </div>
              </div>
              <div className="form-group">
                <label>Trips</label>
                <input
                  type="number"
                  min="0"
                  value={editData.trips}
                  onChange={(e) => setEditData({ ...editData, trips: e.target.value })}
                  disabled={selectedRecord.status === 'Released'}
                />
              </div>
              <div className="form-group">
                <label>Salary Amount</label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={editData.salary}
                  onChange={(e) => setEditData({ ...editData, salary: e.target.value })}
                  disabled={selectedRecord.status === 'Released'}
                />
              </div>
              <div className="form-group">
                <label>Status</label>
                <div className="readonly">
                  <span className={`status-pill ${selectedRecord.status.toLowerCase()}`}>
                    {selectedRecord.status}
                  </span>
                </div>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn secondary" onClick={() => setShowManageModal(false)}>Cancel</button>
              <button 
                className="btn primary" 
                onClick={saveManageChanges}
                disabled={selectedRecord.status === 'Released'}
              >
                Save Changes
              </button>
            </div>
          </div>
        </div>
      )}

      {/* View Receipt Modal */}
      {showReceiptModal && receiptRecord && (
        <div className="modal-overlay" onClick={() => setShowReceiptModal(false)}>
          <div className="receipt-modal" onClick={(e) => e.stopPropagation()}>
            <div className="receipt-header">
              <div className="receipt-logo">
                <div className="logo-icon">📦</div>
                <h2>Gracewell NEXUS</h2>
              </div>
              <div className="receipt-period-label">
                <div className="period-label">Pay Period</div>
                <div className="period-value">
                  {formatDisplayDate(receiptRecord.periodStart)} - {formatDisplayDate(receiptRecord.periodEnd)}
                </div>
              </div>
            </div>

            <div className="receipt-body">
              <div className="receipt-row">
                <span className="receipt-label">Employee Name:</span>
                <span className="receipt-value">{receiptRecord.employeeName}</span>
              </div>
              <div className="receipt-row">
                <span className="receipt-label">Employee ID:</span>
                <span className="receipt-value">{receiptRecord.employeeId}</span>
              </div>
              <div className="receipt-row">
                <span className="receipt-label">Position:</span>
                <span className="receipt-value">{receiptRecord.position || 'N/A'}</span>
              </div>
              <div className="receipt-row">
                <span className="receipt-label">Department:</span>
                <span className="receipt-value">{receiptRecord.department || 'N/A'}</span>
              </div>

              <div className="receipt-divider"></div>

              <div className="receipt-row">
                <span className="receipt-label-bold">Gross Salary:</span>
                <span className="receipt-amount-green">₱ {(receiptRecord.salary || 0).toLocaleString('en-US', { maximumFractionDigits: 0 })}</span>
              </div>
              <div className="receipt-row">
                <span className="receipt-label">Deductions:</span>
                <span className="receipt-amount-red">- ₱ 0</span>
              </div>
              <div className="receipt-row net-salary">
                <span className="receipt-label-bold">Net Salary:</span>
                <span className="receipt-amount-blue">₱ {(receiptRecord.salary || 0).toLocaleString('en-US', { maximumFractionDigits: 0 })}</span>
              </div>

              <div className="receipt-divider"></div>

              <div className="receipt-footer-info">
                <div className="receipt-date-row">
                  <span className="date-label">Release Date:</span>
                  <span className="date-value">{receiptRecord.releaseDate ? new Date(receiptRecord.releaseDate).toLocaleDateString('en-US', { month: 'numeric', day: 'numeric', year: 'numeric' }) : '-'}</span>
                </div>
                <div className="receipt-status-badge">
                  <span className={`status-badge-${receiptRecord.status?.toLowerCase()}`}>{receiptRecord.status}</span>
                </div>
              </div>
            </div>

            <div className="receipt-actions">
              <button className="btn-receipt-close" onClick={() => setShowReceiptModal(false)}>Close</button>
              <button className="btn-receipt-download" onClick={() => downloadReceipt(receiptRecord)}>Download PDF</button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Salary Record Confirmation Modal */}
      {showDeleteModal && deleteRecord && (
        <div className="modal-overlay" onClick={closeDeleteModal}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Delete Salary Record</h2>
              <button className="close-btn" onClick={closeDeleteModal}>×</button>
            </div>
            <div className="modal-body">
              <p className="modal-description">
                This action will permanently delete this salary record. This cannot be undone.
              </p>
              <div className="form-group">
                <label>Employee</label>
                <div className="readonly">{deleteRecord.employeeName} ({deleteRecord.employeeId})</div>
              </div>
              <div className="form-group">
                <label>Pay Period</label>
                <div className="readonly">
                  {deleteRecord.periodStart && deleteRecord.periodEnd
                    ? `${formatDisplayDate(deleteRecord.periodStart)} - ${formatDisplayDate(deleteRecord.periodEnd)}`
                    : 'N/A'}
                </div>
              </div>
              <div className="form-group">
                <label>Amount</label>
                <div className="readonly">₱{(parseFloat(deleteRecord.salary) || 0).toLocaleString('en-US')}</div>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn secondary" onClick={closeDeleteModal} disabled={deleteSubmitting}>Cancel</button>
              <button className="btn primary" onClick={deleteSalaryRecord} disabled={deleteSubmitting}>
                {deleteSubmitting ? 'Deleting...' : 'Delete Record'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default SalaryTracker;
