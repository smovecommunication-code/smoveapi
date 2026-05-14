const crypto = require('crypto');
const { FRONTEND_ORIGIN, FRONTEND_ORIGINS } = require('../config/env');
const { getOrCreateCsrfToken } = require('../middleware/csrf');
const { sendSuccess, sendError } = require('../utils/apiResponse');
const { logAuthEvent, listAuthAuditEvents } = require('../utils/authLogger');

function buildSessionMeta(req, user) {
  return {
    sessionId: req.sessionID ?? null,
    authenticatedAt: req.session?.authenticatedAt ?? null,
    lastActivityAt: new Date().toISOString(),
    authProvider: user?.authProvider ?? null,
    role: user?.role ?? null,
  };
}

function startSession(req, res, user, eventName, statusCode = 200, extras = {}) {
  req.session.regenerate((regenerateError) => {
    if (regenerateError) {
      logAuthEvent(req, eventName, 'failure', { code: 'SESSION_ERROR' });
      return sendError(res, 500, 'SESSION_ERROR', 'Failed to initialize session');
    }

    req.session.userId = user.id;
    req.session.role = user.role;
    req.session.organizationId = user.organizationId ?? 'org_default';
    req.session.planTier = user.planTier ?? 'free';
    req.session.accountStatus = user.accountStatus ?? 'active';
    req.session.authenticatedAt = new Date().toISOString();

    logAuthEvent(req, eventName, 'success', { userId: user.id, email: user.email });
    return sendSuccess(res, statusCode, {
      user,
      csrfToken: getOrCreateCsrfToken(req),
      session: buildSessionMeta(req, user),
      ...extras,
    });
  });
}

function finishOAuthSession(req, res, user, eventName, redirectTo) {
  req.session.regenerate((regenerateError) => {
    if (regenerateError) {
      logAuthEvent(req, eventName, 'failure', { code: 'SESSION_ERROR' });
      return res.redirect(`${FRONTEND_ORIGIN}/#login?oauthError=SESSION_ERROR`);
    }

    req.session.userId = user.id;
    req.session.role = user.role;
    req.session.organizationId = user.organizationId ?? 'org_default';
    req.session.planTier = user.planTier ?? 'free';
    req.session.accountStatus = user.accountStatus ?? 'active';
    req.session.authenticatedAt = new Date().toISOString();
    logAuthEvent(req, eventName, 'success', { userId: user.id, email: user.email });
    return res.redirect(redirectTo);
  });
}

function canonicalizeLoopbackUrl(rawUrl) {
  if (!rawUrl || typeof rawUrl !== 'string') return rawUrl;
  try {
    const parsed = new URL(rawUrl);
    if (parsed.hostname === '127.0.0.1') {
      parsed.hostname = 'localhost';
    }
    return parsed.toString();
  } catch {
    return rawUrl;
  }
}

function parseSafeRedirect(redirectTo, fallback = `${FRONTEND_ORIGIN}/#login`) {
  if (!redirectTo || typeof redirectTo !== 'string') return fallback;
  try {
    const parsed = new URL(canonicalizeLoopbackUrl(redirectTo));
    if (!FRONTEND_ORIGINS.includes(parsed.origin)) {
      return fallback;
    }
    return parsed.toString();
  } catch {
    return fallback;
  }
}

function buildAuthController({ authService }) {
  return {
    getSession: async (req, res) => {
      const user = await authService.getSessionUser(req.session?.userId);

      if (!user) {
        req.session.userId = null;
        req.session.role = null;
        req.session.organizationId = null;
        req.session.planTier = null;
        req.session.accountStatus = null;
        req.session.authenticatedAt = null;
      }

      logAuthEvent(req, 'session', 'success', { authenticated: Boolean(user) });
      return sendSuccess(res, 200, {
        user,
        csrfToken: getOrCreateCsrfToken(req),
        session: buildSessionMeta(req, user),
      });
    },

    startOAuth: async (req, res) => {
      const { provider } = req.params;
      const redirectTo = parseSafeRedirect(req.query?.redirectTo, `${FRONTEND_ORIGIN}/#login`);
      const state = crypto.randomBytes(24).toString('hex');

      req.session.oauth = {
        provider,
        state,
        redirectTo,
        createdAt: Date.now(),
      };

      const result = authService.buildOAuthAuthorizationUrl({ provider, state });
      if (!result.ok) {
        logAuthEvent(req, `oauth_start_${provider}`, 'failure', { code: result.code });
        if (result.code === 'OAUTH_PROVIDER_DISABLED' || result.code === 'OAUTH_PROVIDER_UNSUPPORTED') {
          return sendError(res, result.status, result.code, result.message);
        }
        return res.redirect(`${redirectTo}?oauthError=${encodeURIComponent(result.code)}`);
      }

      logAuthEvent(req, `oauth_start_${provider}`, 'success');
      return res.redirect(result.url);
    },

    handleOAuthCallback: async (req, res) => {
      const { provider } = req.params;
      const storedOAuth = req.session?.oauth ?? null;
      const fallbackRedirect = parseSafeRedirect(storedOAuth?.redirectTo, `${FRONTEND_ORIGIN}/#login`);

      if (req.query?.error) {
        const code = String(req.query.error);
        logAuthEvent(req, `oauth_${provider}`, 'failure', { code });
        return res.redirect(`${fallbackRedirect}?oauthError=${encodeURIComponent(code)}`);
      }

      if (!storedOAuth || storedOAuth.provider !== provider || storedOAuth.state !== req.query?.state) {
        logAuthEvent(req, `oauth_${provider}`, 'failure', { code: 'OAUTH_STATE_INVALID' });
        return res.redirect(`${fallbackRedirect}?oauthError=OAUTH_STATE_INVALID`);
      }

      req.session.oauth = null;

      const result = await authService.loginWithOAuthCode({ provider, code: req.query?.code });
      if (!result.ok) {
        logAuthEvent(req, `oauth_${provider}`, 'failure', { code: result.code });
        if (result.code === 'OAUTH_PROVIDER_DISABLED' || result.code === 'OAUTH_PROVIDER_UNSUPPORTED') {
          return sendError(res, result.status, result.code, result.message);
        }
        return res.redirect(`${fallbackRedirect}?oauthError=${encodeURIComponent(result.code)}`);
      }

      return finishOAuthSession(req, res, result.user, `oauth_${provider}`, fallbackRedirect);
    },

    register: async (req, res) => {
      const result = await authService.register(req.body ?? {});
      if (!result.ok) {
        logAuthEvent(req, 'register', 'failure', { code: result.code, reason: result.reason ?? null, email: req.body?.email ?? null });
        return sendError(res, result.status, result.code, result.message);
      }

      return startSession(req, res, result.user, 'register', 201, {
        verification: result.verification ?? null,
      });
    },

    login: async (req, res) => {
      const result = await authService.login(req.body ?? {});
      if (!result.ok) {
        logAuthEvent(req, 'login', 'failure', { code: result.code, reason: result.reason ?? null, email: req.body?.email ?? null });
        return sendError(res, result.status, result.code, result.message);
      }

      return startSession(req, res, result.user, 'login', 200);
    },

    resendVerification: async (req, res) => {
      const result = await authService.resendVerification({ userId: req.session?.userId });
      if (!result.ok) {
        logAuthEvent(req, 'verify_resend', 'failure', { code: result.code });
        return sendError(res, result.status, result.code, result.message);
      }
      logAuthEvent(req, 'verify_resend', 'success', { userId: req.session?.userId });
      return sendSuccess(res, 200, {
        user: result.user,
        verification: result.verification,
        csrfToken: getOrCreateCsrfToken(req),
        session: buildSessionMeta(req, result.user),
      });
    },

    verifyEmail: async (req, res) => {
      const token = req.body?.token;
      const result = await authService.verifyEmailToken({ token });
      if (!result.ok) {
        logAuthEvent(req, 'verify_email', 'failure', { code: result.code });
        return sendError(res, result.status, result.code, result.message);
      }

      if (req.session?.userId && String(req.session.userId) === String(result.user.id)) {
        req.session.role = result.user.role;
      }

      logAuthEvent(req, 'verify_email', 'success', { userId: result.user.id });
      return sendSuccess(res, 200, {
        user: result.user,
        csrfToken: getOrCreateCsrfToken(req),
        session: buildSessionMeta(req, result.user),
      });
    },


    requestPasswordReset: async (req, res) => {
      const result = await authService.requestPasswordReset({ email: req.body?.email });
      if (!result.ok) {
        logAuthEvent(req, 'password_reset_request', 'failure', { code: result.code });
        return sendError(res, result.status, result.code, result.message);
      }

      logAuthEvent(req, 'password_reset_request', 'success', { requested: Boolean(req.body?.email) });
      return sendSuccess(res, 200, {
        reset: {
          emailDeliveryReady: result.emailDeliveryReady,
          expiresAt: result.expiresAt ?? null,
          devToken: result.devToken ?? null,
          devPreviewUrl: result.devPreviewUrl ?? null,
        },
        csrfToken: getOrCreateCsrfToken(req),
      });
    },

    confirmPasswordReset: async (req, res) => {
      const result = await authService.resetPasswordWithToken({ token: req.body?.token, password: req.body?.password });
      if (!result.ok) {
        logAuthEvent(req, 'password_reset_confirm', 'failure', { code: result.code });
        return sendError(res, result.status, result.code, result.message);
      }

      logAuthEvent(req, 'password_reset_confirm', 'success', { userId: result.user?.id ?? null });
      return sendSuccess(res, 200, { user: result.user, csrfToken: getOrCreateCsrfToken(req) });
    },

    listUsers: async (req, res) => {
      const users = await authService.listUsersForAdmin();
      logAuthEvent(req, 'admin_users_list', 'success', { count: users.length });
      return sendSuccess(res, 200, { users });
    },

    updateUserByAdmin: async (req, res) => {
      const result = await authService.updateUserByAdmin(req.params.userId, req.body ?? {}, {
        id: req.session?.userId,
        role: req.session?.role,
      });
      if (!result.ok) {
        logAuthEvent(req, 'admin_user_update', 'failure', { code: result.code, targetUserId: req.params.userId });
        return sendError(res, result.status, result.code, result.message);
      }
      logAuthEvent(req, 'admin_user_update', 'success', { targetUserId: req.params.userId });
      return sendSuccess(res, 200, { user: result.user });
    },

    listAuditEvents: async (req, res) => {
      const events = listAuthAuditEvents({ limit: req.query?.limit });
      logAuthEvent(req, 'admin_audit_list', 'success', { count: events.length });
      return sendSuccess(res, 200, { events });
    },

    getOAuthProviders: async (_req, res) => {
      const providers = authService.getOAuthProviders?.() ?? {};
      return sendSuccess(res, 200, {
        emailPassword: Boolean(providers.emailPassword?.enabled ?? true),
        google: Boolean(providers.google?.enabled),
        facebook: Boolean(providers.facebook?.enabled),
        providers,
      });
    },

    logout: async (req, res) => {
      req.session.destroy((error) => {
        if (error) {
          logAuthEvent(req, 'logout', 'failure', { code: 'SESSION_ERROR' });
          return sendError(res, 500, 'SESSION_ERROR', 'Failed to logout');
        }

        res.clearCookie('smove.sid');
        logAuthEvent(req, 'logout', 'success');
        return sendSuccess(res, 200, {
          user: null,
          csrfToken: null,
          session: null,
        });
      });
    },
  };
}

module.exports = { buildAuthController };
