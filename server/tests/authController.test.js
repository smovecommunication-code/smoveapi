import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { buildAuthController } = require('../controllers/authController');

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
    clearCookie() {
      return this;
    },
  };
}

function createSession() {
  return {
    regenerate(cb) {
      cb();
    },
    destroy(cb) {
      cb();
    },
  };
}

describe('auth controller session and logout', () => {
  it('session returns null user when unauthenticated', async () => {
    const authController = buildAuthController({ authService: { getSessionUser: async () => null } });
    const req = { session: {} };
    const res = createRes();

    await authController.getSession(req, res);

    expect(res.statusCode).toBe(200);
    expect(res.body.data.user).toBeNull();
    expect(typeof res.body.data.csrfToken).toBe('string');
  });

  it('session restores local admin user with role metadata', async () => {
    const authController = buildAuthController({
      authService: {
        getSessionUser: async () => ({
          id: 'admin-1',
          email: 'admin@test.com',
          name: 'Admin',
          role: 'admin',
          status: 'staff',
          accountStatus: 'active',
          authProvider: 'local',
        }),
      },
    });
    const req = { session: { userId: 'admin-1', role: 'admin', authenticatedAt: '2026-04-07T00:00:00.000Z' } };
    const res = createRes();

    await authController.getSession(req, res);

    expect(res.statusCode).toBe(200);
    expect(res.body.data.user.role).toBe('admin');
    expect(res.body.data.user.accountStatus).toBe('active');
    expect(res.body.data.session.role).toBe('admin');
    expect(res.body.data.session.authProvider).toBe('local');
  });

  it('register endpoint starts session on success', async () => {
    const authController = buildAuthController({
      authService: {
        register: async () => ({
          ok: true,
          user: { id: 'u1', email: 'u@test.com', role: 'client', status: 'client', accountStatus: 'active' },
        }),
      },
    });

    const req = { session: createSession(), body: { email: 'u@test.com' }, method: 'POST', originalUrl: '/register' };
    const res = createRes();

    await authController.register(req, res);

    expect(res.statusCode).toBe(201);
    expect(res.body.data.user.email).toBe('u@test.com');
    expect(req.session.userId).toBe('u1');
  });

  it('register endpoint responds forbidden when registration is disabled', async () => {
    const authController = buildAuthController({
      authService: { register: async () => ({ ok: false, status: 403, code: 'REGISTRATION_DISABLED', message: 'disabled' }) },
    });
    const req = { session: createSession(), body: {} };
    const res = createRes();

    await authController.register(req, res);
    expect(res.statusCode).toBe(403);
  });


  it('login endpoint starts session on success', async () => {
    const authController = buildAuthController({
      authService: {
        login: async () => ({
          ok: true,
          user: { id: 'u2', email: 'login@test.com', role: 'author', status: 'staff', accountStatus: 'active' },
        }),
      },
    });

    const req = { session: createSession(), body: { email: 'login@test.com' }, method: 'POST', originalUrl: '/login' };
    const res = createRes();

    await authController.login(req, res);

    expect(res.statusCode).toBe(200);
    expect(res.body.data.user.email).toBe('login@test.com');
    expect(req.session.userId).toBe('u2');
  });

  it('logout destroys session cleanly', async () => {
    const authController = buildAuthController({ authService: {} });
    const req = { session: createSession(), method: 'POST', originalUrl: '/logout' };
    const res = createRes();

    await authController.logout(req, res);

    expect(res.statusCode).toBe(200);
    expect(res.body.data.user).toBeNull();
  });
});


describe('oauth controller flow', () => {
  it('oauth start redirects to provider auth url', async () => {
    const authController = buildAuthController({
      authService: {
        buildOAuthAuthorizationUrl: () => ({ ok: true, url: 'https://accounts.example/auth' }),
      },
    });
    const req = { params: { provider: 'google' }, query: { redirectTo: 'http://127.0.0.1:5174/#login' }, session: {}, method: 'GET', originalUrl: '/oauth/google/start' };
    const res = { redirectUrl: null, redirect(url) { this.redirectUrl = url; } };

    await authController.startOAuth(req, res);
    expect(res.redirectUrl).toBe('https://accounts.example/auth');
    expect(typeof req.session.oauth.state).toBe('string');
  });

  it('oauth start returns 403 when provider is disabled', async () => {
    const authController = buildAuthController({
      authService: {
        buildOAuthAuthorizationUrl: () => ({
          ok: false,
          status: 403,
          code: 'OAUTH_PROVIDER_DISABLED',
          message: 'google OAuth login is disabled',
        }),
      },
    });
    const req = { params: { provider: 'google' }, query: {}, session: {}, method: 'GET', originalUrl: '/oauth/google/start' };
    const res = createRes();

    await authController.startOAuth(req, res);
    expect(res.statusCode).toBe(403);
    expect(res.body.error.code).toBe('OAUTH_PROVIDER_DISABLED');
  });

  it('oauth callback returns 403 when provider is disabled', async () => {
    const authController = buildAuthController({
      authService: {
        loginWithOAuthCode: async () => ({
          ok: false,
          status: 403,
          code: 'OAUTH_PROVIDER_DISABLED',
          message: 'facebook OAuth login is disabled',
        }),
      },
    });
    const req = {
      params: { provider: 'facebook' },
      query: { state: 'abc', code: 'oauth-code' },
      session: { oauth: { provider: 'facebook', state: 'abc', redirectTo: 'http://localhost:5174/#login' } },
      method: 'GET',
      originalUrl: '/oauth/facebook/callback',
    };
    const res = createRes();

    await authController.handleOAuthCallback(req, res);
    expect(res.statusCode).toBe(403);
    expect(res.body.error.code).toBe('OAUTH_PROVIDER_DISABLED');
  });
});
