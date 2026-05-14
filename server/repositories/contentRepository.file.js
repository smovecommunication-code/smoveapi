const fs = require('fs');
const path = require('path');
const { CONTENT_SCHEMA_VERSION } = require('../config/env');
const { logWarn } = require('../utils/logger');

const DATA_DIR = path.resolve(__dirname, '../data');
const DATA_PATH = path.join(DATA_DIR, 'content.json');

const defaultState = {
  schemaVersion: CONTENT_SCHEMA_VERSION,
  blogPosts: [],
  projects: [],
  mediaFiles: [],
  services: [],
  pageContent: null,
  settings: null,
  settingsHistory: [],
  migrationHistory: [],
  analyticsEvents: [],
};

function ensureStore() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }

  if (!fs.existsSync(DATA_PATH)) {
    fs.writeFileSync(DATA_PATH, JSON.stringify(defaultState, null, 2));
  }
}

function normalizeState(candidate = {}) {
  return {
    schemaVersion: Number(candidate.schemaVersion) || 1,
    blogPosts: Array.isArray(candidate.blogPosts) ? candidate.blogPosts : [],
    projects: Array.isArray(candidate.projects) ? candidate.projects : [],
    mediaFiles: Array.isArray(candidate.mediaFiles) ? candidate.mediaFiles : [],
    services: Array.isArray(candidate.services) ? candidate.services : [],
    pageContent: candidate.pageContent && typeof candidate.pageContent === 'object' ? candidate.pageContent : null,
    settings: candidate.settings && typeof candidate.settings === 'object' ? candidate.settings : null,
    settingsHistory: Array.isArray(candidate.settingsHistory) ? candidate.settingsHistory : [],
    migrationHistory: Array.isArray(candidate.migrationHistory) ? candidate.migrationHistory : [],
    analyticsEvents: Array.isArray(candidate.analyticsEvents) ? candidate.analyticsEvents : [],
  };
}

function migrateState(state) {
  const migrated = { ...state };

  while (migrated.schemaVersion < CONTENT_SCHEMA_VERSION) {
    const fromVersion = migrated.schemaVersion;

    if (fromVersion < 2) {
      migrated.blogPosts = Array.isArray(migrated.blogPosts)
        ? migrated.blogPosts.map((post) => ({
            ...post,
            status: ['draft', 'in_review', 'published', 'archived'].includes(post?.status) ? post.status : 'draft',
          }))
        : [];

      migrated.mediaFiles = Array.isArray(migrated.mediaFiles)
        ? migrated.mediaFiles.map((file) => ({
            ...file,
            source: typeof file?.source === 'string' && file.source.trim() ? file.source : 'legacy-content-store',
            metadata: file?.metadata && typeof file.metadata === 'object' ? file.metadata : {},
            createdAt: file?.createdAt || file?.uploadedDate || new Date().toISOString(),
            updatedAt: file?.updatedAt || file?.uploadedDate || new Date().toISOString(),
          }))
        : [];

      migrated.migrationHistory.push({
        fromVersion,
        toVersion: 2,
        migratedAt: new Date().toISOString(),
        note: 'Backfilled blog status and media metadata defaults.',
      });
      migrated.schemaVersion = 2;
      continue;
    }

    if (fromVersion < 3) {
      migrated.settingsHistory = Array.isArray(migrated.settingsHistory) ? migrated.settingsHistory : [];
      migrated.migrationHistory.push({
        fromVersion,
        toVersion: 3,
        migratedAt: new Date().toISOString(),
        note: 'Initialized settings history baseline for auditability and rollback.',
      });
      migrated.schemaVersion = 3;
      continue;
    }

    break;
  }

  return migrated;
}

function readState() {
  ensureStore();

  let parsed;
  try {
    parsed = JSON.parse(fs.readFileSync(DATA_PATH, 'utf8'));
  } catch (error) {
    logWarn('content_store_read_failed', { reason: error?.message || 'unknown_error' });
    parsed = { ...defaultState };
  }

  const normalized = normalizeState(parsed);
  const migrated = migrateState(normalized);

  if (migrated.schemaVersion !== normalized.schemaVersion || migrated.migrationHistory.length !== normalized.migrationHistory.length) {
    writeState(migrated);
  }

  return migrated;
}

function writeState(state) {
  ensureStore();
  fs.writeFileSync(
    DATA_PATH,
    JSON.stringify(
      {
        ...defaultState,
        ...normalizeState(state),
        schemaVersion: CONTENT_SCHEMA_VERSION,
      },
      null,
      2,
    ),
  );
}

class FileContentRepository {
  getState() {
    return readState();
  }

  saveState(state) {
    writeState(state);
  }

  getBlogPosts() {
    return readState().blogPosts;
  }

  saveBlogPosts(blogPosts) {
    const state = readState();
    state.blogPosts = blogPosts;
    writeState(state);
  }
}

module.exports = { FileContentRepository };
