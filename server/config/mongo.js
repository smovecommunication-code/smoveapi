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

async function migrateLegacyUserProviderIndex() {
  if (!isConnected || !mongooseLib) return;

  const usersCollection = mongooseLib.connection.collection('users');
  const indexes = await usersCollection.indexes();
  const legacyIndex = indexes.find((index) => index.name === 'authProvider_1_providerId_1');

  if (!legacyIndex) return;

  const isTargetKey = JSON.stringify(legacyIndex.key) === JSON.stringify({ authProvider: 1, providerId: 1 });
  const hasStringProviderPartialFilter =
    legacyIndex.partialFilterExpression
    && JSON.stringify(legacyIndex.partialFilterExpression) === JSON.stringify({ providerId: { $exists: true, $type: 'string' } });

  if (isTargetKey && legacyIndex.unique === true && !hasStringProviderPartialFilter) {
    await usersCollection.dropIndex('authProvider_1_providerId_1');
    logInfo('mongo_index_migration_dropped_legacy_auth_provider_provider_id_index');
  }
}

module.exports = {
  connectMongo,
  disconnectMongo,
  getMongoose,
  getMongoConnectionState,
  migrateLegacyUserProviderIndex,
};
