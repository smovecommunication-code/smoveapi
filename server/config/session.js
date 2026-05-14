const session = require('express-session');
const { SESSION_SECRET, isProduction, SESSION_TTL_SECONDS, MONGO_URI, SESSION_STORE_MODE, FRONTEND_ORIGINS } = require('./env');
const { getMongoose } = require('./mongo');
const { logInfo, logWarn } = require('../utils/logger');

function resolveSessionStoreMode() {
  if (SESSION_STORE_MODE === 'memory') {
    return { mode: 'memory', reason: 'configured_memory_mode' };
  }

  if (!MONGO_URI || !getMongoose()) {
    throw new Error(
      `[session] MongoDB session store unavailable (reason=${!MONGO_URI ? 'mongo_uri_missing' : 'mongoose_not_connected'}). ` +
        'Configure MONGO_URI/MONGODB_URI and ensure MongoDB is connected, or explicitly set SESSION_STORE_MODE=memory.',
    );
  }

  try {
    // eslint-disable-next-line global-require
    const connectMongo = require('connect-mongo');
    return {
      mode: 'mongo',
      store: connectMongo.create({
        mongoUrl: MONGO_URI,
        ttl: SESSION_TTL_SECONDS,
        autoRemove: 'native',
      }),
      reason: 'mongo_store_ready',
    };
  } catch (_error) {
    throw new Error(
      '[session] Missing "connect-mongo" dependency. Install connect-mongo or explicitly set SESSION_STORE_MODE=memory.',
    );
  }
}

function createSessionMiddleware() {
  const resolvedStore = resolveSessionStoreMode();

  if (isProduction && resolvedStore.mode !== 'mongo') {
    throw new Error(`[session] production requires mongo session store (reason=${resolvedStore.reason}).`);
  }

  if (resolvedStore.mode === 'mongo') {
    logInfo('session_store_ready', { mode: 'mongo' });
  } else {
    logWarn('session_store_fallback', {
      mode: 'memory',
      reason: resolvedStore.reason,
      production: isProduction,
    });
  }

  return {
    middleware: session({
      name: 'smove.sid',
      secret: SESSION_SECRET,
      store: resolvedStore.store ?? undefined,
      resave: false,
      saveUninitialized: false,
      rolling: true,
      cookie: {
        httpOnly: true,
        secure: isProduction,
        sameSite: isProduction ? 'none' : 'lax',
        maxAge: SESSION_TTL_SECONDS * 1000,
      },
      proxy: isProduction,
    }),
    storeMeta: {
      mode: resolvedStore.mode,
      reason: resolvedStore.reason,
    },
  };
}

function normalizeOrigin(origin) {
  if (!origin || typeof origin !== 'string') {
    return null;
  }

  try {
    return new URL(origin.trim()).origin;
  } catch {
    return null;
  }
}

function isAllowedCmsPreviewOrigin(origin) {
  if (!origin) return false;

  try {
    const parsed = new URL(origin);
    if (parsed.protocol !== 'https:') return false;
    if (parsed.hostname === 'smoovecms.vercel.app') return true;
    if (parsed.hostname.endsWith('.vercel.app') && parsed.hostname.startsWith('smoovecms-')) {
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

function createCorsOptions() {
  const allowedOrigins = new Set([
    ...FRONTEND_ORIGINS,
    'http://localhost:5173',
    'http://localhost:5174',
    'http://127.0.0.1:5173',
    'http://127.0.0.1:5174',
  ]
    .map((origin) => normalizeOrigin(origin))
    .filter(Boolean));

  return {
    origin(origin, callback) {
      if (!origin) {
        return callback(null, true);
      }

      const normalizedOrigin = normalizeOrigin(origin);
      if (normalizedOrigin && (allowedOrigins.has(normalizedOrigin) || isAllowedCmsPreviewOrigin(normalizedOrigin))) {
        return callback(null, normalizedOrigin);
      }

      return callback(new Error('Not allowed by CORS'));
    },
    credentials: true,
    allowedHeaders: ['Content-Type', 'X-CSRF-Token', 'X-Requested-With'],
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    optionsSuccessStatus: 204,
  };
}

module.exports = { createSessionMiddleware, createCorsOptions };
