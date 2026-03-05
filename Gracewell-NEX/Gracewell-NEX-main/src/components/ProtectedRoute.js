import React from 'react';
import { Navigate } from 'react-router-dom';
import { getAccessToken, isTokenExpired } from '../utils/authService';
import { getRoleRedirect, canAccessRoute } from '../utils/roleRedirectMap';

/**
 * ProtectedRoute Component
 * =======================
 * Validates user authentication and role-based access
 * Ensures consistent role hierarchy enforcement
 * 
 * Props:
 *   - user: User object from auth state
 *   - requiredRole: Role required for access (e.g., 'admin', 'admin-super', 'manager')
 *   - children: Route component to render if authorized
 */
const ProtectedRoute = ({ user, requiredRole, children }) => {
  const token = getAccessToken();

  // Check if user is authenticated and token valid
  if (!token) {
    return <Navigate to="/login" replace />;
  }

  if (isTokenExpired(token)) {
    return <Navigate to="/login" replace />;
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  // Check account status
  if (user.status === 'inactive') {
    return <Navigate to="/login" replace />;
  }

  /**
   * Role hierarchy with composite role support
   * ==========================================
   * Single roles: 'admin', 'manager', 'employee', 'qr_scanner'
   * Composite roles (multi-role access):
   *   - 'admin-super': Admin + Super Admin (full admin access)
   *   - 'admin-qr': Admin + QR Scanner (scanning + admin)
   *   - 'admin-qr-employee': Admin + Super Admin + QR Scanner + Employee (shared scanner)
   *   - 'manager-super': Manager + Admin + Super Admin (hierarchy-based)
   */
  const checkRoleAccess = (userRole, required) => {
    if (!required) return true; // No role requirement

    // Composite role checks with hierarchy
    if (required === 'admin-qr') {
      // Allows: admin, super_admin, qr_scanner
      return ['admin', 'super_admin', 'qr_scanner'].includes(userRole);
    }

    if (required === 'admin-qr-employee') {
      // Allows: admin, super_admin, qr_scanner, employee
      return ['admin', 'super_admin', 'qr_scanner', 'employee'].includes(userRole);
    }
    
    if (required === 'admin-super') {
      // Allows: super_admin, admin (for super admin features)
      return ['admin', 'super_admin'].includes(userRole);
    }
    
    if (required === 'admin') {
      // Allows: admin, super_admin
      return ['admin', 'super_admin'].includes(userRole);
    }
    
    if (required === 'manager-super') {
      // Allows: manager, admin, super_admin
      return ['manager', 'super_admin', 'admin'].includes(userRole);
    }
    
    if (required === 'manager') {
      // Allows: manager, admin, super_admin (hierarchy)
      return ['manager', 'admin', 'super_admin'].includes(userRole);
    }
    
    if (required === 'employee') {
      // Allows: employee and qr_scanner (both do attendance operations)
      return ['employee', 'qr_scanner'].includes(userRole);
    }

    return false;
  };

  // Check role-based access and redirect if unauthorized
  if (requiredRole && !checkRoleAccess(user.userRole, requiredRole)) {
    const redirectPath = getRoleRedirect(user.userRole);
    console.warn(
      `[ProtectedRoute] Access denied: ${user.userRole} cannot access ${requiredRole}. ` +
      `Redirecting to ${redirectPath}`
    );
    return <Navigate to={redirectPath} replace />;
  }

  return children;
};

export default ProtectedRoute;
