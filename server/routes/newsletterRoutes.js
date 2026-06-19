const express = require('express');
const { requireAuthenticated, requirePermission } = require('../middleware/authz');
const { Permissions } = require('../security/rbac');
const { sendError, sendSuccess } = require('../utils/apiResponse');

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const TEST_EMAIL_PATTERN = EMAIL_PATTERN;
const STATUS_VALUES = new Set(['active', 'unsubscribed']);

function normalizeString(value) {
  return String(value ?? '').trim();
}

function validateNewsletterSubscribePayload(body) {
  const email = normalizeString(body?.email).toLowerCase();
  const source = normalizeString(body?.source).toLowerCase().slice(0, 40) || 'website';
  const name = normalizeString(body?.name).slice(0, 120);

  if (!EMAIL_PATTERN.test(email)) {
    return { ok: false, error: { code: 'NEWSLETTER_INVALID_EMAIL', message: 'Email is invalid.' } };
  }

  return {
    ok: true,
    data: {
      email,
      name,
      source,
    },
  };
}


function validateNewsletterSendPayload(body) {
  const subject = normalizeString(body?.subject).slice(0, 180);
  const previewText = normalizeString(body?.previewText).slice(0, 220);
  const html = normalizeString(body?.html);
  const text = normalizeString(body?.text);

  if (!subject || (!html && !text)) {
    return { ok: false, error: { code: 'NEWSLETTER_INVALID_CAMPAIGN', message: 'Subject and message body are required.' } };
  }

  return { ok: true, data: { subject, previewText, html, text } };
}

function validateNewsletterTestPayload(body) {
  const to = normalizeString(body?.to || body?.email).toLowerCase();
  if (!TEST_EMAIL_PATTERN.test(to)) {
    return { ok: false, error: { code: 'NEWSLETTER_INVALID_TEST_EMAIL', message: 'Destination email is invalid.' } };
  }
  return { ok: true, data: { to } };
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


  router.get('/admin/email-status', async (_req, res) => {
    const data = newsletterService.getEmailProviderStatus();
    res.setHeader('Cache-Control', 'no-store');
    return sendSuccess(res, 200, data);
  });

  router.post('/admin/test-email', async (req, res) => {
    const parsed = validateNewsletterTestPayload(req.body);
    if (!parsed.ok) {
      return sendError(res, 400, parsed.error.code, parsed.error.message);
    }

    const result = await newsletterService.sendTestEmail(parsed.data, { sentBy: req.session?.userId ?? 'unknown' });
    res.setHeader('Cache-Control', 'no-store');
    if (result?.ok === false) {
      const status = result.code === 'EMAIL_PROVIDER_NOT_CONFIGURED' ? 503 : 502;
      return res.status(status).json(result);
    }
    return sendSuccess(res, 200, result);
  });

  router.get('/admin/campaigns', async (req, res) => {
    const data = await newsletterService.listCampaigns({
      page: req.query?.page,
      limit: req.query?.limit,
      status: normalizeString(req.query?.status || 'all').toLowerCase(),
    });

    res.setHeader('Cache-Control', 'no-store');
    return sendSuccess(res, 200, data);
  });

  router.post('/admin/send', async (req, res) => {
    const parsed = validateNewsletterSendPayload(req.body);
    if (!parsed.ok) {
      return sendError(res, 400, parsed.error.code, parsed.error.message);
    }

    const result = await newsletterService.sendCampaign(parsed.data, { sentBy: req.session?.userId ?? 'unknown' });
    res.setHeader('Cache-Control', 'no-store');
    if (result?.ok === false) {
      const status = result.code === 'EMAIL_PROVIDER_NOT_CONFIGURED' ? 503 : 409;
      return res.status(status).json({
        ok: false,
        code: result.code,
        message: result.message,
        provider: result.provider,
        recipientCount: result.recipientCount,
        deliveredCount: result.deliveredCount ?? 0,
        failedCount: result.failedCount ?? result.recipientCount ?? 0,
        campaign: result.campaign ?? null,
      });
    }
    return sendSuccess(res, 200, result);
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
  validateNewsletterSendPayload,
  validateNewsletterTestPayload,
};
