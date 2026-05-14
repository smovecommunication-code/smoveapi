const crypto = require('crypto');
const { sendError } = require('../utils/apiResponse');

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

  const token = req.get('X-CSRF-Token');
  const sessionToken = req.session?.csrfToken;
  if (!token || !sessionToken || token !== sessionToken) {
    return sendError(res, 403, 'INVALID_CSRF', 'Invalid CSRF token');
  }
  return next();
}

module.exports = { getOrCreateCsrfToken, exposeCsrfToken, requireCsrf };
