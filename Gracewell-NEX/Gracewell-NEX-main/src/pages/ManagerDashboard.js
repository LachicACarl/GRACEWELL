import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import Navbar from '../components/Navbar';
import './ManagerDashboard.css';
import { apiClient, logAudit } from '../utils/authService';

const ManagerDashboard = ({ user, onLogout }) => {
  const [activeTab, setActiveTab] = useState('approvals');
  const navigate = useNavigate();
  const [stats, setStats] = useState(null);

  useEffect(() => {
    fetchDashboardStats();
    fetchEmployees();
  }, []);

  const fetchDashboardStats = async () => {
    try {
      const { data } = await apiClient.get('/dashboard/stats');
      setStats(data?.stats || null);
    } catch (error) {
      console.error('Failed to fetch dashboard stats:', error);
    }
  };

  const [employees, setEmployees] = useState([]);
  const [pendingApprovals, setPendingApprovals] = useState([]);
  const [approvedRequests, setApprovedRequests] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (activeTab === 'approvals') {
      fetchPendingCorrections();
    } else if (activeTab === 'approved') {
      fetchApprovedCorrections();
    }
  }, [activeTab]);

  const fetchPendingCorrections = async () => {
    setLoading(true);
    try {
      const { data } = await apiClient.get('/attendance/correction-requests?status=Pending');
      setPendingApprovals(data?.requests || []);
    } catch (error) {
      console.error('Failed to fetch pending corrections:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchApprovedCorrections = async () => {
    setLoading(true);
    try {
      const { data } = await apiClient.get('/attendance/correction-requests?status=Approved');
      setApprovedRequests(data?.requests || []);
    } catch (error) {
      console.error('Failed to fetch approved corrections:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchEmployees = async () => {
    try {
      const { data } = await apiClient.get('/employees');
      setEmployees(data?.employees || []);
    } catch (error) {
      console.error('Error fetching employees:', error);
    }
  };

  const handleApprove = async (request) => {
    try {
      const { data } = await apiClient.put(`/attendance/correction-request/${request.issueId}/approval`, {
        status: 'Approved',
        resolutionNotes: 'Approved by manager'
      });
      
      if (data?.success) {
        alert('Correction request approved successfully');
        fetchPendingCorrections(); // Refresh the list
      } else {
        alert(data?.message || 'Failed to approve correction');
      }
    } catch (error) {
      console.error('Approve error:', error);
      alert(error?.response?.data?.message || 'Failed to approve correction');
    }
  };

  const handleDeny = async (request) => {
    const reason = prompt('Please provide a reason for denying this correction request:');
    if (!reason) return;
    
    try {
      const { data } = await apiClient.put(`/attendance/correction-request/${request.issueId}/approval`, {
        status: 'Denied',
        resolutionNotes: reason
      });
      
      if (data?.success) {
        alert('Correction request denied');
        fetchPendingCorrections(); // Refresh the list
      } else {
        alert(data?.message || 'Failed to deny correction');
      }
    } catch (error) {
      console.error('Deny error:', error);
      alert(error?.response?.data?.message || 'Failed to deny correction');
    }
  };

  const departmentStats = [
    { label: 'Total Employees', value: stats?.total_employees || '0' },
    { label: 'Present Today', value: stats?.today_present || '0' },
    { label: 'On Leave', value: '0' },
    { label: 'Pending Approvals', value: stats?.pending_salaries || '0' },
  ];

  const formatTime = (timeString) => {
    if (!timeString) return 'N/A';
    try {
      const [hours, minutes] = timeString.split(':');
      const h = parseInt(hours);
      const period = h >= 12 ? 'PM' : 'AM';
      const displayHour = h === 0 ? 12 : h > 12 ? h - 12 : h;
      return `${displayHour}:${minutes} ${period}`;
    } catch (e) {
      return timeString;
    }
  };

  const renderProofLink = (proofUrl, issueId) => {
    if (!proofUrl && !issueId) return '-';
    
    const handleViewProof = async () => {
      if (!issueId) {
        // Fallback to direct URL if no issueId
        window.open(proofUrl, '_blank', 'noopener,noreferrer');
        return;
      }
      
      try {
        const { data } = await apiClient.get(`/attendance/correction-request/${issueId}/proof-url`);
        if (data?.url) {
          window.open(data.url, '_blank', 'noopener,noreferrer');
        } else {
          alert('Unable to fetch proof image');
        }
      } catch (error) {
        console.error('Failed to fetch proof URL:', error);
        // Fallback to direct URL if available
        if (proofUrl) {
          window.open(proofUrl, '_blank', 'noopener,noreferrer');
        } else {
          alert('Unable to view proof image');
        }
      }
    };
    
    return (
      <button
        className="proof-link"
        onClick={handleViewProof}
        type="button"
        style={{ cursor: 'pointer', color: '#2563eb', textDecoration: 'underline', background: 'none', border: 'none', padding: 0 }}
      >
        View
      </button>
    );
  };

  const renderTabContent = () => {
    if (activeTab === 'approvals') {
      return (
        <div>
          <h3 style={{ marginBottom: '15px', color: '#333' }}>Pending Time Corrections</h3>
          {loading ? (
            <p>Loading correction requests...</p>
          ) : pendingApprovals.length === 0 ? (
            <p>No pending correction requests.</p>
          ) : (
            <table className="manager-table">
              <thead>
                <tr>
                  <th>Employee Name</th>
                  <th>Department</th>
                  <th>Date</th>
                  <th>Current Time In</th>
                  <th>Requested Time In</th>
                  <th>Current Time Out</th>
                  <th>Requested Time Out</th>
                  <th>Reason</th>
                  <th>Proof</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {pendingApprovals.map((item) => (
                  <tr key={item.issueId}>
                    <td>{item.employeeName}</td>
                    <td>{item.department}</td>
                    <td>{new Date(item.attendanceDate).toLocaleDateString()}</td>
                    <td>{formatTime(item.currentCheckIn)}</td>
                    <td><strong>{item.requestedCheckIn ? formatTime(item.requestedCheckIn) : '-'}</strong></td>
                    <td>{formatTime(item.currentCheckOut)}</td>
                    <td><strong>{item.requestedCheckOut ? formatTime(item.requestedCheckOut) : '-'}</strong></td>
                    <td style={{ maxWidth: '200px', fontSize: '0.9em' }}>{item.reason}</td>
                    <td>{renderProofLink(item.proofUrl, item.issueId)}</td>
                    <td>
                      <button className="action-btn approve" onClick={() => handleApprove(item)}>Approve</button>
                      <button className="action-btn deny" onClick={() => handleDeny(item)}>Deny</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      );
    } else if (activeTab === 'approved') {
      return (
        <div>
          <h3 style={{ marginBottom: '15px', color: '#333' }}>Approved Correction Requests</h3>
          {loading ? (
            <p>Loading approved requests...</p>
          ) : approvedRequests.length === 0 ? (
            <p>No approved correction requests.</p>
          ) : (
            <table className="manager-table">
              <thead>
                <tr>
                  <th>Employee Name</th>
                  <th>Department</th>
                  <th>Date</th>
                  <th>Corrected Time In</th>
                  <th>Corrected Time Out</th>
                  <th>Approved Date</th>
                  <th>Proof</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {approvedRequests.map((item) => (
                  <tr key={item.issueId}>
                    <td>{item.employeeName}</td>
                    <td>{item.department}</td>
                    <td>{new Date(item.attendanceDate).toLocaleDateString()}</td>
                    <td>{item.requestedCheckIn ? formatTime(item.requestedCheckIn) : '-'}</td>
                    <td>{item.requestedCheckOut ? formatTime(item.requestedCheckOut) : '-'}</td>
                    <td>{new Date(item.resolvedAt).toLocaleDateString()}</td>
                    <td>{renderProofLink(item.proofUrl, item.issueId)}</td>
                    <td><span className="status-badge approved">{item.status}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      );
    }
  };

  return (
    <div className="manager-container">
      <Navbar user={user} onLogout={onLogout} />
      
      <div className="container">
        <div className="section-header">
          <h1 className="section-title">Manager Dashboard</h1>
          <p className="section-subtitle">Department Management & Employee Oversight</p>
        </div>

        <div className="stats-container">
          {departmentStats.map((stat, idx) => (
            <div key={idx} className="stat-card">
              <div className="stat-label">{stat.label}</div>
              <div className="stat-value">{stat.value}</div>
            </div>
          ))}
        </div>

        <div className="records-section">
          <div className="records-header">
            <h2 className="records-title">Time Corrections & Approvals</h2>
          </div>

          <div className="tab-buttons">
            <button 
              className={`tab-btn ${activeTab === 'approvals' ? 'active' : ''}`}
              onClick={() => setActiveTab('approvals')}
            >
              Pending Approvals
            </button>
            <button 
              className={`tab-btn ${activeTab === 'approved' ? 'active' : ''}`}
              onClick={() => setActiveTab('approved')}
            >
              Approved Requests
            </button>
          </div>

          {renderTabContent()}
        </div>
      </div>
    </div>
  );
};

export default ManagerDashboard;
