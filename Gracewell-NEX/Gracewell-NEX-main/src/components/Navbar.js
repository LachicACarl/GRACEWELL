import React, { useEffect, useRef } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import './Navbar.css';
import { getPermissions } from '../utils/authService';
import NexusLogo from '../assets/nexus-logo.png';

const Navbar = ({ user, onLogout }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const [profileDropdownOpen, setProfileDropdownOpen] = React.useState(false);
  const [employeeDropdownOpen, setEmployeeDropdownOpen] = React.useState(false);
  const [notificationDropdownOpen, setNotificationDropdownOpen] = React.useState(false);
  const [currentProfileImage, setCurrentProfileImage] = React.useState(null);
  const [notifications, setNotifications] = React.useState([]);
  const [notificationCounts, setNotificationCounts] = React.useState({ correction: 0, absence: 0, total: 0 });
  const dropdownRef = useRef(null);
  const apiBaseUrl = process.env.REACT_APP_API_BASE_URL || 'http://localhost:4000';

  // Update profile image when user prop changes
  useEffect(() => {
    const profileImg = user?.profileImage || user?.profile_image_url || localStorage.getItem('userProfileImage');
    console.log('[Navbar] Profile Image Debug:', {
      userProfileImage: user?.profileImage,
      userProfileImageUrl: user?.profile_image_url,
      localStorage: localStorage.getItem('userProfileImage'),
      final: profileImg
    });
    setCurrentProfileImage(profileImg);
  }, [user?.profileImage, user?.profile_image_url, user]);

  // Fetch notifications for admin/super_admin
  useEffect(() => {
    const fetchNotifications = async () => {
      if (user?.userRole !== 'admin' && user?.userRole !== 'super_admin' && user?.userRole !== 'manager') {
        return;
      }

      try {
        const token = localStorage.getItem('accessToken');
        console.log('[Navbar] Fetching notifications...');
        const response = await fetch(`${apiBaseUrl}/notifications/pending`, {
          headers: {
            'Authorization': `Bearer ${token}`
          }
        });

        console.log('[Navbar] Response status:', response.status);
        if (response.ok) {
          const data = await response.json();
          console.log('[Navbar] Notifications data:', data);
          setNotifications(data.notifications || []);
          setNotificationCounts(data.counts || { correction: 0, absence: 0, total: 0 });
        } else {
          console.error('[Navbar] Failed to fetch notifications:', response.status, response.statusText);
        }
      } catch (error) {
        console.error('[Navbar] Failed to fetch notifications:', error);
      }
    };

    fetchNotifications();
    // Poll every 30 seconds - Time Corrections will auto-remove when approved/denied
    // Advance Absences are manually removed on acknowledgment
    const interval = setInterval(fetchNotifications, 30000);
    return () => clearInterval(interval);
  }, [user?.userRole, apiBaseUrl]);

  const getInitials = (name) => {
    if (!name) return 'GC';
    const parts = name.trim().split(/\s+/);
    const first = parts[0]?.[0] || '';
    const second = parts[1]?.[0] || parts[0]?.[1] || '';
    return `${first}${second}`.toUpperCase();
  };

  const perms = getPermissions(user?.userRole);

  const handleLogout = () => {
    onLogout();
    navigate('/login');
  };

  const getDashboardLink = () => {
    if (user?.userRole === 'super_admin' || user?.userRole === 'admin') return '/admin';
    if (user?.userRole === 'manager') return '/manager';
    return '/employee';
  };

  const markNotificationRead = async (issueId) => {
    try {
      const token = localStorage.getItem('accessToken');
      const response = await fetch(`${apiBaseUrl}/notifications/mark-read`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ issueId })
      });

      if (!response.ok) {
        console.error('[Navbar] Failed to mark notification read:', response.status, response.statusText);
      }
    } catch (error) {
      console.error('[Navbar] Failed to mark notification read:', error);
    }
  };

  const handleNotificationClick = async (notif) => {
    // Advance Absence: Mark as read and remove immediately (acknowledgment)
    if (notif?.type === 'Absence') {
      await markNotificationRead(notif.issueId);
      const updated = notifications.filter((n) => n.issueId !== notif.issueId);
      const correctionCount = updated.filter((n) => n.type === 'Correction').length;
      const absenceCount = updated.filter((n) => n.type === 'Absence').length;
      setNotifications(updated);
      setNotificationCounts({
        correction: correctionCount,
        absence: absenceCount,
        total: correctionCount + absenceCount
      });
    }
    // Time Correction: Just navigate, keep notification until it's approved/denied
    // (will be removed when correction status changes to Approved/Denied)

    const target = notif?.attendanceId
      ? `/attendance?attendanceId=${encodeURIComponent(notif.attendanceId)}`
      : '/attendance';
    navigate(target);
    setNotificationDropdownOpen(false);
  };

  // Click-away listener to close dropdowns
  useEffect(() => {
    const handleClickAway = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setProfileDropdownOpen(false);
        setEmployeeDropdownOpen(false);
        setNotificationDropdownOpen(false);
      }
    };

    if (profileDropdownOpen || employeeDropdownOpen || notificationDropdownOpen) {
      document.addEventListener('mousedown', handleClickAway);
      return () => document.removeEventListener('mousedown', handleClickAway);
    }
  }, [profileDropdownOpen, employeeDropdownOpen, notificationDropdownOpen]);

  // Check if current page matches a menu item
  const isMenuActive = (path) => {
    return location.pathname === path;
  };

  return (
    <div className="navbar" ref={dropdownRef}>
      <div className="navbar-left">
        <Link to={getDashboardLink()} className="logo">
          <img src={NexusLogo} alt="Nexus Logo" className="logo-image" />
          <span className="logo-text">Gracewell NEXUS</span>
        </Link>
      </div>
      
      <div className="navbar-center">
      </div>
      
      <div className="navbar-right">
        <Link 
          to={getDashboardLink()} 
          className={`dashboard-btn ${location.pathname === getDashboardLink() ? 'active' : ''}`}
        >
          Dashboard
        </Link>
        
        {user?.userRole !== 'employee' && (perms.viewAttendance || perms.manageSalary || perms.manageEmployees || perms.manageUsers) && (
          <div className="dropdown">
            <div 
              className={`employee-link ${employeeDropdownOpen ? 'active' : ''}`}
              onClick={() => setEmployeeDropdownOpen(!employeeDropdownOpen)}
            >
              Employee <span className="dropdown-arrow">▼</span>
            </div>
            {employeeDropdownOpen && (
              <div className="dropdown-content">
                {perms.viewAttendance && (
                  <Link 
                    to="/attendance"
                    className={`dropdown-item ${isMenuActive('/attendance') ? 'active' : ''}`}
                  >
                    Employee Attendance Tracker
                  </Link>
                )}
                {perms.manageSalary && (
                  user?.userRole === 'super_admin' || user?.userRole === 'admin' ? (
                    <Link 
                      to="/salary"
                      className={`dropdown-item ${isMenuActive('/salary') ? 'active' : ''}`}
                    >
                      Employee Salary Tracker
                    </Link>
                  ) : (
                    <Link 
                      to="/salary-manager"
                      className={`dropdown-item ${isMenuActive('/salary-manager') ? 'active' : ''}`}
                    >
                      Employee Salary Tracker
                    </Link>
                  )
                )}
                {perms.manageEmployees && (
                  <Link 
                    to="/records"
                    className={`dropdown-item ${isMenuActive('/records') ? 'active' : ''}`}
                  >
                    Employee Records
                  </Link>
                )}
                {perms.manageUsers && (
                  <Link 
                    to="/users"
                    className={`dropdown-item ${isMenuActive('/users') ? 'active' : ''}`}
                  >
                    User Management
                  </Link>
                )}
              </div>
            )}
          </div>
        )}
        
        {/* Notification Bell for Admin/Super Admin */}
        {(user?.userRole === 'admin' || user?.userRole === 'super_admin' || user?.userRole === 'manager') && (
          <div className="notification-icon-wrapper">
            <button 
              className="notification-bell"
              onClick={() => setNotificationDropdownOpen(!notificationDropdownOpen)}
            >
              🔔
              {notificationCounts.total > 0 && (
                <span className="notification-badge">{notificationCounts.total}</span>
              )}
            </button>
            
            {notificationDropdownOpen && (
              <div className="notification-dropdown">
                <div className="notification-header">
                  <h3>Notifications</h3>
                  {notificationCounts.total > 0 && (
                    <span className="total-badge">{notificationCounts.total}</span>
                  )}
                </div>
                
                <div className="notification-summary">
                  <div className="notification-stat-card">
                    <span className="notification-stat-label">Correction</span>
                    <strong className="notification-stat-value">{notificationCounts.correction}</strong>
                  </div>
                  <div className="notification-stat-card">
                    <span className="notification-stat-label">Absence</span>
                    <strong className="notification-stat-value">{notificationCounts.absence}</strong>
                  </div>
                </div>
                
                <div className="notification-list">
                  {notifications.length === 0 ? (
                    <div className="notification-empty">
                      <div className="notification-empty-icon" aria-hidden="true">🔔</div>
                      <div>No pending notifications</div>
                    </div>
                  ) : (
                    notifications.map((notif) => (
                      <button
                        key={notif.issueId}
                        type="button"
                        className="notification-item"
                        onClick={() => handleNotificationClick(notif)}
                      >
                        <div className="notification-type">
                          {notif.type === 'Correction' ? 'Time Correction' : 'Advance Absence'} • {notif.date || 'N/A'}
                        </div>
                        <div className="notification-details">
                          {notif.reason}
                        </div>
                      </button>
                    ))
                  )}
                </div>

                <div className="notification-footer">
                  <button 
                    className="view-all-btn"
                    onClick={() => {
                      navigate('/attendance');
                      setNotificationDropdownOpen(false);
                    }}
                  >
                    View All Pending
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
        
        <div className="profile">
          <div className="profile-avatar">
            {currentProfileImage ? (
              <img src={currentProfileImage} alt="Profile" className="profile-avatar-img" />
            ) : (
              getInitials(user?.employeeName)
            )}
          </div>
          <span 
            className="profile-name"
            onClick={() => setProfileDropdownOpen(!profileDropdownOpen)}
          >
            {user?.employeeName || 'Guest'} <span className="dropdown-arrow">▼</span>
          </span>
          
          {profileDropdownOpen && (
            <div className="profile-dropdown">
              {user?.userRole !== 'employee' && (
                <Link to="/profile" className="profile-dropdown-item">
                  👤 Profile
                </Link>
              )}
              <button 
                onClick={handleLogout} 
                className="profile-dropdown-item logout-btn"
              >
                🚪 Log Out
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default Navbar;
