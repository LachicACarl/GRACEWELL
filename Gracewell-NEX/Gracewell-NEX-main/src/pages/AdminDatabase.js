import React, { useState, useEffect } from 'react';
import Navbar from '../components/Navbar';
import './AdminDatabase.css';
import { apiClient } from '../utils/authService';

const AdminDatabase = ({ user, onLogout }) => {
  const [activeTab, setActiveTab] = useState('overview');
  const [tables, setTables] = useState({});
  const [loading, setLoading] = useState(false);
  const [selectedTable, setSelectedTable] = useState(null);
  const [tableData, setTableData] = useState([]);
  const [statistics, setStatistics] = useState({});

  useEffect(() => {
    fetchDatabaseStats();
  }, []);

  const fetchDatabaseStats = async () => {
    try {
      setLoading(true);
      const { data } = await apiClient.get('/admin/database/stats');
      setStatistics(data || {});
    } catch (error) {
      console.error('Error fetching database stats:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchTableData = async (tableName) => {
    try {
      setLoading(true);
      let data;
      
      // Use /employees endpoint for users table to get fresh employee data
      if (tableName === 'users') {
        const response = await apiClient.get('/employees');
        data = response.data?.employees || [];
      } else {
        const response = await apiClient.get(`/admin/database/tables/${tableName}`);
        data = response.data || [];
      }
      
      setTableData(data || []);
      setSelectedTable(tableName);
      
      // Refresh stats when table changes
      fetchDatabaseStats();
    } catch (error) {
      console.error('Error fetching table data:', error);
    } finally {
      setLoading(false);
    }
  };

  const deleteRecord = async (tableName, id) => {
    if (window.confirm('Are you sure you want to delete this record?')) {
      try {
        const { data } = await apiClient.delete(`/admin/database/tables/${tableName}/${id}`);
        alert(data?.message || 'Record deleted successfully');
        fetchTableData(tableName);
      } catch (error) {
        console.error('Error deleting record:', error);
        alert(error?.response?.data?.message || 'Failed to delete record');
      }
    }
  };

  const exportTableAsCSV = async (tableName) => {
    try {
      const response = await fetch(`${process.env.REACT_APP_API_BASE_URL || 'http://localhost:4000'}/admin/database/export/${tableName}`, {
        headers: {
          Authorization: `Bearer ${localStorage.getItem('accessToken')}`
        }
      });
      if (!response.ok) {
        throw new Error('Failed to export table');
      }
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${tableName}_export.csv`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (error) {
      console.error('Error exporting table:', error);
      alert('Failed to export table');
    }
  };

  const clearTable = async (tableName) => {
    if (window.confirm(`WARNING: This will delete ALL records from ${tableName}. Are you absolutely sure?`)) {
      try {
        const { data } = await apiClient.delete(`/admin/database/tables/${tableName}/clear`);
        alert(data?.message || 'Table cleared successfully');
        setTableData([]);
        fetchDatabaseStats();
      } catch (error) {
        console.error('Error clearing table:', error);
        alert(error?.response?.data?.message || 'Failed to clear table');
      }
    }
  };

  return (
    <div className="admin-database-container">
      <Navbar user={user} onLogout={onLogout} />

      <div className="database-container">
        <div className="database-header">
          <h1>📊 Database Management</h1>
          <p>View, manage, and export database tables</p>
        </div>

        <div className="database-tabs">
          <button 
            className={`tab-btn ${activeTab === 'overview' ? 'active' : ''}`}
            onClick={() => setActiveTab('overview')}
          >
            📈 Overview
          </button>
          <button 
            className={`tab-btn ${activeTab === 'tables' ? 'active' : ''}`}
            onClick={() => setActiveTab('tables')}
          >
            📋 Tables
          </button>
          <button 
            className={`tab-btn ${activeTab === 'backup' ? 'active' : ''}`}
            onClick={() => setActiveTab('backup')}
          >
            💾 Backup
          </button>
        </div>

        {/* Overview Tab */}
        {activeTab === 'overview' && (
          <div className="tab-content overview-tab">
            <div className="statistics-grid">
              <div className="stat-card">
                <div className="stat-icon">👥</div>
                <div className="stat-info">
                  <h3>Total Users</h3>
                  <p className="stat-number">{statistics.totalUsers || 0}</p>
                </div>
              </div>

              <div className="stat-card">
                <div className="stat-icon">💼</div>
                <div className="stat-info">
                  <h3>Active Employees</h3>
                  <p className="stat-number">{statistics.activeEmployees || 0}</p>
                </div>
              </div>

              <div className="stat-card">
                <div className="stat-icon">📅</div>
                <div className="stat-info">
                  <h3>Attendance Records</h3>
                  <p className="stat-number">{statistics.attendanceRecords || 0}</p>
                </div>
              </div>

              <div className="stat-card">
                <div className="stat-icon">💰</div>
                <div className="stat-info">
                  <h3>Salary Records</h3>
                  <p className="stat-number">{statistics.salaryRecords || 0}</p>
                </div>
              </div>

              <div className="stat-card">
                <div className="stat-icon">🔐</div>
                <div className="stat-info">
                  <h3>Roles</h3>
                  <p className="stat-number">{statistics.totalRoles || 0}</p>
                </div>
              </div>

              <div className="stat-card">
                <div className="stat-icon">📊</div>
                <div className="stat-info">
                  <h3>Database Size</h3>
                  <p className="stat-number">{statistics.databaseSize || 'N/A'}</p>
                </div>
              </div>
            </div>

            <div className="recent-activity">
              <h3>Recent Database Activity</h3>
              <div className="activity-list">
                <div className="activity-item">
                  <span className="activity-icon">✓</span>
                  <span>Database connected and operational</span>
                  <span className="activity-time">Now</span>
                </div>
                <div className="activity-item">
                  <span className="activity-icon">✓</span>
                  <span>All tables initialized</span>
                  <span className="activity-time">System startup</span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Tables Tab */}
        {activeTab === 'tables' && (
          <div className="tab-content tables-tab">
            {!selectedTable ? (
              <div className="tables-list">
                <h3>Available Tables</h3>
                <div className="table-buttons">
                  <button className="table-select-btn" onClick={() => fetchTableData('users')}>
                    👥 Users
                  </button>
                  <button className="table-select-btn" onClick={() => fetchTableData('employees')}>
                    💼 Employees
                  </button>
                  <button className="table-select-btn" onClick={() => fetchTableData('attendance')}>
                    📅 Attendance
                  </button>
                  <button className="table-select-btn" onClick={() => fetchTableData('salary_records')}>
                    💰 Salary Records
                  </button>
                  <button className="table-select-btn" onClick={() => fetchTableData('roles')}>
                    🔐 Roles
                  </button>
                  <button className="table-select-btn" onClick={() => fetchTableData('audit_logs')}>
                    📝 Audit Logs
                  </button>
                </div>
              </div>
            ) : (
              <div className="table-view">
                <div className="table-header-actions">
                  <div className="table-title">
                    <button className="back-btn" onClick={() => setSelectedTable(null)}>
                      ← Back
                    </button>
                    <h3>Table: {selectedTable}</h3>
                  </div>
                  <div className="table-actions">
                    <button className="action-btn export-btn" onClick={() => exportTableAsCSV(selectedTable)}>
                      ⬇️ Export CSV
                    </button>
                    <button className="action-btn clear-btn" onClick={() => clearTable(selectedTable)}>
                      🗑️ Clear Table
                    </button>
                  </div>
                </div>

                {loading ? (
                  <div className="loading-state">Loading table data...</div>
                ) : tableData.length === 0 ? (
                  <div className="empty-state">
                    <p>No records found in this table</p>
                  </div>
                ) : (
                  <div className="table-wrapper">
                    <table className="data-table">
                      <thead>
                        <tr>
                          {tableData.length > 0 && Object.keys(tableData[0]).map((key) => (
                            <th key={key}>{key}</th>
                          ))}
                          <th>Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {tableData.map((row, index) => (
                          <tr key={index}>
                            {Object.values(row).map((value, idx) => (
                              <td key={idx}>{String(value).length > 50 ? String(value).substring(0, 50) + '...' : value}</td>
                            ))}
                            <td className="actions-cell">
                              <button 
                                className="delete-row-btn"
                                onClick={() => deleteRecord(selectedTable, row.id || row.userId || index)}
                              >
                                ✕ Delete
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Backup Tab */}
        {activeTab === 'backup' && (
          <div className="tab-content backup-tab">
            <div className="backup-section">
              <h3>Database Backup & Maintenance</h3>
              
              <div className="backup-card">
                <div className="backup-icon">💾</div>
                <div className="backup-info">
                  <h4>Create Full Backup</h4>
                  <p>Export entire database as a backup file</p>
                  <button className="backup-btn" onClick={() => exportTableAsCSV('all')}>
                    📥 Download Full Backup
                  </button>
                </div>
              </div>

              <div className="backup-card">
                <div className="backup-icon">🔄</div>
                <div className="backup-info">
                  <h4>Database Optimization</h4>
                  <p>Run VACUUM and ANALYZE commands</p>
                  <button className="backup-btn" onClick={() => {
                    alert('Database optimization scheduled. This may take a moment.');
                    apiClient.post('/admin/database/optimize');
                  }}>
                    ⚙️ Optimize Database
                  </button>
                </div>
              </div>

              <div className="backup-card">
                <div className="backup-icon">ℹ️</div>
                <div className="backup-info">
                  <h4>Database Information</h4>
                  <p>View detailed database configuration</p>
                  <div className="db-info-details">
                    <p><strong>Type:</strong> SQLite</p>
                    <p><strong>Location:</strong> server/gracewell_nexus.db</p>
                    <p><strong>Status:</strong> ✓ Active</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default AdminDatabase;
