import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import './App.css';
import { getRoleRedirect } from './utils/roleRedirectMap';
import Login from './pages/Login';
import SetupPassword from './pages/SetupPassword';
import ResetPassword from './pages/ResetPassword';
import FaceAuth from './pages/FaceAuth';
import ForgotPassword from './pages/ForgotPassword';
import VerifyEmail from './pages/VerifyEmail';
import AdminDashboard from './pages/AdminDashboard';
import AdminDatabase from './pages/AdminDatabase';
import ManagerDashboard from './pages/ManagerDashboard';
import EmployeeDashboard from './pages/EmployeeDashboard';
import AttendanceManagement from './pages/AttendanceManagement';
import SalaryTracker from './pages/SalaryTracker';
import ViewSalaryRecord from './pages/ViewSalaryRecord';
import EmployeeRecords from './pages/EmployeeRecords';
import UserManagement from './pages/UserManagement';
import ProfileSetting from './pages/ProfileSetting';
import AttendanceScanner from './pages/AttendanceScanner';
import QRCodeGenerator from './pages/QRCodeGenerator';
import QRScanLogin from './pages/QRScanLogin';
import QRScannerLogin from './pages/QRScannerLogin';
import QRScanner from './pages/QRScanner';
import QRAttendanceResult from './pages/QRAttendanceResult';
import EmployeeQRScanner from './pages/EmployeeQRScanner';
import ProtectedRoute from './components/ProtectedRoute';
import { verifySession, logoutUser, logAudit } from './utils/authService';

function App() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;

    const bootstrap = async () => {
      // Verify session
      const authData = await verifySession();

      if (!isMounted) return;

      if (authData) {
        const profileImage = localStorage.getItem('userProfileImage');
        setUser({ 
          ...authData, 
          profileImage: profileImage || authData.profileImage || authData.profile_image_url,
          profile_image_url: profileImage || authData.profileImage || authData.profile_image_url
        });
      } else {
        setUser(null);
      }

      setLoading(false);
    };

    bootstrap();

    return () => {
      isMounted = false;
    };
  }, []);

  const handleLogout = async () => {
    // Log logout action
    if (user) {
      await logAudit('LOGOUT', { 
        employeeId: user.employeeId,
        timestamp: new Date().toISOString()
      });
    }
    
    // Clear all auth data
    logoutUser();
    setUser(null);
  };

  if (loading) {
    return (
      <div style={{ 
        display: 'flex', 
        justifyContent: 'center', 
        alignItems: 'center', 
        height: '100vh',
        background: 'linear-gradient(135deg, #0a192f 0%, #1a3a5c 100%)',
        color: 'white',
        fontSize: '1.2rem',
        fontFamily: "'Segoe UI', Tahoma, Geneva, Verdana, sans-serif"
      }}>
        Loading...
      </div>
    );
  }

  return (
    <Router future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <Routes>
        <Route path="/login" element={<Login setUser={setUser} />} />
        <Route path="/setup-password" element={<SetupPassword />} />
        <Route path="/reset-password" element={<ResetPassword />} />
        <Route path="/verify-email" element={<VerifyEmail />} />
        <Route path="/face-auth" element={<FaceAuth setUser={setUser} />} />
        <Route path="/forgot-password" element={<ForgotPassword />} />
        <Route path="/qr-generator" element={<QRCodeGenerator />} />
        <Route path="/qr-scanner-login" element={<QRScannerLogin setUser={setUser} />} />
        
        <Route 
          path="/qr-scanner" 
          element={
            <ProtectedRoute user={user} requiredRole="admin-qr-employee">
              <QRScanner user={user} onLogout={handleLogout} />
            </ProtectedRoute>
          }
        />

        <Route 
          path="/qr-attendance-result/:employeeId/:action" 
          element={
            <ProtectedRoute user={user} requiredRole="admin-qr-employee">
              <QRAttendanceResult user={user} onLogout={handleLogout} />
            </ProtectedRoute>
          }
        />
        
        <Route 
          path="/qr-scan-login" 
          element={
            <ProtectedRoute user={user} requiredRole="admin">
              <QRScanLogin user={user} onLogout={handleLogout} />
            </ProtectedRoute>
          } 
        />
        
        <Route 
          path="/admin" 
          element={
            <ProtectedRoute user={user} requiredRole="admin-qr">
              <AdminDashboard user={user} onLogout={handleLogout} />
            </ProtectedRoute>
          } 
        />

        <Route 
          path="/admin/database" 
          element={
            <ProtectedRoute user={user} requiredRole="admin-super">
              <AdminDatabase user={user} onLogout={handleLogout} />
            </ProtectedRoute>
          } 
        />
        
        <Route 
          path="/manager" 
          element={
            <ProtectedRoute user={user} requiredRole="manager">
              <ManagerDashboard user={user} onLogout={handleLogout} />
            </ProtectedRoute>
          } 
        />
        
        <Route 
          path="/employee" 
          element={
            <ProtectedRoute user={user} requiredRole="employee">
              <EmployeeDashboard user={user} onLogout={handleLogout} />
            </ProtectedRoute>
          } 
        />

        <Route 
          path="/qr-view-employee"
          element={
            <ProtectedRoute user={user} requiredRole="admin-qr-employee">
              <EmployeeDashboard user={user} onLogout={handleLogout} />
            </ProtectedRoute>
          }
        />

        <Route 
          path="/attendance-scanner" 
          element={
            <ProtectedRoute user={user} requiredRole="employee">
              <AttendanceScanner user={user} onLogout={handleLogout} />
            </ProtectedRoute>
          } 
        />
        
        <Route 
          path="/employee-qr-scanner" 
          element={
            <ProtectedRoute user={user} requiredRole="employee">
              <EmployeeQRScanner user={user} onLogout={handleLogout} />
            </ProtectedRoute>
          } 
        />

        <Route 
          path="/attendance" 
          element={
            <ProtectedRoute user={user} requiredRole="admin-super">
              <AttendanceManagement user={user} onLogout={handleLogout} />
            </ProtectedRoute>
          } 
        />

        <Route 
          path="/salary" 
          element={
            <ProtectedRoute user={user} requiredRole="admin-super">
              <SalaryTracker user={user} onLogout={handleLogout} />
            </ProtectedRoute>
          } 
        />

        <Route 
          path="/salary-manager" 
          element={
            <ProtectedRoute user={user} requiredRole="manager-super">
              <SalaryTracker user={user} onLogout={handleLogout} />
            </ProtectedRoute>
          } 
        />

        <Route 
          path="/salary-record" 
          element={
            <ProtectedRoute user={user} requiredRole="manager-super">
              <ViewSalaryRecord user={user} onLogout={handleLogout} />
            </ProtectedRoute>
          } 
        />

        <Route 
          path="/records" 
          element={
            <ProtectedRoute user={user} requiredRole="manager">
              <EmployeeRecords user={user} onLogout={handleLogout} />
            </ProtectedRoute>
          } 
        />

        <Route 
          path="/users" 
          element={
            <ProtectedRoute user={user} requiredRole="admin-super">
              <UserManagement user={user} onLogout={handleLogout} />
            </ProtectedRoute>
          } 
        />

        <Route 
          path="/profile" 
          element={
            <ProtectedRoute user={user}>
              <ProfileSetting user={user} onLogout={handleLogout} setUser={setUser} />
            </ProtectedRoute>
          } 
        />
        
        <Route 
          path="/" 
          element={<Navigate to={user ? getRoleRedirect(user.userRole) : '/login'} />} 
        />
      </Routes>
    </Router>
  );
}

export default App;
