const express = require('express');
const { requireAuthenticated, requirePermission } = require('../middleware/authz');
const { Permissions } = require('../security/rbac');
const { sendError, sendSuccess } = require('../utils/apiResponse');
const { logWarn } = require('../utils/logger');

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function normalizeString(value) {
  return `${value || ''}`.trim();
}

function validateContactPayload(body) {
  const name = normalizeString(body?.name);
  const email = normalizeString(body?.email).toLowerCase();
  const subject = normalizeString(body?.subject);
  const message = normalizeString(body?.message);
  const phone = normalizeString(body?.phone);
  const source = normalizeString(body?.source).toLowerCase().slice(0, 40) || 'website';
  const contextSlug = normalizeString(body?.contextSlug).toLowerCase().slice(0, 120);
  const contextLabel = normalizeString(body?.contextLabel).slice(0, 160);

  if (!name || name.length < 2) {
    return { ok: false, error: { code: 'CONTACT_INVALID_NAME', message: 'Name is required.' } };
  }

  if (!EMAIL_PATTERN.test(email)) {
    return { ok: false, error: { code: 'CONTACT_INVALID_EMAIL', message: 'Email is invalid.' } };
  }

  if (!subject || subject.length < 3) {
    return { ok: false, error: { code: 'CONTACT_INVALID_SUBJECT', message: 'Subject is required.' } };
  }

  if (!message || message.length < 10) {
    return { ok: false, error: { code: 'CONTACT_INVALID_MESSAGE', message: 'Message must contain at least 10 characters.' } };
  }

  return {
    ok: true,
    data: {
      name: name.slice(0, 120),
      email,
      subject: subject.slice(0, 160),
      message: message.slice(0, 5000),
      phone: phone.slice(0, 50),
      source,
      contextSlug,
      contextLabel,
    },
  };
}

function createContactRoutes({ contactService }) {
  const router = express.Router();

  router.post('/', async (req, res) => {
    const parsed = validateContactPayload(req.body);
    if (!parsed.ok) {
      return sendError(res, 400, parsed.error.code, parsed.error.message);
    }

    try {
      const result = await contactService.submit(parsed.data, {
        source: parsed.data.source || req.get('origin') || req.get('host') || 'website',
        requestId: req.requestId ?? null,
      });
      return sendSuccess(res, 200, {
        delivered: result.delivered,
        mode: result.mode,
        status: result.status,
        submissionId: result.submission.id,
        message: 'Votre message a bien été transmis. Nous revenons vers vous rapidement.',
      });
    } catch (error) {
      logWarn('contact_email_failed', {
        requestId: req.requestId,
        message: error?.message,
      });
      if (`${error?.message || ''}`.includes('CONTACT_PERSISTENCE_FAILED')) {
        return sendError(res, 500, 'CONTACT_PERSISTENCE_FAILED', 'Unable to store message right now. Please try again later.');
      }
      return sendError(res, 502, 'CONTACT_EMAIL_FAILED', 'Unable to send message right now. Please try again later.');
    }
  });

  router.use(requireAuthenticated, requirePermission(Permissions.USER_MANAGE));

  router.get('/admin/submissions', async (req, res) => {
    const data = await contactService.listSubmissions({
      page: req.query?.page,
      limit: req.query?.limit,
      query: normalizeString(req.query?.q),
      source: normalizeString(req.query?.source || 'all').toLowerCase(),
      deliveryStatus: normalizeString(req.query?.deliveryStatus || 'all').toLowerCase(),
    });

    res.setHeader('Cache-Control', 'no-store');
    return sendSuccess(res, 200, data);
  });

  return router;
}

module.exports = { createContactRoutes, validateContactPayload };
