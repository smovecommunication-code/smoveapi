const Roles = {
  ADMIN: 'admin',
  EDITOR: 'editor',
  AUTHOR: 'author',
  VIEWER: 'viewer',
  CLIENT: 'client',
};

const Permissions = {
  CMS_ACCESS: 'cms:access',
  CONTENT_READ: 'content:read',
  CONTENT_WRITE: 'content:write',
  CONTENT_PUBLISH: 'content:publish',
  CONTENT_WRITE_OWN: 'content:write:own',
  CONTENT_DELETE_OWN: 'content:delete:own',
  USER_MANAGE: 'user:manage',
  AUDIT_READ: 'audit:read',
};

const rolePermissions = {
  [Roles.ADMIN]: new Set(Object.values(Permissions)),
  [Roles.EDITOR]: new Set([
    Permissions.CMS_ACCESS,
    Permissions.CONTENT_READ,
    Permissions.CONTENT_WRITE,
    Permissions.CONTENT_PUBLISH,
    Permissions.AUDIT_READ,
  ]),
  [Roles.AUTHOR]: new Set([
    Permissions.CMS_ACCESS,
    Permissions.CONTENT_READ,
    Permissions.CONTENT_WRITE,
    Permissions.CONTENT_WRITE_OWN,
    Permissions.CONTENT_DELETE_OWN,
  ]),
  [Roles.VIEWER]: new Set([Permissions.CONTENT_READ]),
  [Roles.CLIENT]: new Set(),
};

function hasPermission(role, permission) {
  const permissions = rolePermissions[role];
  return Boolean(permissions && permissions.has(permission));
}

module.exports = { Roles, Permissions, rolePermissions, hasPermission };
