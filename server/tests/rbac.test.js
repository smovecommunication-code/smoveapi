import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { Roles, Permissions, hasPermission } = require('../security/rbac');

describe('rbac permissions', () => {
  it('allows admin on user manage', () => {
    expect(hasPermission(Roles.ADMIN, Permissions.USER_MANAGE)).toBe(true);
  });

  it('denies normal users CMS access and protected CMS content reads', () => {
    for (const role of [Roles.VIEWER, Roles.CLIENT, Roles.USER]) {
      expect(hasPermission(role, Permissions.CMS_ACCESS)).toBe(false);
      expect(hasPermission(role, Permissions.CONTENT_READ)).toBe(false);
    }
  });

  it('allows admin, editor, and author to access the CMS', () => {
    for (const role of [Roles.ADMIN, Roles.EDITOR, Roles.AUTHOR]) {
      expect(hasPermission(role, Permissions.CMS_ACCESS)).toBe(true);
      expect(hasPermission(role, Permissions.CONTENT_READ)).toBe(true);
    }
  });

  it('allows admin cms access', () => {
    expect(hasPermission(Roles.ADMIN, Permissions.CMS_ACCESS)).toBe(true);
  });
});
