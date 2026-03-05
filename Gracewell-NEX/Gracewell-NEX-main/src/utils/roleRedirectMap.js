/**
 * Role-Based Redirect Mapping & Utilities
 * =======================================
 * 
 * Centralized redirect logic for consistent role-based navigation
 * This ensures all role redirects are uniform across the application
 * 
 * Role Hierarchy:
 *   super_admin (highest) ── full system access ── → /admin
 *   admin                ─── full system access ── → /admin
 *   manager              ── limited system access ── → /manager
 *   employee             ─── basic access ─────── → /employee
 *   qr_scanner           ─── scan only ───────── → /qr-scanner
 */

/**
 * Get primary route redirect for a given role
 * @param {string} role - User role (super_admin, admin, manager, employee, qr_scanner)
 * @returns {string} Primary redirect path for the role
 * 
 * Usage:
 *   const redirect = getRoleRedirect('admin'); // Returns '/admin'
 *   navigate(redirect);
 */
export const getRoleRedirect = (role) => {
  const redirectMap = {
    'super_admin': '/admin',      // Super admin → Admin Dashboard
    'admin': '/admin',             // Admin → Admin Dashboard
    'manager': '/manager',         // Manager → Manager Dashboard
    'qr_scanner': '/qr-scanner',   // QR Scanner → QR Scanner Interface
    'employee': '/employee'        // Employee → Employee Portal
  };

  return redirectMap[role] || '/employee'; // Fallback to employee
};

/**
 * Get home route for a given role (used for Home button, root redirect)
 * @param {string} role - User role
 * @returns {string} Home route for the role
 */
export const getHomeRoute = (role) => {
  return getRoleRedirect(role);
};

/**
 * Check if role can access a specific route/feature
 * Implements role hierarchy: higher roles inherit lower role permissions
 * 
 * @param {string} userRole - User's current role
 * @param {string} requiredRole - Required role for access
 * @returns {boolean} True if user can access the route
 * 
 * Usage:
 *   if (canAccessRoute(user.userRole, 'admin')) {
 *     // Show admin-only features
 *   }
 */
export const canAccessRoute = (userRole, requiredRole) => {
  // Define role hierarchy (higher index = higher privilege)
  const roleHierarchy = ['qr_scanner', 'employee', 'manager', 'admin', 'super_admin'];
  
  const userRoleIndex = roleHierarchy.indexOf(userRole);
  const requiredRoleIndex = roleHierarchy.indexOf(requiredRole);

  // User role must be equal to or higher than required role
  return userRoleIndex >= requiredRoleIndex;
};

/**
 * Determine redirect after login based on role and context
 * @param {Object} user - User object from login response
 * @returns {string} Redirect path after successful login
 * 
 * Login Redirect Rules:
 *   1. Employee in attendance mode → /qr-scanner (main attendance scanner)
 *   2. QR Scanner → /qr-scanner (scan QR codes)
 *   3. Super Admin/Admin → /admin (Admin Dashboard)
 *   4. Manager → /manager (Manager Dashboard)
 *   5. Employee → /employee (Employee Portal)
 */
export const getPostLoginRedirect = (user) => {
  if (!user || !user.userRole) {
    console.warn('[Role Redirect] Invalid user object for post-login redirect');
    return '/employee';
  }

  // Employee in attendance mode (no password login, direct QR check-in)
  if (user.userRole === 'employee' && user.isAttendanceMode) {
    console.log('[Role Redirect] Employee in attendance mode → /qr-scanner');
    return '/qr-scanner';
  }

  // Standard role-based redirects
  const redirect = getRoleRedirect(user.userRole);
  console.log(`[Role Redirect] ${user.userRole} → ${redirect}`);
  return redirect;
};

/**
 * Role Permission Definitions
 * Used to determine which features/dashboards a role can access
 */
export const rolePermissions = {
  super_admin: [
    'dashboard',
    'attendance',
    'employee_records',
    'payroll_salary',
    'user_management',
    'audit_logs',
    'system_settings'
  ],
  admin: [
    'dashboard',
    'attendance',
    'employee_records',
    'payroll_salary',
    'user_management',
    'audit_logs'
  ],
  manager: [
    'dashboard',
    'attendance',
    'employee_records',
    'payroll_salary'
  ],
  employee: [
    'dashboard',
    'employee_records'
  ],
  qr_scanner: [
    'qr_scan',
    'attendance'
  ]
};

/**
 * Check if role has permission for a specific feature
 * @param {string} role - User role
 * @param {string} permission - Required permission (e.g., 'dashboard', 'attendance')
 * @returns {boolean} True if role has permission
 */
export const hasPermission = (role, permission) => {
  const permissions = rolePermissions[role] || [];
  return permissions.includes(permission);
};

/**
 * Get all accessible dashboards for a role
 * @param {string} role - User role
 * @returns {Array<string>} List of accessible dashboard routes
 */
export const getAccessibleDashboards = (role) => {
  const dashboards = {
    super_admin: ['/admin', '/admin/database'],
    admin: ['/admin', '/admin/database'],
    manager: ['/manager'],
    employee: ['/employee'],
    qr_scanner: ['/qr-scanner']
  };

  return dashboards[role] || ['/employee'];
};

/**
 * Validate that redirect is valid for user's role
 * Prevents unauthorized redirects
 * 
 * @param {string} userRole - User's current role
 * @param {string} targetRoute - Route user is trying to access
 * @returns {Object} { valid: boolean, validRoute: string }
 */
export const validateRedirect = (userRole, targetRoute) => {
  const accessibleRoutes = getAccessibleDashboards(userRole);
  
  // Check if target route is accessible by this role
  const isValid = accessibleRoutes.some(route => targetRoute.startsWith(route));

  if (!isValid) {
    console.warn(
      `[Role Redirect] Redirect prevented: ${userRole} cannot access ${targetRoute}. ` +
      `Redirecting to ${getRoleRedirect(userRole)}`
    );
  }

  return {
    valid: isValid,
    validRoute: isValid ? targetRoute : getRoleRedirect(userRole)
  };
};

/**
 * Export all utilities as a single object for convenience
 */
export default {
  getRoleRedirect,
  getHomeRoute,
  canAccessRoute,
  getPostLoginRedirect,
  hasPermission,
  getAccessibleDashboards,
  validateRedirect,
  rolePermissions
};
