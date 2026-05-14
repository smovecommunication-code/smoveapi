const { logWarn } = require('../utils/logger');

const MAX_AUDIT_EVENTS = 5000;

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

class AuditService {
  constructor({ auditRepository }) {
    this.auditRepository = auditRepository;
  }

  record(event) {
    const timestamp = new Date().toISOString();
    const normalized = {
      id: event.id || `audit_${Date.now()}_${Math.random().toString(16).slice(2)}`,
      timestamp,
      eventType: String(event.eventType || 'unknown_event'),
      outcome: event.outcome === 'failure' ? 'failure' : 'success',
      actor: event.actor || { userId: null, role: null, ip: null },
      target: event.target || { entityType: null, entityId: null },
      request: event.request || { requestId: null, method: null, path: null },
      metadata: sanitizeMeta(event.metadata || {}),
    };

    try {
      this.auditRepository.append(normalized);
      this.enforceRetentionBestEffort();
      return { ok: true, event: normalized };
    } catch (error) {
      logWarn('audit_persist_failed', {
        eventType: normalized.eventType,
        reason: error?.message || 'unknown_error',
      });
      return { ok: false, error };
    }
  }

  list(options = {}) {
    try {
      return this.auditRepository.list(options);
    } catch (error) {
      logWarn('audit_list_failed', { reason: error?.message || 'unknown_error' });
      return [];
    }
  }

  enforceRetentionBestEffort() {
    const events = this.auditRepository.list({ limit: MAX_AUDIT_EVENTS + 1 });
    if (events.length <= MAX_AUDIT_EVENTS) return;

    const retained = events.slice(0, MAX_AUDIT_EVENTS).reverse();
    this.auditRepository.replaceAll?.(retained);
  }
}

module.exports = { AuditService, sanitizeMeta };
