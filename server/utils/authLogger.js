const { logInfo, logWarn } = require('./logger');

let auditService = null;
const MAX_AUDIT_EVENTS = 400;
const inMemoryEvents = [];

function setAuthAuditService(service) {
  auditService = service;
}

function getSafeIp(req) {
  return req.ip || req.headers['x-forwarded-for'] || 'unknown';
}

function sanitizeMeta(meta = {}) {
  const safe = {};
  for (const [key, value] of Object.entries(meta)) {
    if (/password|token|secret|cookie|authorization/i.test(key)) {
      continue;
    }
    if (/email/i.test(key) && typeof value === 'string') {
      safe[key] = '[redacted-email]';
      continue;
    }
    safe[key] = value;
  }
  return safe;
}

function buildAuditPayload(req, event, outcome, meta = {}) {
  const safeMeta = sanitizeMeta(meta);
  return {
    at: new Date().toISOString(),
    event,
    outcome,
    ip: getSafeIp(req),
    method: req.method,
    path: req.originalUrl,
    userId: req.session?.userId ?? null,
    requestId: req.requestId ?? null,
    ...safeMeta,
  };
}

function persistInMemory(payload) {
  inMemoryEvents.push(payload);
  if (inMemoryEvents.length > MAX_AUDIT_EVENTS) {
    inMemoryEvents.splice(0, inMemoryEvents.length - MAX_AUDIT_EVENTS);
  }
}

function persistDurable(req, payload) {
  if (!auditService) return;

  const recorded = auditService.record({
    eventType: payload.event,
    outcome: payload.outcome,
    actor: {
      userId: payload.userId,
      role: req.session?.role ?? null,
      ip: payload.ip,
    },
    target: {
      entityType: payload.targetType || null,
      entityId: payload.targetId || null,
    },
    request: {
      requestId: payload.requestId,
      method: payload.method,
      path: payload.path,
    },
    metadata: payload,
  });

  if (!recorded.ok) {
    logWarn('auth_audit_persist_failed', {
      event: payload.event,
      requestId: payload.requestId,
    });
  }
}

function logAuthEvent(req, event, outcome, meta = {}) {
  const payload = buildAuditPayload(req, event, outcome, meta);
  persistInMemory(payload);
  persistDurable(req, payload);

  if (outcome === 'failure') {
    logWarn('auth_event', payload);
    return;
  }
  logInfo('auth_event', payload);
}

function listAuthAuditEvents({ limit = 100 } = {}) {
  const normalizedLimit = Math.max(1, Math.min(500, Number(limit) || 100));

  if (auditService) {
    return auditService.list({ limit: normalizedLimit });
  }

  return inMemoryEvents.slice(-normalizedLimit).reverse();
}

module.exports = { logAuthEvent, sanitizeMeta, listAuthAuditEvents, setAuthAuditService };
