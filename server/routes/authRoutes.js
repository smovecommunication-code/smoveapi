const express = require('express');
const { requireCsrf } = require('../middleware/csrf');
const { createAuthRateLimiter } = require('../middleware/authRateLimit');
const { AUTH_RATE_LIMIT_MAX, AUTH_RATE_LIMIT_WINDOW_MS } = require('../config/env');
const { requireAuthenticated, requirePermission } = require('../middleware/authz');
const { Permissions } = require('../security/rbac');

function createAuthRoutes({ authController }) {
  const router = express.Router();

  const limiter = createAuthRateLimiter({
    windowMs: AUTH_RATE_LIMIT_WINDOW_MS,
    max: AUTH_RATE_LIMIT_MAX,
  });

  router.get('/session', authController.getSession);
  router.get('/oauth/providers', authController.getOAuthProviders);
  router.get('/oauth/:provider/start', limiter, authController.startOAuth);
  router.get('/oauth/:provider/callback', limiter, authController.handleOAuthCallback);
  router.post('/register', limiter, requireCsrf, authController.register);
  router.post('/login', limiter, requireCsrf, authController.login);
  router.post('/verify-email', limiter, requireCsrf, authController.verifyEmail);
  router.post('/verify-email/resend', requireAuthenticated, requireCsrf, authController.resendVerification);
  router.post('/password-reset/request', limiter, requireCsrf, authController.requestPasswordReset);
  router.post('/forgot-password', limiter, requireCsrf, authController.requestPasswordReset);
  router.post('/password-reset/confirm', limiter, requireCsrf, authController.confirmPasswordReset);
  router.post('/reset-password', limiter, requireCsrf, authController.confirmPasswordReset);
  router.get('/admin/users', requireAuthenticated, requirePermission(Permissions.USER_MANAGE), authController.listUsers);
  router.patch('/admin/users/:userId', requireAuthenticated, requirePermission(Permissions.USER_MANAGE), authController.updateUserByAdmin);
  router.get('/admin/audit-events', requireAuthenticated, requirePermission(Permissions.USER_MANAGE), authController.listAuditEvents);
  router.post('/logout', requireCsrf, authController.logout);

  return router;
}

module.exports = { createAuthRoutes };
