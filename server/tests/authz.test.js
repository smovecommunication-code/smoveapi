import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { requireAuthenticated, requirePermission } = require('../middleware/authz');

function createRes() {
  return {
    statusCode: 200,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
  };
}

describe('authz middleware', () => {
  it('blocks suspended authenticated user before permission checks', () => {
    const req = {
      appUser: { id: 'u1', role: 'admin', accountStatus: 'suspended' },
      session: null,
    };
    const res = createRes();
    let nextCalled = false;

    requireAuthenticated(req, res, () => {
      nextCalled = true;
    });

    expect(nextCalled).toBe(false);
    expect(res.statusCode).toBe(403);
    expect(res.body?.error?.code).toBe('ACCOUNT_SUSPENDED');
  });

  it('allows active admin to pass CMS access permission check', () => {
    const req = {
      appUser: { id: 'u2', role: 'admin', accountStatus: 'active' },
      session: null,
    };
    const res = createRes();
    let nextCalled = false;

    requirePermission('cms:access')(req, res, () => {
      nextCalled = true;
    });

    expect(nextCalled).toBe(true);
    expect(res.statusCode).toBe(200);
  });

  it('blocks invited accounts before permission checks', () => {
    const req = {
      appUser: { id: 'u3', role: 'editor', accountStatus: 'invited' },
      session: null,
    };
    const res = createRes();
    let nextCalled = false;

    requireAuthenticated(req, res, () => {
      nextCalled = true;
    });

    expect(nextCalled).toBe(false);
    expect(res.statusCode).toBe(403);
    expect(res.body?.error?.code).toBe('ACCOUNT_INVITED');
  });

  it('allows local session admin without OAuth claims to pass CMS access checks', () => {
    const req = {
      appUser: null,
      session: { userId: 'local-admin', role: 'admin' },
    };
    const res = createRes();
    let nextCalled = false;

    requireAuthenticated(req, res, () => {
      nextCalled = true;
    });
    expect(nextCalled).toBe(true);

    requirePermission('cms:access')(req, res, () => {
      nextCalled = true;
    });

    expect(nextCalled).toBe(true);
    expect(res.statusCode).toBe(200);
  });
});
