const crypto = require('crypto');
const { FRONTEND_ORIGINS } = require('../config/env');
const { sendError } = require('../utils/apiResponse');
const { logWarn } = require('../utils/logger');

function normalizeOrigin(origin) {
  if (!origin || typeof origin !== 'string') return null;
  try {
    return new URL(origin.trim()).origin;
  } catch {
    return null;
  }
}

function isAllowedOrigin(origin) {
  if (!origin) return true;
  const normalized = normalizeOrigin(origin);
  return Boolean(normalized) && FRONTEND_ORIGINS.includes(normalized);
}

function isAuthWritePathExempt(req) {
  if (req.method !== 'POST') return false;
  return req.path === '/login' || req.path === '/register';
}

function getOrCreateCsrfToken(req) {
  if (!req.session.csrfToken) {
    req.session.csrfToken = crypto.randomBytes(32).toString('hex');
  }
  return req.session.csrfToken;
}

function exposeCsrfToken(req, res, next) {
  res.locals.csrfToken = getOrCreateCsrfToken(req);
  next();
}

function requireCsrf(req, res, next) {
  const methodsToProtect = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
  if (!methodsToProtect.has(req.method)) {
    return next();
  }

  if (isAuthWritePathExempt(req)) {
    const origin = req.get('origin') ?? null;
    if (!isAllowedOrigin(origin)) {
      logWarn('auth_origin_forbidden', { endpoint: req.path, origin: origin ?? 'none', reason: 'origin_not_allowed' });
      return sendError(res, 403, 'ORIGIN_FORBIDDEN', 'Origin not allowed for authentication');
    }
    return next();
  }

  const token = req.get('X-CSRF-Token');
  const sessionToken = req.session?.csrfToken;
  if (!token || !sessionToken || token !== sessionToken) {
    logWarn('csrf_rejected', {
      path: req.originalUrl,
      method: req.method,
      origin: req.get('origin') ?? 'none',
      reason: !token ? 'header_missing' : !sessionToken ? 'session_token_missing' : 'token_mismatch',
    });
    return sendError(res, 403, 'INVALID_CSRF', 'Invalid CSRF token');
  }
  return next();
}

module.exports = { getOrCreateCsrfToken, exposeCsrfToken, requireCsrf };
