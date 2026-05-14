const fs = require('fs');
const path = require('path');

const DATA_DIR = path.resolve(__dirname, '../data');
const AUDIT_PATH = path.join(DATA_DIR, 'audit-log.json');
const AUDIT_SCHEMA_VERSION = 1;

const defaultState = {
  schemaVersion: AUDIT_SCHEMA_VERSION,
  events: [],
};

function ensureStore() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }

  if (!fs.existsSync(AUDIT_PATH)) {
    fs.writeFileSync(AUDIT_PATH, JSON.stringify(defaultState, null, 2));
  }
}

function readState() {
  ensureStore();
  try {
    const parsed = JSON.parse(fs.readFileSync(AUDIT_PATH, 'utf8'));
    if (!parsed || typeof parsed !== 'object') {
      return { ...defaultState };
    }

    return {
      schemaVersion: Number(parsed.schemaVersion) || AUDIT_SCHEMA_VERSION,
      events: Array.isArray(parsed.events) ? parsed.events : [],
    };
  } catch (_error) {
    return { ...defaultState };
  }
}

function writeState(state) {
  ensureStore();
  fs.writeFileSync(
    AUDIT_PATH,
    JSON.stringify(
      {
        schemaVersion: AUDIT_SCHEMA_VERSION,
        events: Array.isArray(state.events) ? state.events : [],
      },
      null,
      2,
    ),
  );
}

class FileAuditRepository {
  append(event) {
    const state = readState();
    state.events.push(event);
    writeState(state);
  }

  list({ limit = 100, eventTypes = [] } = {}) {
    const normalizedLimit = Math.max(1, Math.min(1000, Number(limit) || 100));
    const allowedTypes = Array.isArray(eventTypes)
      ? eventTypes.map((entry) => `${entry}`.trim()).filter(Boolean)
      : [];

    const state = readState();
    const filtered = allowedTypes.length
      ? state.events.filter((event) => allowedTypes.includes(event.eventType))
      : state.events;

    return filtered.slice(-normalizedLimit).reverse();
  }
  replaceAll(events) {
    writeState({ events: Array.isArray(events) ? events : [] });
  }

}

module.exports = { FileAuditRepository };
