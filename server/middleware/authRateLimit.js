const { sendError } = require('../utils/apiResponse');

function createAuthRateLimiter({ windowMs, max }) {
  const buckets = new Map();

  return (req, res, next) => {
    const key = req.ip ?? 'unknown';
    const now = Date.now();
    const current = buckets.get(key) ?? { count: 0, resetAt: now + windowMs };

    if (now > current.resetAt) {
      current.count = 0;
      current.resetAt = now + windowMs;
    }

    current.count += 1;
    buckets.set(key, current);

    if (current.count > max) {
      const retryAfterSeconds = Math.max(1, Math.ceil((current.resetAt - now) / 1000));
      res.setHeader('Retry-After', String(retryAfterSeconds));
      return sendError(res, 429, 'RATE_LIMITED', 'Too many auth attempts. Try again later.');
    }

    return next();
  };
}

module.exports = { createAuthRateLimiter };
