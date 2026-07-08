/**
 * RBAC (Role-Based Access Control) Middleware
 * Provides granular permission checks beyond simple role checks.
 *
 * Default permission sets by role:
 *   admin      → all permissions
 *   manager    → job/attendance/report scoped
 *   technician → own-job scoped
 */

const DEFAULT_PERMISSIONS = {
  admin: {
    canAssignJobs: true,
    canEditUsers: true,
    canDeleteUsers: true,
    canViewReports: true,
    canApprovePayments: true,
    canApproveCompletions: true,
    canManageServices: true,
    canViewAllJobs: true,
    canSendNotifications: true,
    canExportData: true,
  },
  manager: {
    canAssignJobs: true,
    canEditUsers: false,
    canDeleteUsers: false,
    canViewReports: true,
    canApprovePayments: false,
    canApproveCompletions: true,
    canManageServices: false,
    canViewAllJobs: true,
    canSendNotifications: true,
    canExportData: false,
  },
  technician: {
    canAssignJobs: false,
    canEditUsers: false,
    canDeleteUsers: false,
    canViewReports: false,
    canApprovePayments: false,
    canApproveCompletions: false,
    canManageServices: false,
    canViewAllJobs: false,
    canSendNotifications: false,
    canExportData: false,
  },
  client: {
    canAssignJobs: false,
    canEditUsers: false,
    canDeleteUsers: false,
    canViewReports: false,
    canApprovePayments: false,
    canApproveCompletions: false,
    canManageServices: false,
    canViewAllJobs: false,
    canSendNotifications: false,
    canExportData: false,
  },
};

/**
 * Resolves effective permissions for a user.
 * Merges role defaults with any user-level permission overrides stored in DB.
 * User.permissions is an array of strings (e.g., ["canViewReports"]) that
 * GRANT extra permissions beyond role defaults.
 */
function resolvePermissions(user) {
  const role = user.role || 'technician';
  const base = { ...(DEFAULT_PERMISSIONS[role] || DEFAULT_PERMISSIONS.technician) };

  // Apply user-level overrides (grants from DB)
  if (Array.isArray(user.permissions)) {
    for (const perm of user.permissions) {
      base[perm] = true;
    }
  }

  return base;
}

/**
 * Middleware factory: require a specific permission.
 * Usage: router.delete('/:id', authenticate, requirePermission('canDeleteUsers'), handler)
 *
 * Requires authenticate() to have run first (req.authUser populated).
 */
function requirePermission(permission) {
  return (req, res, next) => {
    if (!req.authUser) {
      return res.status(401).json({ success: false, message: 'Authentication required' });
    }

    const perms = resolvePermissions(req.authUser);
    if (!perms[permission]) {
      return res.status(403).json({
        success: false,
        message: `Access denied: you do not have the '${permission}' permission`,
      });
    }

    // Attach resolved permissions to request for downstream use
    req.permissions = perms;
    next();
  };
}

/**
 * Middleware: attach permissions to req without blocking.
 * Useful for UI-gating data in responses.
 */
function attachPermissions(req, res, next) {
  if (req.authUser) {
    req.permissions = resolvePermissions(req.authUser);
  }
  next();
}

module.exports = {
  requirePermission,
  attachPermissions,
  resolvePermissions,
  DEFAULT_PERMISSIONS,
};
