const { CONTENT_SCHEMA_VERSION } = require('../config/env');
const { createContentStateModel } = require('../models/ContentState');
const { logError } = require('../utils/logger');

const STATE_KEY = 'global';

const defaultState = {
  schemaVersion: CONTENT_SCHEMA_VERSION,
  blogPosts: [],
  projects: [],
  mediaFiles: [],
  services: [],
  teamMembers: [],
  pageContent: null,
  settings: null,
  settingsHistory: [],
  migrationHistory: [],
  analyticsEvents: [],
};

function extractTeamMembers(candidate = {}) {
  const aliases = [candidate.teamMembers, candidate.members, candidate.team, candidate.teams, candidate.staff, candidate.personnel];
  return aliases.find((value) => Array.isArray(value) && value.length > 0) || (Array.isArray(candidate.teamMembers) ? candidate.teamMembers : []);
}

function normalizeState(candidate = {}) {
  return {
    schemaVersion: Number(candidate.schemaVersion) || CONTENT_SCHEMA_VERSION,
    blogPosts: Array.isArray(candidate.blogPosts) ? candidate.blogPosts : [],
    projects: Array.isArray(candidate.projects) ? candidate.projects : [],
    mediaFiles: Array.isArray(candidate.mediaFiles) ? candidate.mediaFiles : [],
    services: Array.isArray(candidate.services) ? candidate.services : [],
    teamMembers: extractTeamMembers(candidate),
    pageContent: candidate.pageContent && typeof candidate.pageContent === 'object' ? candidate.pageContent : null,
    settings: candidate.settings && typeof candidate.settings === 'object' ? candidate.settings : null,
    settingsHistory: Array.isArray(candidate.settingsHistory) ? candidate.settingsHistory : [],
    migrationHistory: Array.isArray(candidate.migrationHistory) ? candidate.migrationHistory : [],
    analyticsEvents: Array.isArray(candidate.analyticsEvents) ? candidate.analyticsEvents : [],
  };
}

class MongoContentRepository {
  constructor({ mongoose }) {
    this.ContentStateModel = createContentStateModel(mongoose);
    this.stateCache = { ...defaultState };
    this.writeChain = Promise.resolve();
    this.initialized = false;
  }

  async initialize() {
    const existing = await this.ContentStateModel.findOne({ key: STATE_KEY }).lean().exec();
    if (!existing) {
      await this.ContentStateModel.create({ key: STATE_KEY, ...defaultState });
      this.stateCache = { ...defaultState };
      this.initialized = true;
      return;
    }
    this.stateCache = normalizeState(existing);
    this.initialized = true;
  }

  ensureInitialized() {
    if (!this.initialized) {
      throw new Error('MongoContentRepository used before initialize().');
    }
  }

  getState() {
    this.ensureInitialized();
    return JSON.parse(JSON.stringify(this.stateCache));
  }

  saveState(state) {
    this.ensureInitialized();
    this.stateCache = {
      ...defaultState,
      ...normalizeState(state),
      schemaVersion: CONTENT_SCHEMA_VERSION,
    };

    const payload = this.getState();
    const previousWrites = this.writeChain.catch((error) => {
      logError('content_state_previous_persist_failed', { message: error?.message });
    });

    this.writeChain = previousWrites.then(() =>
      this.ContentStateModel.updateOne(
        { key: STATE_KEY },
        { $set: payload },
        { upsert: true },
      ).exec(),
    );

    this.writeChain.catch((error) => {
      logError('content_state_persist_failed', { message: error?.message });
    });

    return this.writeChain;
  }

  flushWrites() {
    this.ensureInitialized();
    return this.writeChain;
  }

  getBlogPosts() {
    return this.getState().blogPosts;
  }

  saveBlogPosts(blogPosts) {
    const state = this.getState();
    state.blogPosts = Array.isArray(blogPosts) ? blogPosts : [];
    this.saveState(state);
  }
}

module.exports = { MongoContentRepository };
