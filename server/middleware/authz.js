const { hasPermission } = require('../security/rbac');

function requireAuthenticated(req, res, next) {
  if (!req.session?.userId && !req.appUser?.id) {
    return res.status(401).json({ success: false, error: { code: 'UNAUTHENTICATED', message: 'Authentication required' } });
  }
  if (req.appUser?.accountStatus === 'suspended') {
    return res.status(403).json({ success: false, error: { code: 'ACCOUNT_SUSPENDED', message: 'Account suspended' } });
  }
  if ((req.appUser?.accountStatus ?? req.session?.accountStatus) === 'invited') {
    return res.status(403).json({ success: false, error: { code: 'ACCOUNT_INVITED', message: 'Account invitation pending activation' } });
  }
  return next();
}

function requirePermission(permission) {
  return (req, res, next) => {
    if (req.appUser?.accountStatus === 'suspended') {
      return res.status(403).json({ success: false, error: { code: 'ACCOUNT_SUSPENDED', message: 'Account suspended' } });
    }
    if (req.appUser?.accountStatus === 'invited') {
      return res.status(403).json({ success: false, error: { code: 'ACCOUNT_INVITED', message: 'Account invitation pending activation' } });
    }

    const role = req.appUser?.role ?? req.session?.role;
    if (!role || !hasPermission(role, permission)) {
      return res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'Insufficient permissions' } });
    }
    return next();
  };
}

module.exports = { requireAuthenticated, requirePermission };
