const { AUTH_STORAGE_MODE, MONGO_URI, MONGO_DB_NAME } = require('./env');
const { logInfo } = require('../utils/logger');

let mongooseLib = null;
let isConnected = false;
let connectionState = {
  connected: false,
  reason: 'not_started',
};

async function connectMongo() {
  if (AUTH_STORAGE_MODE === 'memory') {
    connectionState = { connected: false, reason: 'auth_storage_mode_memory' };
    return connectionState;
  }

  if (!MONGO_URI) {
    throw new Error(
      'MongoDB URI is missing. Configure MONGO_URI (or MONGODB_URI), or explicitly set AUTH_STORAGE_MODE=memory to opt out.',
    );
  }

  try {
    // Lazy import so memory mode does not require mongoose at runtime.
    // eslint-disable-next-line global-require
    mongooseLib = require('mongoose');
  } catch (error) {
    const message = '[mongo] Missing "mongoose" dependency. Install mongoose to enable persistent MongoDB users.';
    connectionState = { connected: false, reason: 'mongoose_dependency_missing' };
    throw new Error(message);
  }

  await mongooseLib.connect(MONGO_URI, {
    dbName: MONGO_DB_NAME,
    autoIndex: !process.env.NODE_ENV || process.env.NODE_ENV !== 'production',
  });

  isConnected = true;
  connectionState = { connected: true, reason: 'connected' };
  logInfo('mongo_connected', { dbName: MONGO_DB_NAME ?? null });
  return connectionState;
}

async function disconnectMongo() {
  if (mongooseLib && isConnected) {
    await mongooseLib.disconnect();
    isConnected = false;
  }
}

function getMongoose() {
  return isConnected ? mongooseLib : null;
}

function getMongoConnectionState() {
  return { ...connectionState };
}

module.exports = { connectMongo, disconnectMongo, getMongoose, getMongoConnectionState };
