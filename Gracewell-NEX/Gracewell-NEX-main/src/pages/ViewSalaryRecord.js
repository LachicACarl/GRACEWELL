import React, { useState, useEffect, useCallback } from 'react';
import Navbar from '../components/Navbar';
import './ViewSalaryRecord.css';
import { useNavigate, useLocation } from 'react-router-dom';
import { apiClient } from '../utils/authService';

const ViewSalaryRecord = ({ user, onLogout }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const recordData = location.state?.record || {};

  const [formData, setFormData] = useState({
    employeeId: recordData.employeeId || '',
    employeeName: recordData.employeeName || '',
    position: recordData.position || '',
    department: recordData.department || '',
    baseSalary: recordData.salary || '',
    employmentStatus: recordData.employmentStatus || 'Regular',
    paymentLogs: recordData.paymentLogs || []
  });

  const [loading, setLoading] = useState(false);

  const fetchSalaryRecord = useCallback(async (recordId) => {
    try {
      setLoading(true);
      const { data } = await apiClient.get(`/salary/records/${recordId}`);
      setFormData({
        employeeId: data?.employeeId || '',
        employeeName: data?.employeeName || '',
        position: data?.position || '',
        department: data?.department || '',
        baseSalary: data?.salary || '',
        employmentStatus: data?.employmentStatus || 'Regular',
        paymentLogs: data?.paymentLogs || []
      });
    } catch (error) {
      console.error('Error fetching salary record:', error);
    } finally {
      setLoading(false);
    }
  }, [apiClient]);

  useEffect(() => {
    if (recordData.id) {
      fetchSalaryRecord(recordData.id);
    }
  }, [recordData.id, fetchSalaryRecord]);

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: value
    }));
  };

  const handleSaveChanges = async () => {
    try {
      setLoading(true);
      const { data } = await apiClient.put(`/salary/records/${recordData.id}`, {
        baseSalary: formData.baseSalary,
        employmentStatus: formData.employmentStatus
      });
      if (data?.success) {
        alert('Salary record updated successfully!');
        navigate(-1);
      } else {
        alert(data?.message || 'Failed to update salary record');
      }
    } catch (error) {
      console.error('Error updating salary record:', error);
      alert(error?.response?.data?.message || 'Failed to update salary record');
    } finally {
      setLoading(false);
    }
  };

  const handleCancel = () => {
    navigate(-1);
  };

  return (
    <div className="view-salary-container">
      <Navbar user={user} onLogout={onLogout} />

      <div className="container">
        <div className="breadcrumb">
          <span>Employee</span>
          <span>&gt;</span>
          <span>Employee Salary Tracker</span>
          <span>&gt;</span>
          <span className="current">View Salary Record</span>
        </div>

        {loading ? (
          <div className="loading-state">Loading salary record...</div>
        ) : (
        <div className="salary-record-card">
          <div className="record-layout">
            {/* Left side - Profile Section */}
            <div className="profile-section">
              <div className="profile-avatar">
                <span>{formData.employeeName?.charAt(0)}</span>
              </div>
              <div className="profile-info">
                <p className="profile-name">{formData.employeeName}</p>
                <p className="profile-id">{formData.employeeId}</p>
              </div>
            </div>

            {/* Right side - Form Details */}
            <div className="form-section">
              <div className="form-row">
                <div className="form-group">
                  <label>Name</label>
                  <input
                    type="text"
                    name="employeeName"
                    value={formData.employeeName}
                    onChange={handleInputChange}
                    disabled
                  />
                </div>
                <div className="form-group">
                  <label>Department</label>
                  <input
                    type="text"
                    name="department"
                    value={formData.department}
                    onChange={handleInputChange}
                    disabled
                  />
                </div>
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label>ID Number</label>
                  <input
                    type="text"
                    name="employeeId"
                    value={formData.employeeId}
                    onChange={handleInputChange}
                    disabled
                  />
                </div>
                <div className="form-group">
                  <label>Base Salary</label>
                  <input
                    type="text"
                    name="baseSalary"
                    value={formData.baseSalary}
                    onChange={handleInputChange}
                  />
                </div>
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label>Position</label>
                  <input
                    type="text"
                    name="position"
                    value={formData.position}
                    onChange={handleInputChange}
                    disabled
                  />
                </div>
                <div className="form-group">
                  <label>Employment Status</label>
                  <input
                    type="text"
                    name="employmentStatus"
                    value={formData.employmentStatus}
                    onChange={handleInputChange}
                  />
                </div>
              </div>

              <div className="form-group full-width">
                <label>Payment Logs</label>
                <div className="payment-logs-container">
                  {formData.paymentLogs && formData.paymentLogs.length > 0 ? (
                    <table className="payment-logs-table">
                      <thead>
                        <tr>
                          <th>Date</th>
                          <th>Amount</th>
                          <th>Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {formData.paymentLogs.map((log, index) => (
                          <tr key={index}>
                            <td>{log.date}</td>
                            <td>{log.amount}</td>
                            <td>{log.status}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  ) : (
                    <div className="no-logs">No payment logs available</div>
                  )}
                </div>
              </div>

              <div className="button-group">
                <button className="cancel-btn" onClick={handleCancel}>
                  Cancel
                </button>
                <button className="save-btn" onClick={handleSaveChanges}>
                  Save Changes
                </button>
              </div>
            </div>
          </div>
        </div>
        )}
      </div>
    </div>
  );
};

export default ViewSalaryRecord;
