const express = require('express');
const { requireAuthenticated, requirePermission } = require('../middleware/authz');
const { Permissions } = require('../security/rbac');
const { sendError, sendSuccess } = require('../utils/apiResponse');

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const STATUS_VALUES = new Set(['active', 'unsubscribed']);

function normalizeString(value) {
  return String(value ?? '').trim();
}

function validateNewsletterSubscribePayload(body) {
  const email = normalizeString(body?.email).toLowerCase();
  const source = normalizeString(body?.source).toLowerCase().slice(0, 40) || 'website';

  if (!EMAIL_PATTERN.test(email)) {
    return { ok: false, error: { code: 'NEWSLETTER_INVALID_EMAIL', message: 'Email is invalid.' } };
  }

  return {
    ok: true,
    data: {
      email,
      source,
    },
  };
}

function validateNewsletterUpdatePayload(body) {
  const status = normalizeString(body?.status).toLowerCase();
  if (!STATUS_VALUES.has(status)) {
    return { ok: false, error: { code: 'NEWSLETTER_INVALID_STATUS', message: 'Status must be active or unsubscribed.' } };
  }

  return { ok: true, data: { status } };
}

function createNewsletterRoutes({ newsletterService }) {
  const router = express.Router();

  router.post('/', async (req, res) => {
    const parsed = validateNewsletterSubscribePayload(req.body);
    if (!parsed.ok) {
      return sendError(res, 400, parsed.error.code, parsed.error.message);
    }

    const result = await newsletterService.subscribe(parsed.data);
    res.setHeader('Cache-Control', 'no-store');
    return sendSuccess(res, 200, {
      status: result.subscriber.status,
      action: result.action,
      subscriberId: result.subscriber.id,
      message:
        result.action === 'already_active'
          ? 'This email is already subscribed.'
          : 'Newsletter subscription confirmed.',
    });
  });

  router.use(requireAuthenticated, requirePermission(Permissions.USER_MANAGE));

  router.get('/admin/subscribers', async (req, res) => {
    const data = await newsletterService.listSubscribers({
      page: req.query?.page,
      limit: req.query?.limit,
      query: normalizeString(req.query?.q),
      status: normalizeString(req.query?.status || 'all').toLowerCase(),
      source: normalizeString(req.query?.source || 'all').toLowerCase(),
    });

    res.setHeader('Cache-Control', 'no-store');
    return sendSuccess(res, 200, data);
  });

  router.patch('/admin/subscribers/:id', async (req, res) => {
    const parsed = validateNewsletterUpdatePayload(req.body);
    if (!parsed.ok) {
      return sendError(res, 400, parsed.error.code, parsed.error.message);
    }

    const result = await newsletterService.updateSubscriberStatus(req.params.id, {
      status: parsed.data.status,
      source: 'cms',
    });

    if (!result.ok) {
      return sendError(res, result.status, result.error.code, result.error.message);
    }

    return sendSuccess(res, 200, { subscriber: result.subscriber });
  });

  return router;
}

module.exports = {
  createNewsletterRoutes,
  validateNewsletterSubscribePayload,
  validateNewsletterUpdatePayload,
};
