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
  const source = normalizeString(body?.source).toLowerCase().slice(0, 40) || 'site';
  const contextSlug = normalizeString(body?.contextSlug).toLowerCase().slice(0, 120);
  const contextLabel = normalizeString(body?.contextLabel).slice(0, 160);

  if (!name || name.length < 2) {
    return { ok: false, error: { code: 'CONTACT_INVALID_NAME', message: 'Name is required.' } };
  }

  if (!email && !phone) {
    return { ok: false, error: { code: 'CONTACT_MISSING_REPLY_CHANNEL', message: 'Email or phone is required.' } };
  }
  if (email && !EMAIL_PATTERN.test(email)) {
    return { ok: false, error: { code: 'CONTACT_INVALID_EMAIL', message: 'Email is invalid.' } };
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
        warning: result.warning || null,
        submissionId: result.submission.id,
        message: result.warning ? 'Votre message a bien été enregistré. La notification email est indisponible, mais notre équipe peut le consulter.' : 'Votre message a bien été transmis. Nous revenons vers vous rapidement.',
      });
    } catch (error) {
      logWarn('contact_email_failed', {
        requestId: req.requestId,
        message: error?.message,
      });
      if (`${error?.message || ''}`.includes('CONTACT_PERSISTENCE_FAILED')) {
        return sendError(res, 500, 'CONTACT_PERSISTENCE_FAILED', 'Unable to store message right now. Please try again later.');
      }
      return sendError(res, 500, 'CONTACT_SUBMISSION_FAILED', 'Unable to store message right now. Please try again later.');
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

function createMessageManagementRoutes({ contactService }) {
  const router = express.Router();
  router.use(requireAuthenticated);

  router.get('/', requirePermission(Permissions.CONTENT_READ), async (req, res) => {
    const data = await contactService.listSubmissions({
      page: req.query?.page, limit: req.query?.limit, query: normalizeString(req.query?.q),
      source: normalizeString(req.query?.source || 'all').toLowerCase(),
      deliveryStatus: normalizeString(req.query?.deliveryStatus || 'all').toLowerCase(),
      status: normalizeString(req.query?.status || 'all').toLowerCase(),
    });
    res.setHeader('Cache-Control', 'no-store');
    return sendSuccess(res, 200, data);
  });

  router.patch('/:id', requirePermission(Permissions.CONTENT_WRITE), async (req, res) => {
    const status = normalizeString(req.body?.status).toLowerCase();
    if (!['new', 'read', 'archived'].includes(status)) return sendError(res, 400, 'MESSAGE_INVALID_STATUS', 'Status must be new, read, or archived.');
    const message = await contactService.updateStatus(req.params.id, status);
    return message ? sendSuccess(res, 200, { message }) : sendError(res, 404, 'MESSAGE_NOT_FOUND', 'Message not found.');
  });

  router.delete('/:id', requirePermission(Permissions.USER_MANAGE), async (req, res) => {
    const deleted = await contactService.deleteSubmission(req.params.id);
    return deleted ? sendSuccess(res, 200, { deleted: true, id: req.params.id }) : sendError(res, 404, 'MESSAGE_NOT_FOUND', 'Message not found.');
  });
  return router;
}

module.exports = { createContactRoutes, createMessageManagementRoutes, validateContactPayload };
