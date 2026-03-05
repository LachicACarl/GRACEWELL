import React, { useState, useEffect } from 'react';
import Navbar from '../components/Navbar';
import './EmployeeRecords.css';
import { apiClient } from '../utils/authService';

const EmployeeRecords = ({ user, onLogout }) => {
  // RBAC per Gracewell NEXUS: Admin can edit. Manager can view. Employee read-only.
  const canEditRecords = user?.userRole === 'admin' || user?.userRole === 'super_admin';
  const canViewRecords = ['admin', 'super_admin', 'manager'].includes(user?.userRole);
  const [searchTerm, setSearchTerm] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [departmentFilter, setDepartmentFilter] = useState('All');
  const [statusFilter, setStatusFilter] = useState('All');
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(false);

  const formatStatus = (value) => {
    return String(value || 'active').toLowerCase() === 'inactive' ? 'Inactive' : 'Active';
  };

  const parseName = (fullName) => {
    if (!fullName) return { firstName: '', middleName: '', lastName: '' };
    
    const parts = fullName.trim().split(/\s+/);
    
    if (parts.length === 1) {
      return { firstName: parts[0], middleName: '', lastName: '' };
    } else if (parts.length === 2) {
      return { firstName: parts[0], middleName: '', lastName: parts[1] };
    } else {
      // 3 or more parts: first, middle(s), last
      return {
        firstName: parts[0],
        middleName: parts.slice(1, -1).join(' '),
        lastName: parts[parts.length - 1]
      };
    }
  };

  const buildName = (firstName, middleName, lastName) => {
    return [firstName, middleName, lastName].map((value) => value?.trim()).filter(Boolean).join(' ');
  };

  // Fetch employees from backend
  useEffect(() => {
    fetchEmployees();
  }, [departmentFilter, statusFilter]);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (!event.target.closest('.action-manage-wrapper')) {
        setOpenDropdownId(null);
      }
    };
    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, []);

  const fetchEmployees = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (departmentFilter !== 'All') params.append('department', departmentFilter);
      if (statusFilter !== 'All') params.append('status', statusFilter);

      const { data } = await apiClient.get(`/employees?${params.toString()}`);
      
      const transformed = (data.employees || []).map(e => ({
        id: e.employee_id,
        name: e.name,
        position: e.position || e.role,
        department: e.department || 'N/A',
        status: formatStatus(e.status),
        joinDate: e.created_at ? e.created_at.split('T')[0] : '',
        email: e.email,
        phone: e.phone || e.contact_number || '555-0000'
      }));
      
      setEmployees(transformed);
    } catch (error) {
      console.error('Failed to fetch employees:', error);
    } finally {
      setLoading(false);
    }
  };

  const [showViewModal, setShowViewModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showQrModal, setShowQrModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [openDropdownId, setOpenDropdownId] = useState(null);
  const [employeeToDelete, setEmployeeToDelete] = useState(null);
  const [qrPayload, setQrPayload] = useState({ employeeId: '', qrImageUrl: '' });
  const [addStep, setAddStep] = useState(1);
  const [selectedEmployee, setSelectedEmployee] = useState(null);
  const [editFormData, setEditFormData] = useState({});
  const [newEmployeeErrors, setNewEmployeeErrors] = useState({});
  const [editErrors, setEditErrors] = useState({});
  const [newEmployee, setNewEmployee] = useState({
    name: '',
    firstName: '',
    middleName: '',
    lastName: '',
    contactNumber: '',
    address: '',
    email: '',
    birthdate: '',
    idPhotoName: '',
    idPhotoFile: null,
    employeeId: '',
    position: '',
    department: '',
    joinDate: '',
    status: 'Active',
    salary: '',
    phone: ''
  });

  const clearNewEmployeeError = (field) => {
    setNewEmployeeErrors((prev) => {
      if (!prev[field]) return prev;
      return { ...prev, [field]: '' };
    });
  };

  const clearEditError = (field) => {
    setEditErrors((prev) => {
      if (!prev[field]) return prev;
      return { ...prev, [field]: '' };
    });
  };

  const [itemsPerPage, setItemsPerPage] = useState(5);
  const filteredEmployees = employees.filter(emp => {
    const matchesSearch = emp.id.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         emp.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         emp.email.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesDepartment = departmentFilter === 'All' || emp.department === departmentFilter;
    const matchesStatus = statusFilter === 'All' || emp.status === statusFilter;
    
    return matchesSearch && matchesDepartment && matchesStatus;
  });

  const totalPages = Math.ceil(filteredEmployees.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const paginatedEmployees = filteredEmployees.slice(startIndex, startIndex + itemsPerPage);
  const startRecord = filteredEmployees.length === 0 ? 0 : startIndex + 1;
  const endRecord = Math.min(startIndex + itemsPerPage, filteredEmployees.length);
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

  const handleView = (employee) => {
    setSelectedEmployee(employee);
    setShowViewModal(true);
  };

  const handleEdit = (employee) => {
    setSelectedEmployee(employee);
    const nameParts = parseName(employee.name);
    setEditFormData({ ...employee, ...nameParts });
    setEditErrors({});
    setShowEditModal(true);
  };

  const handleViewQr = (employee) => {
    const qrImageUrl = `https://api.qrserver.com/v1/create-qr-code/?size=320x320&data=${encodeURIComponent(employee.id)}`;
    setQrPayload({ employeeId: employee.id, qrImageUrl });
    setShowQrModal(true);
  };

  const handleSaveEdit = async () => {
    const errors = {};
    const firstName = (editFormData.firstName || '').trim();
    const middleName = (editFormData.middleName || '').trim();
    const lastName = (editFormData.lastName || '').trim();
    const email = (editFormData.email || '').trim();

    if (!firstName) errors.firstName = 'Required';
    if (!lastName) errors.lastName = 'Required';
    if (!editFormData.position) errors.position = 'Required';
    if (!email) errors.email = 'Required';
    if (email && !isValidEmail(email)) errors.email = 'Invalid format';

    if (Object.keys(errors).length > 0) {
      setEditErrors(errors);
      alert('Please complete all required fields and fix invalid inputs.');
      return;
    }

    try {
      const fullName = buildName(firstName, middleName, lastName);
      const { data } = await apiClient.put(`/employees/${editFormData.id}`, {
        name: fullName,
        email: email,
        department: editFormData.department,
        position: editFormData.position,
        phone: editFormData.phone
      });

      if (data?.success) {
        await fetchEmployees();
        setShowEditModal(false);
        setSelectedEmployee(null);
      } else {
        alert(data?.message || 'Failed to update employee');
      }
    } catch (error) {
      console.error('Update error:', error);
      alert('Failed to update employee');
    }
  };

  const updateNewEmployeeName = (updates) => {
    const next = { ...newEmployee, ...updates };
    next.name = buildName(next.firstName, next.middleName, next.lastName);
    setNewEmployee(next);
  };

  const validateAddStepOne = () => {
    const missingFields = [];
    const errors = {};
    if (!newEmployee.firstName) missingFields.push('First Name');
    if (!newEmployee.firstName) errors.firstName = 'Required';

    if (!newEmployee.lastName) {
      missingFields.push('Last Name');
      errors.lastName = 'Required';
    }

    if (!newEmployee.contactNumber) {
      missingFields.push('Contact Number');
      errors.contactNumber = 'Required';
    }

    if (!newEmployee.address) {
      missingFields.push('Permanent Address');
      errors.address = 'Required';
    }

    if (!newEmployee.email) {
      missingFields.push('Email');
      errors.email = 'Required';
    }

    if (!newEmployee.birthdate) {
      missingFields.push('Birthdate');
      errors.birthdate = 'Required';
    }

    if (!newEmployee.idPhotoName) {
      missingFields.push('ID Photo');
      errors.idPhotoName = 'Required';
    }

    if (missingFields.length > 0) {
      setNewEmployeeErrors(errors);
      alert(`Please fill up: ${missingFields.join(', ')}.`);
      return false;
    }

    if (!isValidEmail(newEmployee.email)) {
      setNewEmployeeErrors({ ...errors, email: 'Invalid format' });
      alert('Please enter a valid email address.');
      return false;
    }

    if (!/^09\d{9}$/.test(newEmployee.contactNumber)) {
      setNewEmployeeErrors({ ...errors, contactNumber: 'Invalid format' });
      alert('Contact number must be 11 digits and start with 09.');
      return false;
    }
    setNewEmployeeErrors({});
    return true;
  };

  const handleNextAddStep = () => {
    if (validateAddStepOne()) {
      setAddStep(2);
    }
  };

  const handleBackAddStep = () => {
    setAddStep(1);
  };

  const isValidEmail = (value) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);

  const handleEmailChange = (e) => {
    const value = e.target.value;
    setNewEmployee({ ...newEmployee, email: value });
    if (!value.trim()) {
      clearNewEmployeeError('email');
      return;
    }
    setNewEmployeeErrors((prev) => ({
      ...prev,
      email: isValidEmail(value) ? '' : 'Invalid format'
    }));
  };

  const handleContactNumberChange = (e) => {
    const digitsOnly = e.target.value.replace(/\D/g, '').slice(0, 11);
    clearNewEmployeeError('contactNumber');
    setNewEmployee({
      ...newEmployee,
      contactNumber: digitsOnly
    });
  };

  const handleAddEmployee = async () => {
    const fullName = buildName(newEmployee.firstName, newEmployee.middleName, newEmployee.lastName);
    const missingFields = [];
    const errors = {};
    if (!newEmployee.employeeId) missingFields.push('Employee ID Number');
    if (!newEmployee.employeeId) errors.employeeId = 'Required';

    if (!newEmployee.department) {
      missingFields.push('Department');
      errors.department = 'Required';
    }

    if (!newEmployee.position) {
      missingFields.push('Position');
      errors.position = 'Required';
    }

    if (!newEmployee.joinDate) {
      missingFields.push('Join Date');
      errors.joinDate = 'Required';
    }

    if (!newEmployee.salary) {
      missingFields.push('Annual Salary');
      errors.salary = 'Required';
    }

    if (!fullName) {
      missingFields.push('Employee Name');
      errors.firstName = 'Required';
      errors.lastName = 'Required';
    }

    if (!newEmployee.email) {
      missingFields.push('Email');
      errors.email = 'Required';
    }

    if (missingFields.length > 0) {
      setNewEmployeeErrors(errors);
      alert(`Please fill up: ${missingFields.join(', ')}.`);
      return;
    }
    setNewEmployeeErrors({});

    try {
      const formData = new FormData();
      formData.append('employeeId', newEmployee.employeeId.trim());
      formData.append('name', fullName);
      formData.append('email', newEmployee.email);
      formData.append('role', 'employee');
      formData.append('department', newEmployee.department);
      formData.append('position', newEmployee.position);
      formData.append('phone', newEmployee.phone || newEmployee.contactNumber);
      formData.append('contactNumber', newEmployee.contactNumber);
      formData.append('birthdate', newEmployee.birthdate || '');
      formData.append('address', newEmployee.address || '');
      formData.append('salary', newEmployee.salary || '');
      formData.append('joinDate', newEmployee.joinDate || '');

      if (newEmployee.idPhotoFile) {
        formData.append('photo', newEmployee.idPhotoFile);
      }

      const { data } = await apiClient.post('/employees', formData);

      if (data?.success) {
        await fetchEmployees();
        setShowAddModal(false);
        setAddStep(1);
        setNewEmployeeErrors({});
        const employeeCode = newEmployee.employeeId.trim();
        setNewEmployee({
          name: '',
          firstName: '',
          middleName: '',
          lastName: '',
          contactNumber: '',
          address: '',
          email: '',
          birthdate: '',
          idPhotoName: '',
          idPhotoFile: null,
          employeeId: '',
          position: '',
          department: '',
          joinDate: '',
          status: 'Active',
          salary: '',
          phone: ''
        });
        // Backend now returns consistent QR image URL
        const qrImageUrl = data.qrImageUrl;
        setQrPayload({ employeeId: employeeCode, qrImageUrl });
        setShowQrModal(true);
      } else {
        alert(data?.message || 'Failed to add employee');
      }
    } catch (error) {
      console.error('Add employee error:', error);
      alert(error?.response?.data?.message || 'Failed to add employee');
    }
  };

  const handleDeactivateEmployee = async (id) => {
    if (window.confirm('Deactivate this employee? They will remain in the list but marked as Inactive.')) {
      try {
        const employee = employees.find(e => e.id === id);
        const { data } = await apiClient.put(`/employees/${id}`, {
          name: employee.name,
          email: employee.email,
          role: 'employee',
          department: employee.department,
          status: 'inactive',
          position: employee.position,
          phone: employee.phone
        });

        if (data?.success) {
          await fetchEmployees();
          setShowViewModal(false);
          alert('Employee marked as inactive');
        } else {
          alert(data?.message || 'Failed to deactivate employee');
        }
      } catch (error) {
        console.error('Deactivate error:', error);
        alert('Failed to deactivate employee');
      }
    }
  };

  const openDeleteModal = (employee) => {
    setEmployeeToDelete(employee);
    setShowDeleteModal(true);
  };

  const closeDeleteModal = () => {
    setEmployeeToDelete(null);
    setShowDeleteModal(false);
  };

  const handleDeleteEmployee = async () => {
    if (!employeeToDelete) return;

    try {
      const { data } = await apiClient.delete(`/employees/${employeeToDelete.id}`);
      
      if (data?.success) {
        await fetchEmployees();
        closeDeleteModal();
        setShowViewModal(false);
        alert('Employee deleted successfully');
      } else {
        alert(data?.message || 'Failed to delete employee');
      }
    } catch (error) {
      console.error('Delete error:', error);
      const errorMessage = error?.response?.data?.message || 'Failed to delete employee';
      alert(errorMessage);
    }
  };

  const downloadQrImage = async (url, employeeId) => {
    if (!url) return;
    try {
      const response = await fetch(url, { mode: 'cors' });
      const blob = await response.blob();
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = `${employeeId || 'employee'}-qr.png`;
      document.body.appendChild(link);
      link.click();
      URL.revokeObjectURL(link.href);
      document.body.removeChild(link);
    } catch (error) {
      console.error('Failed to download QR code:', error);
      alert('Failed to download QR code. Please try again.');
    }
  };

  const generateEmployeeIdFrom = (list) => {
    const gwIds = (list || [])
      .map((emp) => String(emp.employee_code || emp.employee_id || emp.employeeId || ''))
      .map((code) => {
        // Match the GW format (GW001)
        const match = code.match(/^GW(\d+)$/i);
        return match ? parseInt(match[1], 10) : null;
      })
      .filter((value) => Number.isInteger(value));

    console.log('[EmployeeRecords] Extracted GW IDs:', gwIds);

    // Start from GW005 minimum (GW001-GW004 reserved for admin accounts)
    const maxExisting = gwIds.length ? Math.max(...gwIds) : 4;
    const nextNumber = Math.max(maxExisting + 1, 5);
    
    console.log('[EmployeeRecords] Max existing GW number:', maxExisting, '→ Next number:', nextNumber);
    
    return `GW${String(nextNumber).padStart(3, '0')}`;
  };

  const getNextAvailableEmployeeId = async () => {
    try {
      // Fetch ALL employees to find the max GW number system-wide
      // Using limit=1000 to get as many as possible (adjust if needed)
      // Add timestamp to prevent caching
      const { data } = await apiClient.get(`/employees?limit=1000&_t=${Date.now()}`);
      const allEmployees = data?.employees || [];
      console.log(`[EmployeeRecords] Found ${allEmployees.length} total employees for ID generation`);
      const nextId = generateEmployeeIdFrom(allEmployees);
      console.log(`[EmployeeRecords] Generated next employee ID: ${nextId}`);
      return nextId;
    } catch (error) {
      console.error('[EmployeeRecords] Failed to fetch all employees for ID generation:', error);
      // Fallback: use employees currently in state
      return generateEmployeeIdFrom(employees);
    }
  };

  const handleOpenAddModal = async () => {
    setNewEmployeeErrors({});
    setAddStep(1);
    
    // Generate fresh ID before showing modal
    const generatedId = await getNextAvailableEmployeeId();
    setNewEmployee((prev) => ({ 
      ...prev, 
      employeeId: generatedId,
      // Reset other fields to ensure clean state
      name: '',
      firstName: '',
      middleName: '',
      lastName: '',
      email: '',
      department: '',
      position: '',
      contactNumber: '',
      phone: '',
      birthdate: '',
      address: '',
      salary: '',
      joinDate: '',
      idPhotoPreview: null,
      idPhotoFile: null
    }));
    
    setShowAddModal(true);
  };

  return (
    <div className="records-page">
      <Navbar user={user} onLogout={onLogout} />
      
      <div className="records-container">
        <div className="records-header">
          <h1>Employee Records</h1>
          {(user?.userRole === 'admin' || user?.userRole === 'super_admin') && (
            <button className="add-employee-btn" onClick={handleOpenAddModal}>+ Add New Employee</button>
          )}
        </div>

        <div className="search-box">
          <input
            type="text"
            placeholder="Search by Employee ID, Name, or Email..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
          <span className="search-icon">🔍</span>
        </div>

        <div className="filters-section">
          <div className="filter-group">
            <label>Department</label>
            <select 
              value={departmentFilter}
              onChange={(e) => {
                setDepartmentFilter(e.target.value);
                setCurrentPage(1);
              }}
              className="filter-select"
            >
              <option>All</option>
              <option>IT</option>
              <option>Operation</option>
              <option>Finance</option>
            </select>
          </div>

          <div className="filter-group">
            <label>Status</label>
            <select 
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value);
                setCurrentPage(1);
              }}
              className="filter-select"
            >
              <option>All</option>
              <option>Active</option>
              <option>Inactive</option>
            </select>
          </div>
        </div>

        <table className="records-table">
          <thead>
            <tr>
              <th>Employee ID</th>
              <th>Name</th>
              <th>Position</th>
              <th>Department</th>
              <th>Join Date</th>
              <th>Status</th>
              <th>Email</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {paginatedEmployees.map((employee) => (
              <tr key={employee.id} className={openDropdownId === employee.id ? 'dropdown-active' : ''}>
                <td className="emp-id">{employee.id}</td>
                <td className="emp-name">{employee.name}</td>
                <td>{employee.position}</td>
                <td>{employee.department}</td>
                <td>{new Date(employee.joinDate).toLocaleDateString()}</td>
                <td>
                  <span className={`status-badge ${employee.status.toLowerCase()}`}>
                    {employee.status}
                  </span>
                </td>
                <td className="emp-email">{employee.email}</td>
                <td>
                  <div className="action-manage-wrapper">
                    <button
                      type="button"
                      className="table-split-btn"
                      onClick={() => setOpenDropdownId(openDropdownId === employee.id ? null : employee.id)}
                    >
                      <span className="table-split-btn__label">Manage</span>
                      <span className="table-split-btn__divider" />
                      <span className="table-split-btn__arrow" aria-label="Manage employee actions">▾</span>
                    </button>
                    {openDropdownId === employee.id && (
                      <div className="manage-dropdown">
                        {user?.userRole === 'super_admin' ? (
                          // Super Admin: Full access (same as admin)
                          <>
                            <button
                              className="dropdown-item view-item"
                              onClick={() => {
                                handleView(employee);
                                setOpenDropdownId(null);
                              }}
                            >
                              View
                            </button>
                            <button
                              className="dropdown-item edit-item"
                              onClick={() => {
                                handleEdit(employee);
                                setOpenDropdownId(null);
                              }}
                            >
                              Edit
                            </button>
                            <button
                              className="dropdown-item qr-item"
                              onClick={() => {
                                handleViewQr(employee);
                                setOpenDropdownId(null);
                              }}
                            >
                              View QR
                            </button>
                            <button
                              className="dropdown-item deactivate-item"
                              onClick={() => {
                                handleDeactivateEmployee(employee.id);
                                setOpenDropdownId(null);
                              }}
                            >
                              Deactivate Account
                            </button>
                          </>
                        ) : user?.userRole === 'admin' ? (
                          // Admin: Full access
                          <>
                            <button
                              className="dropdown-item view-item"
                              onClick={() => {
                                handleView(employee);
                                setOpenDropdownId(null);
                              }}
                            >
                              View
                            </button>
                            <button
                              className="dropdown-item edit-item"
                              onClick={() => {
                                handleEdit(employee);
                                setOpenDropdownId(null);
                              }}
                            >
                              Edit
                            </button>
                            <button
                              className="dropdown-item qr-item"
                              onClick={() => {
                                handleViewQr(employee);
                                setOpenDropdownId(null);
                              }}
                            >
                              View QR
                            </button>
                            <button
                              className="dropdown-item deactivate-item"
                              onClick={() => {
                                handleDeactivateEmployee(employee.id);
                                setOpenDropdownId(null);
                              }}
                            >
                              Deactivate Account
                            </button>
                          </>
                        ) : (
                          // Manager: View and View QR
                          <>
                            <button
                              className="dropdown-item view-item"
                              onClick={() => {
                                handleView(employee);
                                setOpenDropdownId(null);
                              }}
                            >
                              View
                            </button>
                            <button
                              className="dropdown-item qr-item"
                              onClick={() => {
                                handleViewQr(employee);
                                setOpenDropdownId(null);
                              }}
                            >
                              View QR
                            </button>
                          </>
                        )}
                      </div>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {filteredEmployees.length === 0 && (
          <div className="no-results">No employees found matching your search.</div>
        )}

        <div className="records-pagination">
          <div className="records-pagination__count">
            Showing {startRecord}-{endRecord} of {filteredEmployees.length} records
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

      {/* View Modal */}
      {showViewModal && selectedEmployee && (
        <div className="modal-overlay" onClick={() => setShowViewModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Employee Details</h2>
              <button className="close-btn" onClick={() => setShowViewModal(false)}>×</button>
            </div>
            <div className="modal-body">
              <div className="detail-section">
                <p><strong>Employee ID:</strong> {selectedEmployee.id}</p>
                <p><strong>Name:</strong> {selectedEmployee.name}</p>
                <p><strong>Position:</strong> {selectedEmployee.position}</p>
                <p><strong>Department:</strong> {selectedEmployee.department}</p>
                <p><strong>Join Date:</strong> {new Date(selectedEmployee.joinDate).toLocaleDateString()}</p>
                <p><strong>Email:</strong> {selectedEmployee.email}</p>
                <p><strong>Phone:</strong> {selectedEmployee.phone}</p>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn-close" onClick={() => setShowViewModal(false)}>Close</button>
              {user?.userRole === 'admin' && (
                <>
                  <button
                    className="btn-deactivate"
                    onClick={() => {
                      handleDeactivateEmployee(selectedEmployee?.id);
                      setShowViewModal(false);
                    }}
                  >
                    Deactivate Employee
                  </button>
                  <button
                    className="btn-delete"
                    onClick={() => {
                      openDeleteModal(selectedEmployee);
                    }}
                  >
                    Delete Employee
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Edit Modal */}
      {showEditModal && editFormData && (
        <div className="modal-overlay" onClick={() => setShowEditModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Edit Employee Information</h2>
              <button className="close-btn" onClick={() => setShowEditModal(false)}>×</button>
            </div>
            <div className="modal-body">
              <div className="form-group">
                <label>Employee ID (Read-only)</label>
                <input type="text" value={editFormData.id} disabled className="form-input" />
              </div>
              <div className="form-group">
                <label>First Name *</label>
                <input
                  type="text"
                  value={editFormData.firstName || ''}
                  onChange={(e) => {
                    clearEditError('firstName');
                    setEditFormData({ ...editFormData, firstName: e.target.value });
                  }}
                  className={`form-input ${editErrors.firstName ? 'input-error' : ''}`}
                />
              </div>
              <div className="form-group">
                <label>Middle Name</label>
                <input
                  type="text"
                  value={editFormData.middleName || ''}
                  onChange={(e) => setEditFormData({ ...editFormData, middleName: e.target.value })}
                  className="form-input"
                />
              </div>
              <div className="form-group">
                <label>Last Name *</label>
                <input
                  type="text"
                  value={editFormData.lastName || ''}
                  onChange={(e) => {
                    clearEditError('lastName');
                    setEditFormData({ ...editFormData, lastName: e.target.value });
                  }}
                  className={`form-input ${editErrors.lastName ? 'input-error' : ''}`}
                />
              </div>
              <div className="form-group">
                <label>Position *</label>
                <input
                  type="text"
                  value={editFormData.position}
                  onChange={(e) => {
                    clearEditError('position');
                    setEditFormData({ ...editFormData, position: e.target.value });
                  }}
                  className={`form-input ${editErrors.position ? 'input-error' : ''}`}
                />
              </div>
              <div className="form-group">
                <label>Department</label>
                <select
                  value={editFormData.department}
                  onChange={(e) => setEditFormData({...editFormData, department: e.target.value})}
                  className="form-input"
                >
                  <option value="">Select department</option>
                  <option value="Finance">Finance</option>
                  <option value="Operations">Operations</option>
                  <option value="IT">IT</option>
                </select>
              </div>
              <div className="form-group">
                <label>Email *</label>
                <input
                  type="email"
                  value={editFormData.email}
                  onChange={(e) => {
                    clearEditError('email');
                    setEditFormData({ ...editFormData, email: e.target.value });
                  }}
                  className={`form-input ${editErrors.email ? 'input-error' : ''}`}
                />
              </div>
              <div className="form-group">
                <label>Contact Number</label>
                <input
                  type="tel"
                  value={editFormData.phone}
                  onChange={(e) => setEditFormData({ ...editFormData, phone: e.target.value })}
                  className="form-input"
                />
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn-cancel" onClick={() => setShowEditModal(false)}>Cancel</button>
              <button className="btn-submit" onClick={handleSaveEdit}>Save Changes</button>
            </div>
          </div>
        </div>
      )}

      {/* Add Employee Modal */}
      {showAddModal && (
        <div className="modal-overlay" onClick={() => { setShowAddModal(false); setAddStep(1); setNewEmployeeErrors({}); }}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Add New Employee</h2>
              <button className="close-btn" onClick={() => { setShowAddModal(false); setAddStep(1); setNewEmployeeErrors({}); }}>×</button>
            </div>
            <div className="modal-body">
              {addStep === 1 && (
                <div className="form-grid">
                  <div className="form-group">
                    <label>First Name *</label>
                    <input
                      type="text"
                      value={newEmployee.firstName}
                      onChange={(e) => {
                        clearNewEmployeeError('firstName');
                        updateNewEmployeeName({ firstName: e.target.value });
                      }}
                      className={`form-input ${newEmployeeErrors.firstName ? 'input-error' : ''}`}
                      placeholder="Enter first name"
                    />
                  </div>
                  <div className="form-group">
                    <label>Middle Name</label>
                    <input
                      type="text"
                      value={newEmployee.middleName}
                      onChange={(e) => updateNewEmployeeName({ middleName: e.target.value })}
                      className="form-input"
                      placeholder="Enter middle name"
                    />
                  </div>
                  <div className="form-group">
                    <label>Last Name *</label>
                    <input
                      type="text"
                      value={newEmployee.lastName}
                      onChange={(e) => {
                        clearNewEmployeeError('lastName');
                        updateNewEmployeeName({ lastName: e.target.value });
                      }}
                      className={`form-input ${newEmployeeErrors.lastName ? 'input-error' : ''}`}
                      placeholder="Enter last name"
                    />
                  </div>
                  <div className="form-group">
                    <label>Contact Number *</label>
                    <input
                      type="tel"
                      value={newEmployee.contactNumber}
                      onChange={handleContactNumberChange}
                      className={`form-input ${newEmployeeErrors.contactNumber ? 'input-error' : ''}`}
                      placeholder="09XXXXXXXXX"
                      inputMode="numeric"
                      maxLength={11}
                      pattern="^09\d{9}$"
                    />
                  </div>
                  <div className="form-group">
                    <label>Permanent Address *</label>
                    <input
                      type="text"
                      value={newEmployee.address}
                      onChange={(e) => {
                        clearNewEmployeeError('address');
                        setNewEmployee({ ...newEmployee, address: e.target.value });
                      }}
                      className={`form-input ${newEmployeeErrors.address ? 'input-error' : ''}`}
                      placeholder="Street No., Brgy..."
                    />
                  </div>
                  <div className="form-group">
                    <label>Email *</label>
                    <input
                      type="email"
                      value={newEmployee.email}
                      onChange={handleEmailChange}
                      onBlur={() => {
                        if (newEmployee.email && !isValidEmail(newEmployee.email)) {
                          setNewEmployeeErrors((prev) => ({ ...prev, email: 'Invalid format' }));
                        }
                      }}
                      className={`form-input ${newEmployeeErrors.email ? 'input-error' : ''}`}
                      placeholder="employee@company.com"
                    />
                  </div>
                  <div className="form-group">
                    <label>Birthdate *</label>
                    <input
                      type="date"
                      value={newEmployee.birthdate}
                      onChange={(e) => {
                        clearNewEmployeeError('birthdate');
                        setNewEmployee({ ...newEmployee, birthdate: e.target.value });
                      }}
                      className={`form-input ${newEmployeeErrors.birthdate ? 'input-error' : ''}`}
                    />
                  </div>
                  <div className="form-group">
                    <label>ID Photo *</label>
                    <input
                      type="file"
                      accept="image/png, image/jpeg"
                      className={`form-input ${newEmployeeErrors.idPhotoName ? 'input-error' : ''}`}
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        clearNewEmployeeError('idPhotoName');
                        setNewEmployee({
                          ...newEmployee,
                          idPhotoName: file ? file.name : '',
                          idPhotoFile: file || null
                        });
                      }}
                    />
                    {newEmployee.idPhotoName && <small className="file-hint">Selected: {newEmployee.idPhotoName}</small>}
                  </div>
                </div>
              )}

              {addStep === 2 && (
                <div className="form-grid">
                  <div className="form-group">
                    <label>Employee ID Number * <span style={{fontSize: '0.85em', color: '#666'}}>(Auto-generated)</span></label>
                    <input
                      type="text"
                      value={newEmployee.employeeId}
                      onChange={(e) => {
                        clearNewEmployeeError('employeeId');
                        setNewEmployee({ ...newEmployee, employeeId: e.target.value });
                      }}
                      className={`form-input ${newEmployeeErrors.employeeId ? 'input-error' : ''}`}
                      placeholder="GW001, GW002, etc."
                      readOnly
                    />
                  </div>
                  <div className="form-group">
                    <label>Department *</label>
                    <select
                      value={newEmployee.department}
                      onChange={(e) => {
                        clearNewEmployeeError('department');
                        setNewEmployee({ ...newEmployee, department: e.target.value, position: '' });
                      }}
                      className={`form-input ${newEmployeeErrors.department ? 'input-error' : ''}`}
                    >
                      <option value="">Select department</option>
                      <option value="Finance">Finance</option>
                      <option value="Operations">Operations</option>
                      <option value="IT">IT</option>
                    </select>
                  </div>
                  <div className="form-group">
                    <label>Position *</label>
                    <select
                      value={newEmployee.position}
                      onChange={(e) => {
                        clearNewEmployeeError('position');
                        setNewEmployee({ ...newEmployee, position: e.target.value });
                      }}
                      className={`form-input ${newEmployeeErrors.position ? 'input-error' : ''}`}
                      disabled={!newEmployee.department}
                    >
                      <option value="">Select position</option>
                      {newEmployee.department === 'Finance' && (
                        <option value="Finance Head">Finance Head</option>
                      )}
                      {newEmployee.department === 'Operations' && (
                        <>
                          <option value="Operations Head">Operations Head</option>
                          <option value="Trucker">Trucker</option>
                          <option value="Porter">Porter</option>
                        </>
                      )}
                      {newEmployee.department === 'IT' && (
                        <>
                          <option value="IT Head">IT Head</option>
                          <option value="Developer">Developer</option>
                          <option value="IT Support">IT Support</option>
                        </>
                      )}
                    </select>
                  </div>
                  <div className="form-group">
                    <label>Hire Date *</label>
                    <input
                      type="date"
                      value={newEmployee.joinDate}
                      onChange={(e) => {
                        clearNewEmployeeError('joinDate');
                        setNewEmployee({ ...newEmployee, joinDate: e.target.value });
                      }}
                      className={`form-input ${newEmployeeErrors.joinDate ? 'input-error' : ''}`}
                    />
                  </div>
                  <div className="form-group">
                    <label>Status *</label>
                    <select
                      value={newEmployee.status}
                      onChange={(e) => setNewEmployee({...newEmployee, status: e.target.value})}
                      className="form-input"
                    >
                      <option>Active</option>
                      <option>Inactive</option>
                    </select>
                  </div>
                  <div className="form-group">
                    <label>Annual Salary *</label>
                    <input
                      type="number"
                      value={newEmployee.salary}
                      onChange={(e) => {
                        clearNewEmployeeError('salary');
                        setNewEmployee({ ...newEmployee, salary: e.target.value });
                      }}
                      className={`form-input ${newEmployeeErrors.salary ? 'input-error' : ''}`}
                      placeholder="50000"
                      min="0"
                    />
                  </div>
                </div>
              )}
            </div>
            <div className="modal-footer">
              {addStep === 1 && (
                <>
                  <button className="btn-cancel" onClick={() => { setShowAddModal(false); setAddStep(1); setNewEmployeeErrors({}); }}>Cancel</button>
                  <button className="btn-submit" onClick={handleNextAddStep}>Next</button>
                </>
              )}
              {addStep === 2 && (
                <>
                  <button className="btn-cancel" onClick={handleBackAddStep}>Back</button>
                  <button className="btn-submit" onClick={handleAddEmployee}>Add Employee</button>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {showQrModal && (
        <div className="modal-overlay" onClick={() => setShowQrModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Employee QR Code</h2>
              <button className="close-btn" onClick={() => setShowQrModal(false)}>×</button>
            </div>
            <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '16px' }}>
              <p style={{ margin: 0, fontSize: '14px', color: '#64748b', fontWeight: '600' }}>
                Employee ID: <strong style={{ color: '#1e3a5f', fontSize: '16px' }}>{qrPayload.employeeId}</strong>
              </p>
              {qrPayload.qrImageUrl && (
                <img src={qrPayload.qrImageUrl} alt="Employee QR Code" style={{ width: 320, height: 320, display: 'block' }} />
              )}
            </div>
            <div className="modal-footer">
              <button className="btn-submit" onClick={() => downloadQrImage(qrPayload.qrImageUrl, qrPayload.employeeId)}>
                Download QR
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Modal */}
      {showDeleteModal && employeeToDelete && (
        <div className="modal-overlay" onClick={closeDeleteModal}>
          <div className="modal-content delete-modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Delete Employee Record</h2>
              <button className="close-btn" onClick={closeDeleteModal}>×</button>
            </div>
            <div className="modal-body">
              <div className="warning-icon" style={{ fontSize: '48px', textAlign: 'center', marginBottom: '16px' }}>⚠️</div>
              <p style={{ marginBottom: '16px', textAlign: 'center', fontSize: '16px' }}>
                Are you sure you want to permanently delete this employee record?
              </p>
              <div className="record-details" style={{ backgroundColor: '#f9fafb', padding: '12px', borderRadius: '6px', marginBottom: '16px' }}>
                <p style={{ marginBottom: '6px' }}><strong>Employee ID:</strong> {employeeToDelete.id}</p>
                <p style={{ marginBottom: '6px' }}><strong>Name:</strong> {employeeToDelete.name}</p>
                <p style={{ marginBottom: '6px' }}><strong>Department:</strong> {employeeToDelete.department}</p>
                <p style={{ marginBottom: '6px' }}><strong>Position:</strong> {employeeToDelete.position}</p>
                <p><strong>Status:</strong> {employeeToDelete.status}</p>
              </div>
              <p style={{ color: '#d32f2f', fontSize: '13px', marginBottom: '8px' }}>
                <strong>⚠️ This action cannot be undone.</strong>
              </p>
              <p style={{ color: '#d32f2f', fontSize: '13px' }}>
                The employee record will be permanently removed from the system. Ensure there are no pending attendance or salary records.
              </p>
            </div>
            <div className="modal-footer">
              <button className="btn-cancel" onClick={closeDeleteModal}>
                Cancel
              </button>
              <button className="btn-delete" onClick={handleDeleteEmployee}>
                Delete Permanently
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default EmployeeRecords;
