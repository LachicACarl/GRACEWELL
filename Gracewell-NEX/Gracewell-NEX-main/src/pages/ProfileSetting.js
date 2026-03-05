import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import './ProfileSetting.css';
import { apiClient } from '../utils/authService';
import Navbar from '../components/Navbar';
import NexusLogo from '../assets/nexus-logo.png';

const ProfileSetting = ({ user, onLogout, setUser }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const parseNameParts = (name) => {
    if (!name) return { firstName: '', middleName: '', lastName: '' };
    const parts = name.trim().split(/\s+/);
    if (parts.length === 1) {
      return { firstName: parts[0], middleName: '', lastName: '' };
    }
    if (parts.length === 2) {
      return { firstName: parts[0], middleName: '', lastName: parts[1] };
    }
    return {
      firstName: parts[0],
      middleName: parts.slice(1, -1).join(' '),
      lastName: parts[parts.length - 1]
    };
  };

  const initialNameParts = parseNameParts(user?.employeeName);
  const [profileData, setProfileData] = useState({
    firstName: initialNameParts.firstName,
    middleName: initialNameParts.middleName,
    lastName: initialNameParts.lastName,
    email: user?.email || '',
    emailVerifiedAt: user?.emailVerifiedAt || user?.email_verified_at || null,
    position: user?.position || '',
    department: user?.department || '',
    contactNumber: user?.contactNo || '',
    emergencyContact: '',
    emergencyContactName: ''
  });

  const [profileImage, setProfileImage] = useState(
    user?.profileImage || 
    user?.profile_image_url || 
    localStorage.getItem('userProfileImage') || 
    null
  );
  const [showImageModal, setShowImageModal] = useState(false);
  const [tempImage, setTempImage] = useState(null);
  const [isEditing, setIsEditing] = useState(false);
  const [editData, setEditData] = useState(profileData);
  const [profileErrors, setProfileErrors] = useState({});
  const [showChangePasswordModal, setShowChangePasswordModal] = useState(false);
  const [showUpdateEmailModal, setShowUpdateEmailModal] = useState(false);
  const [newEmailData, setNewEmailData] = useState({ email: '', confirmEmail: '' });
  const [emailErrors, setEmailErrors] = useState({});
  const [showVerifyEmailModal, setShowVerifyEmailModal] = useState(false);
  const [showEmailConfirmModal, setShowEmailConfirmModal] = useState(false);
  const [emailConfirmContext, setEmailConfirmContext] = useState('password');
  const [passwordData, setPasswordData] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: ''
  });

  const isValidEmail = (value) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
  const isValidContact = (value) => /^(\+63|0)9\d{9}$/.test(value);

  useEffect(() => {
    const loadProfile = async () => {
      
      try {
        const { data } = await apiClient.get('/users/profile');
        const profile = data?.user;
        if (!profile) return;

        const nameParts = {
          firstName: profile.first_name || parseNameParts(profile.name).firstName,
          middleName: profile.middle_name || parseNameParts(profile.name).middleName,
          lastName: profile.last_name || parseNameParts(profile.name).lastName
        };

        const nextProfile = {
          firstName: nameParts.firstName,
          middleName: nameParts.middleName,
          lastName: nameParts.lastName,
          email: profile.email || '',
          emailVerifiedAt: profile.email_verified_at || null,
          position: profile.position || '',
          department: profile.department || '',
          contactNumber: profile.contact_number || '',
          emergencyContact: profile.emergency_contact || '',
          emergencyContactName: profile.emergency_contact_name || ''
        };

        setProfileData(nextProfile);
        if (!isEditing) {
          setEditData(nextProfile);
        }

        if (profile.profile_image_url) {
          setProfileImage(profile.profile_image_url);
          // Sync to localStorage and parent state
          localStorage.setItem('userProfileImage', profile.profile_image_url);
          if (setUser) {
            setUser(prev => ({ 
              ...prev, 
              profileImage: profile.profile_image_url,
              profile_image_url: profile.profile_image_url 
            }));
          }
        }
      } catch (error) {
        console.error('Failed to load profile:', error);
      }
    };

    loadProfile();
  }, [isEditing]);

  // Employment history data
  const [employmentHistory] = useState([
    {
      id: 1,
      event: 'Hired',
      date: '2022-01-15',
      details: 'Joined as Truck Driver',
      status: 'completed'
    },
    {
      id: 2,
      event: 'Position Update',
      date: '2023-06-01',
      details: 'Promoted to Senior Driver',
      status: 'completed'
    },
    {
      id: 3,
      event: 'Performance Review',
      date: '2024-01-10',
      details: 'Annual performance review - Excellent',
      status: 'completed'
    },
    {
      id: 4,
      event: 'Account Status',
      date: '2024-01-26',
      details: 'Account status: Active',
      status: 'completed'
    }
  ]);

  const handleEditClick = () => {
    setEditData(profileData);
    setProfileErrors({});
    setIsEditing(true);
  };

  const handleCancelEdit = () => {
    setIsEditing(false);
    setEditData(profileData);
  };

  const handleSaveChanges = async () => {
    const errors = {};
    if (!editData.firstName?.trim()) errors.firstName = 'Required';
    if (!editData.lastName?.trim()) errors.lastName = 'Required';
    if (editData.contactNumber && !isValidContact(editData.contactNumber)) {
      errors.contactNumber = 'Invalid format';
    }
    if (editData.emergencyContact && !isValidContact(editData.emergencyContact)) {
      errors.emergencyContact = 'Invalid format';
    }

    if (Object.keys(errors).length > 0) {
      setProfileErrors(errors);
      alert('Please complete all required fields and fix invalid inputs.');
      return;
    }

    try {
      const { data } = await apiClient.put('/users/profile', {
        name: `${editData.firstName} ${editData.middleName || ''} ${editData.lastName}`.trim(),
        contactNumber: editData.contactNumber,
        emergencyContact: editData.emergencyContact,
        emergencyContactName: editData.emergencyContactName
      });

      if (data?.success) {
        setProfileData(editData);
        setProfileErrors({});
        setIsEditing(false);
        if (setUser) {
          const fullName = `${editData.firstName} ${editData.middleName || ''} ${editData.lastName}`.trim();
          setUser((prev) => ({
            ...prev,
            employeeName: fullName,
            department: editData.department,
            contactNo: editData.contactNumber
          }));
        }
        alert('Profile updated successfully!');
      } else {
        alert(data?.message || 'Failed to update profile');
      }
    } catch (error) {
      console.error('Update error:', error);
      alert(error?.response?.data?.message || 'Failed to update profile');
    }
  };

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setEditData({ ...editData, [name]: value });
    if (profileErrors[name]) {
      setProfileErrors((prev) => ({ ...prev, [name]: '' }));
    }
  };

  const handleChangePhoto = () => {
    setShowImageModal(true);
  };

  const handleImageUpload = (e) => {
    const file = e.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setTempImage(reader.result);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSaveImage = async () => {
    if (tempImage) {
      try {
        // Convert base64 to blob
        const response = await fetch(tempImage);
        const blob = await response.blob();
        
        const formData = new FormData();
        formData.append('photo', blob, 'profile.jpg');

        const { data } = await apiClient.post('/users/upload-photo', formData);
        if (data?.imageUrl) {
          setProfileImage(data.imageUrl);
          setShowImageModal(false);
          setTempImage(null);
          // Update user state and persist to localStorage
          localStorage.setItem('userProfileImage', data.imageUrl);
          
          // Also update authData in localStorage
          const authData = localStorage.getItem('authData');
          if (authData) {
            try {
              const parsedAuthData = JSON.parse(authData);
              parsedAuthData.profileImage = data.imageUrl;
              parsedAuthData.profile_image_url = data.imageUrl;
              localStorage.setItem('authData', JSON.stringify(parsedAuthData));
            } catch (e) {
              console.error('Failed to update authData:', e);
            }
          }
          
          if (setUser) {
            setUser(prev => ({ ...prev, profileImage: data.imageUrl, profile_image_url: data.imageUrl }));
          }
          alert('Profile photo updated successfully!');
        } else {
          alert(data?.message || 'Failed to upload photo');
        }
      } catch (error) {
        console.error('Photo upload error:', error);
        alert(error?.response?.data?.message || 'Failed to upload photo');
      }
    }
  };

  const handleCancelImageUpload = () => {
    setShowImageModal(false);
    setTempImage(null);
  };

  const handleChangePassword = () => {
    setShowChangePasswordModal(true);
  };

  const handleVerifyEmail = () => {
    setShowVerifyEmailModal(true);
  };

  const handleOpenUpdateEmail = () => {
    setNewEmailData({ email: '', confirmEmail: '' });
    setEmailErrors({});
    setShowUpdateEmailModal(true);
  };

  const handleUpdateEmail = async () => {
    const errors = {};
    if (!newEmailData.email?.trim()) errors.email = 'Required';
    if (!isValidEmail(newEmailData.email)) errors.email = 'Invalid email format';
    if (newEmailData.email !== newEmailData.confirmEmail) errors.confirmEmail = 'Emails do not match';
    
    if (Object.keys(errors).length > 0) {
      setEmailErrors(errors);
      return;
    }

    try {
      const { data } = await apiClient.put('/users/update-email', {
        email: newEmailData.email
      });

      if (data?.success) {
        setProfileData(prev => ({ ...prev, email: newEmailData.email, emailVerifiedAt: null }));
        if (setUser) {
          setUser(prev => ({ ...prev, email: newEmailData.email, emailVerifiedAt: null }));
        }
        setShowUpdateEmailModal(false);
        alert('Email updated successfully! Please verify your new email address.');
      } else {
        alert(data?.message || 'Failed to update email');
      }
    } catch (error) {
      console.error('Email update error:', error);
      alert(error?.response?.data?.message || 'Failed to update email');
    }
  };

  const handlePasswordChange = (e) => {
    const { name, value } = e.target;
    setPasswordData({ ...passwordData, [name]: value });
  };

  const handleUpdatePassword = () => {
    if (!passwordData.currentPassword || !passwordData.newPassword || !passwordData.confirmPassword) {
      alert('Please fill in all password fields');
      return;
    }
    if (passwordData.newPassword !== passwordData.confirmPassword) {
      alert('New passwords do not match');
      return;
    }
    // Show email confirmation modal
    setShowChangePasswordModal(false);
    setEmailConfirmContext('password');
    setShowEmailConfirmModal(true);
    setPasswordData({
      currentPassword: '',
      newPassword: '',
      confirmPassword: ''
    });
  };

  const handleSendVerificationEmail = async () => {
    try {
      const { data } = await apiClient.post('/auth/request-email-verification');
      if (!data?.success) {
        alert(data?.message || 'Failed to send verification email');
        return;
      }
      setShowVerifyEmailModal(false);
      setEmailConfirmContext('email');
      setShowEmailConfirmModal(true);
    } catch (error) {
      alert(error?.response?.data?.message || 'Failed to send verification email');
    }
  };

  const handleResendConfirmation = async () => {
    if (emailConfirmContext === 'password') {
      alert('Password change confirmation email resent.');
      return;
    }
    try {
      const { data } = await apiClient.post('/auth/request-email-verification');
      if (!data?.success) {
        alert(data?.message || 'Failed to resend verification email');
        return;
      }
      alert('Verification email resent.');
    } catch (error) {
      alert(error?.response?.data?.message || 'Failed to resend verification email');
    }
  };

  const handleLogout = () => {
    onLogout();
    navigate('/login');
  };

  const handleDashboardClick = () => {
    if (location.pathname === '/employee') {
      window.location.reload();
    } else {
      navigate('/employee');
    }
  };

  return (
    <div className="profile-container">
      {user?.userRole === 'employee' ? (
        <header className="employee-header">
          <div className="brand-block">
            <img src={NexusLogo} alt="Nexus Logo" className="brand-logo" />
            <span className="brand-text">Gracewell NEXUS</span>
          </div>
          <div className="header-actions">
            <button className="header-dashboard-btn" onClick={handleDashboardClick}>
              Dashboard
            </button>
            <button className="header-logout" onClick={handleLogout}>
              ↩ Log Out
            </button>
          </div>
        </header>
      ) : (
        <Navbar user={user} onLogout={onLogout} />
      )}

      <div className="profile-content">
        <div className="profile-header">
          <h1>Profile Settings</h1>
          <p>Manage your personal information and account settings</p>
        </div>

        <div className="profile-main">
          {/* Profile Picture Section - Minimal */}
          <div className="profile-picture-section-compact">
            <div className="profile-avatar-small">
              {profileImage ? (
                <img src={profileImage} alt="Profile" className="profile-image-small" />
              ) : (
                user?.employeeName?.substring(0, 2).toUpperCase() || 'GC'
              )}
            </div>
            <button className="btn-change-photo-compact" onClick={handleChangePhoto}>
              Change Photo
            </button>
          </div>

          {/* Personal Information Section */}
          <div className="profile-section">
            <div className="section-header">
              <h2>Personal Information</h2>
              {!isEditing && (
                <button className="btn-edit" onClick={handleEditClick}>
                  Edit Profile
                </button>
              )}
            </div>

            {isEditing ? (
              <div className="edit-form">
                <div className="form-row">
                  <div className="form-group">
                    <label>First Name</label>
                    <input
                      type="text"
                      name="firstName"
                      value={editData.firstName}
                      onChange={handleInputChange}
                      className={`form-input ${profileErrors.firstName ? 'input-error' : ''}`}
                    />
                  </div>
                  <div className="form-group">
                    <label>Middle Name</label>
                    <input
                      type="text"
                      name="middleName"
                      value={editData.middleName}
                      onChange={handleInputChange}
                      className="form-input"
                    />
                  </div>
                  <div className="form-group">
                    <label>Last Name</label>
                    <input
                      type="text"
                      name="lastName"
                      value={editData.lastName}
                      onChange={handleInputChange}
                      className={`form-input ${profileErrors.lastName ? 'input-error' : ''}`}
                    />
                  </div>
                </div>

                <div className="form-row">
                  <div className="form-group">
                    <label>Email</label>
                    <div className="email-readonly">
                      <input
                        type="email"
                        name="email"
                        value={editData.email}
                        className="form-input"
                        disabled
                        title="Email cannot be changed from here. Use the 'Update Email' option in Security section."
                      />
                      <small className="field-hint">Use "Update Email" in Security section to change</small>
                    </div>
                  </div>
                  <div className="form-group">
                    <label>Contact Number</label>
                    <input
                      type="tel"
                      name="contactNumber"
                      value={editData.contactNumber}
                      onChange={handleInputChange}
                      className={`form-input ${profileErrors.contactNumber ? 'input-error' : ''}`}
                    />
                  </div>
                </div>

                <div className="form-row">
                  <div className="form-group">
                    <label>Emergency Contact Name</label>
                    <input
                      type="text"
                      name="emergencyContactName"
                      value={editData.emergencyContactName}
                      onChange={handleInputChange}
                      className="form-input"
                      placeholder="Enter emergency contact name"
                    />
                  </div>
                  <div className="form-group">
                    <label>Emergency Contact Number</label>
                    <input
                      type="tel"
                      name="emergencyContact"
                      value={editData.emergencyContact}
                      onChange={handleInputChange}
                      className={`form-input ${profileErrors.emergencyContact ? 'input-error' : ''}`}
                      placeholder="+639XXXXXXXXX or 09XXXXXXXXX"
                    />
                  </div>
                </div>

                <div className="form-row">
                  <div className="form-group">
                    <label>Position</label>
                    <input
                      type="text"
                      name="position"
                      value={editData.position}
                      onChange={handleInputChange}
                      className="form-input"
                      disabled
                    />
                  </div>
                  <div className="form-group">
                    <label>Department</label>
                    <input
                      type="text"
                      name="department"
                      value={editData.department}
                      onChange={handleInputChange}
                      className="form-input"
                      disabled
                    />
                  </div>
                </div>

                <div className="form-buttons">
                  <button className="btn-cancel" onClick={handleCancelEdit}>Cancel</button>
                  <button className="btn-save" onClick={handleSaveChanges}>Save Changes</button>
                </div>
              </div>
            ) : (
              <div className="profile-info">
                <div className="info-row">
                  <div className="info-group">
                    <label>First Name</label>
                    <p>{profileData.firstName}</p>
                  </div>
                  <div className="info-group">
                    <label>Middle Name</label>
                    <p>{profileData.middleName || '-'}</p>
                  </div>
                  <div className="info-group">
                    <label>Last Name</label>
                    <p>{profileData.lastName}</p>
                  </div>
                </div>

                <div className="info-row">
                  <div className="info-group">
                    <label>Email</label>
                    <p>{profileData.email}</p>
                  </div>
                  <div className="info-group">
                    <label>Contact Number</label>
                    <p>{profileData.contactNumber}</p>
                  </div>
                </div>

                <div className="info-row">
                  <div className="info-group">
                    <label>Position</label>
                    <p>{profileData.position}</p>
                  </div>
                  <div className="info-group">
                    <label>Department</label>
                    <p>{profileData.department}</p>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Emergency Contact Section */}
          <div className="profile-section">
            <h2>Emergency Contact</h2>
            <div className="profile-info">
              <div className="info-row">
                <div className="info-group">
                  <label>Emergency Contact Name</label>
                  <p>{profileData.emergencyContactName}</p>
                </div>
                <div className="info-group">
                  <label>Emergency Contact Number</label>
                  <p>{profileData.emergencyContact}</p>
                </div>
              </div>
            </div>
          </div>

          {/* Security Section */}
          <div className="profile-section">
            <div className="section-header">
              <h2>Security</h2>
              <div className="section-actions">
                <button className="btn-change-password" onClick={handleOpenUpdateEmail}>
                  ✉️ Update Email
                </button>
                <button className="btn-change-password" onClick={handleVerifyEmail}>
                  📧 Verify Email
                </button>
                <button className="btn-change-password" onClick={handleChangePassword}>
                  🔒 Change Password
                </button>
              </div>
            </div>
            <div className="security-info">
              <p>Last password change: 30 days ago</p>
              <p>
                Email status:{' '}
                <span className={profileData.emailVerifiedAt ? 'status-enabled' : 'status-disabled'}>
                  {profileData.emailVerifiedAt ? 'Verified' : 'Not verified'}
                </span>
              </p>
              <p>Two-factor authentication: <span className="status-disabled">Not enabled</span></p>
            </div>
          </div>

          {/* Employment History Section */}
          <div className="profile-section">
            <h2>Employment History</h2>
            <div className="history-timeline">
              {employmentHistory.map((record, index) => (
                <div key={record.id} className="timeline-item">
                  <div className="timeline-marker"></div>
                  <div className="timeline-content">
                    <div className="history-header">
                      <h3>{record.event}</h3>
                      <span className="history-date">{new Date(record.date).toLocaleDateString()}</span>
                    </div>
                    <p className="history-details">{record.details}</p>
                  </div>
                  {index < employmentHistory.length - 1 && <div className="timeline-line"></div>}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Change Password Modal */}
      {showChangePasswordModal && (
        <div className="modal-overlay" onClick={() => setShowChangePasswordModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Change Password</h2>
              <button 
                className="close-btn"
                onClick={() => setShowChangePasswordModal(false)}
              >
                ✕
              </button>
            </div>
            <div className="modal-body">
              <div className="form-group">
                <label>Current Password *</label>
                <input
                  type="password"
                  name="currentPassword"
                  value={passwordData.currentPassword}
                  onChange={handlePasswordChange}
                  className="form-input"
                  placeholder="Enter your current password"
                />
              </div>

              <div className="form-group">
                <label>New Password *</label>
                <input
                  type="password"
                  name="newPassword"
                  value={passwordData.newPassword}
                  onChange={handlePasswordChange}
                  className="form-input"
                  placeholder="Enter new password"
                />
              </div>

              <div className="form-group">
                <label>Confirm New Password *</label>
                <input
                  type="password"
                  name="confirmPassword"
                  value={passwordData.confirmPassword}
                  onChange={handlePasswordChange}
                  className="form-input"
                  placeholder="Confirm new password"
                />
              </div>
            </div>
            <div className="modal-footer">
              <button 
                className="btn-cancel"
                onClick={() => setShowChangePasswordModal(false)}
              >
                Cancel
              </button>
              <button 
                className="btn-submit"
                onClick={handleUpdatePassword}
              >
                Update Password
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Update Email Modal */}
      {showUpdateEmailModal && (
        <div className="modal-overlay" onClick={() => setShowUpdateEmailModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Update Email Address</h2>
              <button
                className="close-btn"
                onClick={() => setShowUpdateEmailModal(false)}
              >
                ✕
              </button>
            </div>
            <div className="modal-body">
              <p className="modal-description">
                Change your email address. You will need to verify the new email after updating.
              </p>
              <div className="form-group">
                <label>Current Email</label>
                <input
                  type="email"
                  value={profileData.email}
                  className="form-input"
                  disabled
                />
              </div>
              <div className="form-group">
                <label>New Email *</label>
                <input
                  type="email"
                  value={newEmailData.email}
                  onChange={(e) => {
                    setNewEmailData({ ...newEmailData, email: e.target.value });
                    setEmailErrors({ ...emailErrors, email: '' });
                  }}
                  className={`form-input ${emailErrors.email ? 'input-error' : ''}`}
                  placeholder="Enter new email address"
                />
                {emailErrors.email && <span className="error-text">{emailErrors.email}</span>}
              </div>
              <div className="form-group">
                <label>Confirm New Email *</label>
                <input
                  type="email"
                  value={newEmailData.confirmEmail}
                  onChange={(e) => {
                    setNewEmailData({ ...newEmailData, confirmEmail: e.target.value });
                    setEmailErrors({ ...emailErrors, confirmEmail: '' });
                  }}
                  className={`form-input ${emailErrors.confirmEmail ? 'input-error' : ''}`}
                  placeholder="Confirm new email address"
                />
                {emailErrors.confirmEmail && <span className="error-text">{emailErrors.confirmEmail}</span>}
              </div>
            </div>
            <div className="modal-footer">
              <button
                className="btn-cancel"
                onClick={() => setShowUpdateEmailModal(false)}
              >
                Cancel
              </button>
              <button
                className="btn-submit"
                onClick={handleUpdateEmail}
              >
                Update Email
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Email Verification Modal */}
      {showVerifyEmailModal && (
        <div className="modal-overlay" onClick={() => setShowVerifyEmailModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Verify Email</h2>
              <button
                className="close-btn"
                onClick={() => setShowVerifyEmailModal(false)}
              >
                ✕
              </button>
            </div>
            <div className="modal-body">
              <p>
                We will send a verification link to <strong>{profileData.email}</strong>.
              </p>
            </div>
            <div className="modal-footer">
              <button
                className="btn-cancel"
                onClick={() => setShowVerifyEmailModal(false)}
              >
                Cancel
              </button>
              <button
                className="btn-submit"
                onClick={handleSendVerificationEmail}
              >
                Send Verification
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Email Confirmation Modal */}
      {showEmailConfirmModal && (
        <div className="modal-overlay" onClick={() => setShowEmailConfirmModal(false)}>
          <div className="modal-content email-confirm-modal" onClick={(e) => e.stopPropagation()}>
            <button className="modal-close" onClick={() => setShowEmailConfirmModal(false)}>×</button>
            <div className="modal-body text-center">
              <div className="email-icon">📧</div>
              <h2>Check your email</h2>
              <p>
                {emailConfirmContext === 'password'
                  ? <>We've sent an email to <strong>{profileData.email}</strong> to confirm your password change.</>
                  : <>We've sent a verification link to <strong>{profileData.email}</strong>.</>
                }
              </p>
              <button 
                className="btn-submit btn-gotit"
                onClick={() => setShowEmailConfirmModal(false)}
              >
                Got it
              </button>
              <p className="resend-text">
                Don't receive the email? <span className="resend-link" onClick={handleResendConfirmation}>Resend</span>
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Image Upload Modal */}
      {showImageModal && (
        <div className="modal-overlay" onClick={handleCancelImageUpload}>
          <div className="modal-content image-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Change Profile Photo</h2>
              <button className="modal-close" onClick={handleCancelImageUpload}>×</button>
            </div>
            
            <div className="modal-body">
              <div className="image-upload-area">
                {tempImage ? (
                  <div className="image-preview-container">
                    <img src={tempImage} alt="Preview" className="image-preview" />
                  </div>
                ) : (
                  <div className="upload-placeholder">
                    <p>Click to select image or drag and drop</p>
                    <p className="upload-hint">JPG, PNG, GIF up to 5MB</p>
                  </div>
                )}
                <input
                  type="file"
                  ref={(input) => {
                    if (input) input.click = () => input.click();
                  }}
                  onChange={handleImageUpload}
                  accept="image/*"
                  className="file-input"
                  id="image-input"
                  style={{ display: 'none' }}
                />
              </div>
              
              <label htmlFor="image-input" className="btn-choose-file">
                Choose File
              </label>

              {tempImage && (
                <p className="image-info">Image selected and ready to save</p>
              )}
            </div>

            <div className="modal-footer">
              <button 
                className="btn-cancel"
                onClick={handleCancelImageUpload}
              >
                Cancel
              </button>
              <button 
                className="btn-submit"
                onClick={handleSaveImage}
                disabled={!tempImage}
              >
                Save Photo
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ProfileSetting;
