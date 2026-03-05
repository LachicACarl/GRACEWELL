import React, { useState, useEffect } from 'react';
import Navbar from '../components/Navbar';
import './UserManagement.css';
import { apiClient } from '../utils/authService';

const UserManagement = ({ user, onLogout }) => {
  // RBAC: Super Admin-only access enforcement
  React.useEffect(() => {
    if (!user) {
      return;
    }
    
    // Allow only super_admin role
    if (user.userRole !== 'super_admin') {
      console.warn(`🚫 Access Denied: ${user.userRole} (${user.employeeCode}) attempted to access User Management`);
      window.location.href = '/';
      return;
    }
    
    console.log(`✅ User Management accessed by ${user.userRole} (${user.employeeCode})`);
  }, [user]);
  
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showPasswordConfirm, setShowPasswordConfirm] = useState(false);
  const [confirmPassword, setConfirmPassword] = useState('');
  const [confirmPasswordError, setConfirmPasswordError] = useState('');
  const [confirmPasswordLoading, setConfirmPasswordLoading] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editFormData, setEditFormData] = useState({});
  const [createFormData, setCreateFormData] = useState({
    employeeCode: '',
    role: 'employee',
    status: 'Active'
  });
  const [selectedPermissions, setSelectedPermissions] = useState([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(5);
  const [successMessage, setSuccessMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [openDropdown, setOpenDropdown] = useState(null);
  // Role filter state
  const [roleFilter, setRoleFilter] = useState('');

  // Fetch users from backend
  useEffect(() => {
    fetchUsers();
  }, []);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (openDropdown && !event.target.closest('.manage-dropdown-wrapper')) {
        setOpenDropdown(null);
      }
    };

    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, [openDropdown]);

  const fetchUsers = async () => {
    setLoading(true);
    try {
      const { data } = await apiClient.get('/users');
      setUsers(data.users || []);
    } catch (error) {
      console.error('Failed to fetch users:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateUser = async () => {
    setErrorMessage('');
    setSuccessMessage('');

    if (!createFormData.employeeCode) {
      setErrorMessage('Employee code is required');
      return;
    }

    try {
      const { data } = await apiClient.post('/users', {
        employeeCode: createFormData.employeeCode.toUpperCase(),
        role: createFormData.role.toLowerCase(),
        status: createFormData.status
      });

      if (data?.success) {
        setSuccessMessage(data.message || 'User created successfully');
        await fetchUsers();
        setShowCreateModal(false);
        setCreateFormData({ employeeCode: '', role: 'employee', status: 'Active' });
        setTimeout(() => setSuccessMessage(''), 5000);
      } else {
        setErrorMessage(data?.message || 'Failed to create user');
      }
    } catch (error) {
      console.error('Error creating user:', error);
      setErrorMessage(error?.response?.data?.message || 'Failed to create user');
    }
  };

  // Module-based permissions
  const modulePermissions = [
    {
      id: 'dashboard',
      name: 'Dashboard',
      description: 'View system dashboard and summaries',
      icon: '📊'
    },
    {
      id: 'attendance',
      name: 'Attendance',
      description: 'Manage employee attendance records',
      icon: '📅'
    },
    {
      id: 'employee_records',
      name: 'Employee Records',
      description: 'Access employee information',
      icon: '👥'
    },
    {
      id: 'payroll_salary',
      name: 'Salary',
      description: 'Manage employee salaries',
      icon: '💰'
    }
  ];

  const toggleUserStatus = async (id) => {
    const user = users.find(u => u.id === id);
    const newStatus = user.status === 'Active' ? 'Inactive' : 'Active';
    
    try {
      const { data } = await apiClient.put(`/users/${id}/status`, { status: newStatus });
      if (data?.success) {
        await fetchUsers();
      } else {
        alert(data?.message || 'Failed to update user status');
      }
    } catch (error) {
      console.error('Error updating user:', error);
      alert(error?.response?.data?.message || 'Failed to update user status');
    }
  };

  const handleEdit = (userObj) => {
    const normalized = { ...userObj, role: userObj.role.toLowerCase() };
    setEditFormData(normalized);
    const defaultPermissions = userObj.permissions || ['dashboard', 'employee_records'];
    setSelectedPermissions(defaultPermissions);
    setShowEditModal(true);
  };

  const handleSaveEdit = () => {
    setConfirmPassword('');
    setConfirmPasswordError('');
    setShowPasswordConfirm(true);
  };

  const handleConfirmSave = async () => {
    setConfirmPasswordError('');

    if (!confirmPassword.trim()) {
      setConfirmPasswordError('Password is required to save changes.');
      return;
    }
    if (confirmPassword.length < 6) {
      setConfirmPasswordError('Password must be at least 6 characters.');
      return;
    }

    setConfirmPasswordLoading(true);
    try {
      const { data } = await apiClient.put(`/users/${editFormData.id}`, {
        role: editFormData.role.toLowerCase(),
        status: editFormData.status,
        permissions: selectedPermissions,
        confirmPassword: confirmPassword
      });

      if (data?.success) {
        setShowPasswordConfirm(false);
        setShowEditModal(false);
        setConfirmPassword('');
        setSuccessMessage('User permissions updated successfully');
        await fetchUsers();
        setTimeout(() => setSuccessMessage(''), 5000);
      } else {
        setConfirmPasswordError(data?.message || 'Incorrect password. Please try again.');
      }
    } catch (error) {
      setConfirmPasswordError(
        error?.response?.data?.message || 'Incorrect password. Please try again.'
      );
    } finally {
      setConfirmPasswordLoading(false);
    }
  };

  const togglePermission = (permission) => {
    if (selectedPermissions.includes(permission)) {
      setSelectedPermissions(selectedPermissions.filter(p => p !== permission));
    } else {
      setSelectedPermissions([...selectedPermissions, permission]);
    }
  };

  // Filter users based on search query and role filter
  const filteredUsers = users.filter(u => {
    const matchesSearch = !searchQuery.trim() ||
      String(u.id || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
      String(u.username || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
      String(u.role || '').toLowerCase().includes(searchQuery.toLowerCase());
    const matchesRole = !roleFilter || u.role.toLowerCase() === roleFilter.toLowerCase();
    return matchesSearch && matchesRole;
  });

  const activeUsers = users.filter(u => u.status === 'Active').length;
  const inactiveUsers = users.filter(u => u.status === 'Inactive').length;
  const totalPages = Math.ceil(filteredUsers.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const paginatedUsers = filteredUsers.slice(startIndex, startIndex + itemsPerPage);
  const startRecord = filteredUsers.length === 0 ? 0 : startIndex + 1;
  const endRecord = Math.min(startIndex + itemsPerPage, filteredUsers.length);
  const isFirstPage = currentPage <= 1;
  const isLastPage = totalPages === 0 || currentPage >= totalPages;

  useEffect(() => {
    if (totalPages === 0 && currentPage !== 1) {
      setCurrentPage(1);
      return;
    }
    if (totalPages > 0 && currentPage > totalPages) {
      setCurrentPage(totalPages);
    }
  }, [currentPage, totalPages]);

  return (
    <div className="users-page">
      <Navbar user={user} onLogout={onLogout} />
      
      <div className="users-container">
        <div className="users-header">
          <h1>User Management</h1>
        </div>

        {successMessage && (
          <div className="success-banner">{successMessage}</div>
        )}
        {errorMessage && (
          <div className="error-banner">{errorMessage}</div>
        )}

        <div className="users-stats">
          <div className="stat-card">
            <span className="stat-label">Total Users</span>
            <span className="stat-value">{users.length}</span>
          </div>
          <div className="stat-card">
            <span className="stat-label">Active Users</span>
            <span className="stat-value active">{activeUsers}</span>
          </div>
          <div className="stat-card">
            <span className="stat-label">Inactive Users</span>
            <span className="stat-value inactive">{inactiveUsers}</span>
          </div>
        </div>

        <div className="search-section" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <div className="role-filter-container" style={{ minWidth: '180px' }}>
            <select
              className="status-filter-dropdown"
              value={roleFilter || ''}
              onChange={e => {
                setRoleFilter(e.target.value);
                setCurrentPage(1);
              }}
            >
              <option value="">All Roles</option>
              <option value="employee">Employee</option>
              <option value="admin">Admin</option>
              <option value="super_admin">Super Admin</option>
            </select>
          </div>
          <div className="search-container" style={{ flex: 1 }}>
            <input
              type="text"
              className="search-input"
              placeholder="Search by User ID, Username, or Role..."
              value={searchQuery}
              onChange={e => {
                setSearchQuery(e.target.value);
                setCurrentPage(1);
              }}
            />
            <span className="search-icon">🔍</span>
          </div>
        </div>

        <div className="table-wrapper">
          <table className="users-table">
          <thead>
            <tr>
              <th>User ID</th>
              <th>Username</th>
              <th>Role</th>
              <th>Status</th>
              <th>Last Login</th>
              <th>Permissions</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td colSpan="7" className="text-center">Loading users...</td>
              </tr>
            )}
            {!loading && users.length === 0 && (
              <tr>
                <td colSpan="7" className="text-center">No users found</td>
              </tr>
            )}
            {!loading && paginatedUsers.map((u) => (
              <tr key={u.id}>
                <td>{u.id}</td>
                <td className="username">{u.username}</td>
                <td>
                  <span className={`role-badge role-${u.role.toLowerCase()}`}>
                    {u.role.toLowerCase() === 'admin' && <span>👑</span>}
                    {u.role.toLowerCase() === 'employee' && <span>👤</span>}
                    {u.role}
                  </span>
                </td>
                <td>
                  <span className={`status-badge ${u.status.toLowerCase()}`}>
                    {u.status}
                  </span>
                </td>
                <td>{u.lastLogin}</td>
                <td className="permissions-cell">
                  <span className="permission-count">{u.permissions.length} permissions</span>
                </td>
                <td>
                  <div className="manage-dropdown-wrapper">
                    <button
                      type="button"
                      className="table-split-btn"
                      onClick={() => setOpenDropdown(openDropdown === u.id ? null : u.id)}
                    >
                      <span className="table-split-btn__label">Manage</span>
                      <span className="table-split-btn__divider" />
                      <span className="table-split-btn__arrow" aria-label="Manage user actions">▾</span>
                    </button>
                    {openDropdown === u.id && (
                      <div className="manage-dropdown-menu">
                        <button 
                          className="dropdown-item"
                          onClick={() => {
                            handleEdit(u);
                            setOpenDropdown(null);
                          }}
                        >
                          Edit
                        </button>
                        <button 
                          className="dropdown-item"
                          onClick={() => {
                            toggleUserStatus(u.id);
                            setOpenDropdown(null);
                          }}
                        >
                          {u.status === 'Active' ? 'Deactivate' : 'Activate'}
                        </button>
                      </div>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>

        <div className="records-pagination">
          <div className="records-pagination__count">
            Showing {startRecord}-{endRecord} of {users.length} records
          </div>
          <div className="records-pagination__controls">
            <button
              className="page-icon-btn"
              onClick={() => setCurrentPage(1)}
              disabled={isFirstPage}
              aria-label="First page"
            >
              {'<<'}
            </button>
            <button
              className="page-icon-btn"
              onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
              disabled={isFirstPage}
              aria-label="Previous page"
            >
              {'<'}
            </button>
            <div className="page-numbers">
              {Array.from({ length: totalPages }, (_, i) => i + 1).map(page => (
                <button
                  key={page}
                  className={`page-num ${currentPage === page ? 'active' : ''}`}
                  onClick={() => setCurrentPage(page)}
                >
                  {page}
                </button>
              ))}
            </div>
            <button
              className="page-icon-btn"
              onClick={() => setCurrentPage(Math.min(totalPages, currentPage + 1))}
              disabled={isLastPage}
              aria-label="Next page"
            >
              {'>'}
            </button>
            <button
              className="page-icon-btn"
              onClick={() => setCurrentPage(totalPages)}
              disabled={isLastPage}
              aria-label="Last page"
            >
              {'>>'}
            </button>
          </div>
          <div className="records-pagination__size">
            <span>Items per page:</span>
            <select
              value={itemsPerPage}
              onChange={(e) => {
                setItemsPerPage(Number(e.target.value));
                setCurrentPage(1);
              }}
            >
              {[5, 10, 20, 50].map((size) => (
                <option key={size} value={size}>{size}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Edit User Permissions Modal */}
      {showEditModal && editFormData && (
        <div className="modal-overlay" onClick={() => setShowEditModal(false)}>
          <div className="modal-content permissions-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div className="modal-title-section">
                <h2>Edit User Permissions</h2>
                <p className="modal-subtitle">Configure access permissions for {editFormData.username}</p>
              </div>
              <button className="close-btn" onClick={() => setShowEditModal(false)}>×</button>
            </div>
            
            <div className="modal-body">
              {/* User Info Section */}
              <div className="user-info-card">
                <div className="user-avatar">
                  {editFormData.avatarUrl || editFormData.photoUrl || editFormData.profilePhoto ? (
                    <img
                      className="user-avatar-image"
                      src={editFormData.avatarUrl || editFormData.photoUrl || editFormData.profilePhoto}
                      alt={`${editFormData.username || 'User'} avatar`}
                    />
                  ) : (
                    editFormData.username?.charAt(0).toUpperCase() || 'U'
                  )}
                </div>
                <div className="user-details">
                  <h3 className="user-name">{editFormData.username}</h3>
                  <p className="user-email">{editFormData.email || `${editFormData.id}@trucking.com`}</p>
                  <p className="user-department">{editFormData.role}</p>
                </div>
              </div>


              {/* Role Promotion Dropdown */}
              {(editFormData.role?.toLowerCase() === 'employee' || editFormData.role?.toLowerCase() === 'admin') && (
                <div
                  className="form-group"
                  style={{
                    marginBottom: '1.5rem',
                    background: '#f6f8ff',
                    padding: '1rem',
                    borderRadius: '8px',
                    border: '1px solid #dbeafe',
                  }}
                >
                  <label
                    style={{ fontWeight: 600, marginBottom: 6, display: 'block' }}
                  >
                    Promote Role
                  </label>
                  <select
                    value={editFormData.role}
                    onChange={e => setEditFormData({ ...editFormData, role: e.target.value })}
                    className="form-input"
                    style={{
                      width: '100%',
                      padding: '0.5rem',
                      borderRadius: '6px',
                      border: '1px solid #c7d2fe',
                      fontSize: '1rem',
                    }}
                  >
                    {editFormData.role === 'employee' && (
                      <>
                        <option value="employee">Employee (current)</option>
                        <option value="admin">Admin</option>
                        <option value="super_admin">Super Admin</option>
                      </>
                    )}
                    {editFormData.role === 'admin' && (
                      <>
                        <option value="admin">Admin (current)</option>
                        <option value="super_admin">Super Admin</option>
                      </>
                    )}
                  </select>
                  <small
                    className="form-note"
                    style={{ color: '#6366f1' }}
                  >
                    Promotion only. Demotion is not allowed.
                  </small>
                </div>
              )}

              {/* Module Access — only for admin and super_admin */}
              {(editFormData.role?.toLowerCase() === 'admin' || editFormData.role?.toLowerCase() === 'super_admin') && (
                <div className="permissions-section">
                  <h3 className="section-title">Module Access</h3>
                  <div className="modules-list">
                    {modulePermissions.map(module => (
                      <label key={module.id} className="module-item">
                        <input
                          type="checkbox"
                          checked={selectedPermissions.includes(module.id)}
                          onChange={() => togglePermission(module.id)}
                          className="module-checkbox"
                        />
                        <div className="module-content">
                          <div className="module-icon" aria-hidden="true">{module.icon}</div>
                          <div className="module-text">
                            <div className="module-name">{module.name}</div>
                            <p className="module-description">{module.description}</p>
                          </div>
                        </div>
                      </label>
                    ))}
                  </div>
                </div>
              )}

              {/* Employee — no module access, only promotion available */}
              {editFormData.role?.toLowerCase() === 'employee' && (
                <div
                  style={{
                    padding: '1rem',
                    background: '#fef9c3',
                    borderRadius: '8px',
                    border: '1px solid #fde68a',
                    color: '#92400e',
                    fontSize: '0.9rem',
                  }}
                >
                  ⚠️ Employees don't have configurable module access. Promote the user to Admin or Super Admin to manage their permissions.
                </div>
              )}



              {/* Selected Permissions Summary */}
              <div className="permissions-summary">
                <div className="summary-header">
                  <span className="summary-title">Selected Permissions:</span>
                  <span className="summary-count">{selectedPermissions.length} of {modulePermissions.length}</span>
                </div>
                <div className="permission-tags">
                  {selectedPermissions.map(permId => {
                    const module = modulePermissions.find(m => m.id === permId);
                    return module ? (
                      <span key={permId} className="permission-tag">
                        {module.name}
                      </span>
                    ) : null;
                  })}
                  {selectedPermissions.length === 0 && (
                    <span className="no-permissions-text">No modules selected</span>
                  )}
                </div>
              </div>
            </div>

            <div className="modal-footer">
              <button className="btn-cancel" onClick={() => setShowEditModal(false)}>
                Back
              </button>
              <button className="btn-submit" onClick={handleSaveEdit}>
                Save Changes
              </button>
            </div>
          </div>
        </div>
      )}


      {/* Create User Modal (Super Admin Only) */}
      {showCreateModal && (
        <div className="modal-overlay" onClick={() => setShowCreateModal(false)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Create New User</h2>
              <button className="close-btn" onClick={() => setShowCreateModal(false)}>×</button>
            </div>
            <div className="modal-body">
              <div className="form-group">
                <label>Employee Code</label>
                <input
                  type="text"
                  value={createFormData.employeeCode}
                  onChange={e => setCreateFormData({ ...createFormData, employeeCode: e.target.value.toUpperCase() })}
                  placeholder="e.g., GW001, GW002, GW003"
                  className="form-input"
                />
                <small className="form-note">Enter an existing employee's GW code (e.g., GW001) to create their user account</small>
              </div>
              <div className="form-group">
                <label>Role</label>
                <select
                  value={createFormData.role}
                  onChange={e => setCreateFormData({ ...createFormData, role: e.target.value })}
                  className="form-input"
                >
                  <option value="employee">Employee</option>
                  <option value="admin">Admin</option>
                  <option value="super_admin">Super Admin</option>
                </select>
              </div>
              <div className="form-group">
                <label>Account Status</label>
                <select
                  value={createFormData.status}
                  onChange={e => setCreateFormData({ ...createFormData, status: e.target.value })}
                  className="form-input"
                >
                  <option value="Active">Active</option>
                  <option value="Inactive">Inactive</option>
                </select>
              </div>
              {errorMessage && <div className="error-message">{errorMessage}</div>}
              <div className="info-box">
                <strong>ℹ️ Default Password:</strong> Welcome123!<br />
                <small>User will be prompted to change password on first login</small>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn-cancel" onClick={() => setShowCreateModal(false)}>
                Cancel
              </button>
              <button className="btn-submit" onClick={handleCreateUser}>
                Create User
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Password Confirmation Modal */}
      {showPasswordConfirm && (
        <div
          className="modal-overlay"
          onClick={() => {
            setShowPasswordConfirm(false);
            setConfirmPasswordError('');
            setConfirmPassword('');
          }}
        >
          <div
            className="modal-content"
            style={{ maxWidth: '420px' }}
            onClick={e => e.stopPropagation()}
          >
            <div className="modal-header">
              <div className="modal-title-section">
                <h2>Confirm Changes</h2>
                <p className="modal-subtitle">
                  Enter your password to apply these changes
                </p>
              </div>
              <button
                className="close-btn"
                onClick={() => {
                  setShowPasswordConfirm(false);
                  setConfirmPasswordError('');
                  setConfirmPassword('');
                }}
              >
                ×
              </button>
            </div>

            <div className="modal-body" style={{ padding: '28px 32px' }}>
              <div
                style={{
                  background: '#fff7ed',
                  border: '1px solid #fed7aa',
                  borderLeft: '4px solid #f97316',
                  borderRadius: '8px',
                  padding: '14px 16px',
                  marginBottom: '24px',
                  fontSize: '13px',
                  color: '#9a3412',
                  fontWeight: 500,
                  lineHeight: 1.6,
                }}
              >
                ⚠️ You are about to modify <strong>role or permissions</strong> for{' '}
                <strong>{editFormData?.username}</strong>. This action cannot be undone without manual reversal.
              </div>

              <div className="form-group" style={{ marginBottom: '6px' }}>
                <label
                  style={{
                    fontWeight: 700,
                    fontSize: '14px',
                    marginBottom: '8px',
                    display: 'block',
                  }}
                >
                  Your Password
                </label>
                <input
                  type="password"
                  className="form-input"
                  placeholder="Enter your password"
                  value={confirmPassword}
                  onChange={e => {
                    setConfirmPassword(e.target.value);
                    if (confirmPasswordError) setConfirmPasswordError('');
                  }}
                  onKeyDown={e => {
                    if (e.key === 'Enter') handleConfirmSave();
                  }}
                  style={{
                    borderColor: confirmPasswordError ? '#ef4444' : undefined,
                    boxShadow: confirmPasswordError
                      ? '0 0 0 3px rgba(239,68,68,0.1)'
                      : undefined,
                  }}
                  autoFocus
                />
                {confirmPasswordError && (
                  <span
                    style={{
                      color: '#dc2626',
                      fontSize: '12px',
                      fontWeight: 600,
                      marginTop: '6px',
                      display: 'block',
                    }}
                  >
                    ⛔ {confirmPasswordError}
                  </span>
                )}
              </div>
            </div>

            <div className="modal-footer">
              <button
                className="btn-cancel"
                onClick={() => {
                  setShowPasswordConfirm(false);
                  setConfirmPasswordError('');
                  setConfirmPassword('');
                }}
                disabled={confirmPasswordLoading}
              >
                Cancel
              </button>
              <button
                className="btn-submit"
                onClick={handleConfirmSave}
                disabled={confirmPasswordLoading}
                style={{ opacity: confirmPasswordLoading ? 0.7 : 1 }}
              >
                {confirmPasswordLoading ? 'Verifying...' : 'Confirm & Save'}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};

export default UserManagement;