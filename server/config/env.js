const fs = require('fs');
const path = require('path');

const PROJECT_ROOT = path.resolve(__dirname, '../..');
const API_SERVER_ROOT = path.resolve(__dirname, '..');

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return;

  const content = fs.readFileSync(filePath, 'utf8');
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    const separatorIndex = trimmed.indexOf('=');
    if (separatorIndex <= 0) continue;

    const key = trimmed.slice(0, separatorIndex).trim();
    const rawValue = trimmed.slice(separatorIndex + 1).trim();
    const value = rawValue.replace(/^['\"]|['\"]$/g, '');

    if (process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

// Unified runtime model: the repository root .env is the source of truth
// for the public site, CMS, and API.
loadEnvFile(path.resolve(PROJECT_ROOT, '.env'));

const isProduction = process.env.NODE_ENV === 'production';

function parseIntOrDefault(value, fallback) {
  const parsed = Number.parseInt(value ?? '', 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function parseBoolean(value, fallback = false) {
  if (value === undefined) return fallback;
  return value === 'true';
}

const API_PORT = parseIntOrDefault(process.env.API_PORT, 3001);
const FRONTEND_PORT = parseIntOrDefault(process.env.CLIENT_PORT ?? process.env.VITE_PORT, 5173);
const CMS_PORT = parseIntOrDefault(process.env.VITE_CMS_PORT, 5174);
function resolveSessionSecret() {
  const candidates = [process.env.SESSION_SECRET, process.env.APP_SESSION_SECRET];
  for (const value of candidates) {
    if (typeof value !== 'string') continue;
    const trimmed = value.trim();
    if (trimmed.length > 0) {
      return trimmed;
    }
  }
  return null;
}

const SESSION_SECRET = resolveSessionSecret();

function buildDevSessionSecret() {
  return `dev-session-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}-${process.pid}`;
}

const RESOLVED_SESSION_SECRET = SESSION_SECRET ?? (isProduction ? null : buildDevSessionSecret());

const AUTH_STORAGE_MODE = ['auto', 'mongo', 'memory'].includes(process.env.AUTH_STORAGE_MODE)
  ? process.env.AUTH_STORAGE_MODE
  : 'auto';

const SESSION_STORE_MODE = ['auto', 'mongo', 'memory'].includes(process.env.SESSION_STORE_MODE)
  ? process.env.SESSION_STORE_MODE
  : 'auto';

const PUBLIC_REGISTRATION_ENABLED = parseBoolean(
  process.env.PUBLIC_REGISTRATION_ENABLED ?? process.env.VITE_ENABLE_REGISTRATION,
  true,
);
const ENABLE_EMAIL_PASSWORD_AUTH = parseBoolean(process.env.ENABLE_EMAIL_PASSWORD_AUTH, true);
const ENABLE_GOOGLE_LOGIN = parseBoolean(process.env.ENABLE_GOOGLE_LOGIN, false);
const ENABLE_FACEBOOK_LOGIN = parseBoolean(process.env.ENABLE_FACEBOOK_LOGIN, false);
function normalizePublicRole(value) {
  const role = String(value ?? 'client').trim().toLowerCase();
  return ['client', 'user'].includes(role) ? role : 'client';
}

const DEFAULT_PUBLIC_ROLE = normalizePublicRole(process.env.DEFAULT_PUBLIC_ROLE);
const OAUTH_DEFAULT_ROLE = normalizePublicRole(process.env.OAUTH_DEFAULT_ROLE ?? DEFAULT_PUBLIC_ROLE);

const CONTENT_SCHEMA_VERSION = parseIntOrDefault(process.env.CONTENT_SCHEMA_VERSION, 3);
const MEDIA_UPLOAD_DIR = process.env.MEDIA_UPLOAD_DIR ?? path.resolve(API_SERVER_ROOT, 'data/uploads');
const MEDIA_PUBLIC_BASE_PATH = process.env.MEDIA_PUBLIC_BASE_PATH ?? '/uploads';
const MEDIA_MAX_UPLOAD_BYTES = parseIntOrDefault(process.env.MEDIA_MAX_UPLOAD_BYTES, 5 * 1024 * 1024);
const MEDIA_STORAGE_DRIVER = (process.env.MEDIA_STORAGE_DRIVER || (isProduction ? 'cloudinary' : 'local')).trim().toLowerCase();
const CLOUDINARY_CLOUD_NAME = process.env.CLOUDINARY_CLOUD_NAME ?? '';
const CLOUDINARY_API_KEY = process.env.CLOUDINARY_API_KEY ?? '';
const CLOUDINARY_API_SECRET = process.env.CLOUDINARY_API_SECRET ?? '';
const CLOUDINARY_UPLOAD_FOLDER = process.env.CLOUDINARY_UPLOAD_FOLDER ?? 'smove';
const MEDIA_ALLOWED_MIME_TYPES = (process.env.MEDIA_ALLOWED_MIME_TYPES ?? 'image/jpeg,image/png,image/webp,image/gif,video/mp4,application/pdf')
  .split(',')
  .map((entry) => entry.trim())
  .filter(Boolean);

function assertSessionSecretStrength() {
  if (!RESOLVED_SESSION_SECRET) {
    throw new Error('SESSION_SECRET is required in production.');
  }

  const tooShort = RESOLVED_SESSION_SECRET.length < 32;

  if (isProduction && tooShort) {
    throw new Error('SESSION_SECRET must be configured with a strong value (>= 32 chars) in production.');
  }
}

function validateCriticalEnv() {
  assertSessionSecretStrength();

  const hasMongoUri = Boolean(process.env.MONGO_URI || process.env.MONGODB_URI);

  if (AUTH_STORAGE_MODE === 'mongo' && !hasMongoUri) {
    throw new Error('MONGO_URI (or MONGODB_URI) is required when AUTH_STORAGE_MODE is set to "mongo".');
  }

  if (SESSION_STORE_MODE === 'mongo' && !hasMongoUri) {
    throw new Error('MONGO_URI (or MONGODB_URI) is required when SESSION_STORE_MODE is set to "mongo".');
  }

  if (isProduction && AUTH_STORAGE_MODE !== 'mongo') {
    throw new Error('AUTH_STORAGE_MODE must be set to "mongo" in production.');
  }

  if (isProduction && SESSION_STORE_MODE !== 'mongo') {
    throw new Error('SESSION_STORE_MODE must be set to "mongo" in production.');
  }

  if (!['local', 'local-disk', 'cloudinary'].includes(MEDIA_STORAGE_DRIVER)) {
    throw new Error('MEDIA_STORAGE_DRIVER must be "cloudinary" or "local".');
  }

  if (MEDIA_STORAGE_DRIVER === 'cloudinary' && !(CLOUDINARY_CLOUD_NAME && CLOUDINARY_API_KEY && CLOUDINARY_API_SECRET)) {
    throw new Error('CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, and CLOUDINARY_API_SECRET are required when MEDIA_STORAGE_DRIVER=cloudinary.');
  }

  if (process.env.RESEND_API_KEY && !process.env.EMAIL_FROM) {
    throw new Error('EMAIL_FROM must be set when RESEND_API_KEY is configured.');
  }

  if (isProduction && !process.env.CONTACT_TO_EMAIL) {
    throw new Error('CONTACT_TO_EMAIL must be set in production for contact form delivery.');
  }

  if (ENABLE_GOOGLE_LOGIN && !(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET)) {
    throw new Error('GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET must both be set when ENABLE_GOOGLE_LOGIN=true.');
  }

  if (ENABLE_FACEBOOK_LOGIN && !(process.env.FACEBOOK_APP_ID && process.env.FACEBOOK_APP_SECRET)) {
    throw new Error('FACEBOOK_APP_ID and FACEBOOK_APP_SECRET must both be set when ENABLE_FACEBOOK_LOGIN=true.');
  }
}


const GOOGLE_CALLBACK_PATH = process.env.GOOGLE_CALLBACK_PATH ?? '/api/v1/auth/oauth/google/callback';
const FACEBOOK_CALLBACK_PATH = process.env.FACEBOOK_CALLBACK_PATH ?? '/api/v1/auth/oauth/facebook/callback';

function normalizeOrigin(origin) {
  if (!origin || typeof origin !== 'string') return null;
  try {
    const parsed = new URL(origin.trim());
    return parsed.origin;
  } catch {
    return null;
  }
}

function buildFrontendOrigins() {
  const configuredPrimary = process.env.FRONTEND_ORIGIN ?? process.env.VITE_PUBLIC_SITE_URL ?? `http://localhost:${FRONTEND_PORT}`;
  const configuredList = [
    configuredPrimary,
    process.env.CMS_ORIGIN,
    process.env.CMS_FRONTEND_ORIGIN,
    process.env.VITE_CMS_APP_URL,
    process.env.VITE_PUBLIC_SITE_URL,
    process.env.VITE_PUBLIC_APP_URL,
    ...(process.env.CORS_ORIGINS ?? process.env.FRONTEND_ORIGINS ?? '').split(',').map((entry) => entry.trim()),
  ];

  if (!isProduction) {
    configuredList.push(
      `http://localhost:${FRONTEND_PORT}`,
      `http://localhost:${CMS_PORT}`,
      `http://127.0.0.1:${FRONTEND_PORT}`,
      `http://127.0.0.1:${CMS_PORT}`,
    );
  }

  return Array.from(new Set(configuredList.map(normalizeOrigin).filter(Boolean)));
}

const FRONTEND_ORIGINS = buildFrontendOrigins();
const DEFAULT_FRONTEND_ORIGIN =
  normalizeOrigin(process.env.FRONTEND_ORIGIN) ??
  normalizeOrigin(process.env.VITE_PUBLIC_SITE_URL) ??
  FRONTEND_ORIGINS[0] ??
  `http://localhost:${FRONTEND_PORT}`;
const DEFAULT_API_ORIGIN = normalizeOrigin(process.env.API_ORIGIN) ?? (isProduction ? 'https://smoveapi-1.onrender.com' : `http://localhost:${API_PORT}`);

if (!SESSION_SECRET && !isProduction) {
  // eslint-disable-next-line no-console
  console.warn('[session] SESSION_SECRET missing, using temporary development fallback.');
}

module.exports = {
  isProduction,
  API_PORT,
  AUTH_STORAGE_MODE,
  SESSION_STORE_MODE,
  FRONTEND_ORIGIN: DEFAULT_FRONTEND_ORIGIN,
  FRONTEND_ORIGINS,
  API_ORIGIN: DEFAULT_API_ORIGIN,
  SESSION_SECRET: RESOLVED_SESSION_SECRET,
  MONGO_URI: process.env.MONGO_URI ?? process.env.MONGODB_URI ?? '',
  MONGO_DB_NAME: process.env.MONGO_DB_NAME ?? undefined,
  SESSION_TTL_SECONDS: parseIntOrDefault(process.env.SESSION_TTL_SECONDS, 60 * 60 * 24),
  PASSWORD_HASH_ROUNDS: parseIntOrDefault(process.env.PASSWORD_HASH_ROUNDS, 12),
  AUTH_RATE_LIMIT_MAX: parseIntOrDefault(process.env.AUTH_RATE_LIMIT_MAX, 10),
  AUTH_RATE_LIMIT_WINDOW_MS: parseIntOrDefault(process.env.AUTH_RATE_LIMIT_WINDOW_MS, 15 * 60 * 1000),
  SEED_ADMIN_ON_START: parseBoolean(process.env.SEED_ADMIN_ON_START, false),
  ADMIN_EMAIL: process.env.ADMIN_EMAIL ?? '',
  ADMIN_PASSWORD: process.env.ADMIN_PASSWORD ?? '',
  ADMIN_NAME: process.env.ADMIN_NAME ?? 'Administrator',
  OAUTH_DEFAULT_ROLE,
  DEFAULT_PUBLIC_ROLE,
  PUBLIC_REGISTRATION_ENABLED,
  ENABLE_EMAIL_PASSWORD_AUTH,
  ENABLE_GOOGLE_LOGIN,
  ENABLE_FACEBOOK_LOGIN,
  GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID ?? '',
  GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET ?? '',
  GOOGLE_CALLBACK_URL: process.env.GOOGLE_CALLBACK_URL ?? `${DEFAULT_API_ORIGIN}${GOOGLE_CALLBACK_PATH}`,
  FACEBOOK_APP_ID: process.env.FACEBOOK_APP_ID ?? '',
  FACEBOOK_APP_SECRET: process.env.FACEBOOK_APP_SECRET ?? '',
  FACEBOOK_CALLBACK_URL: process.env.FACEBOOK_CALLBACK_URL ?? `${DEFAULT_API_ORIGIN}${FACEBOOK_CALLBACK_PATH}`,
  SMTP_HOST: process.env.SMTP_HOST ?? '',
  SMTP_PORT: parseIntOrDefault(process.env.SMTP_PORT, 587),
  SMTP_SECURE: parseBoolean(process.env.SMTP_SECURE, false),
  SMTP_USER: process.env.SMTP_USER ?? '',
  SMTP_PASS: process.env.SMTP_PASS ?? '',
  RESEND_API_KEY: process.env.RESEND_API_KEY ?? '',
  EMAIL_FROM: process.env.EMAIL_FROM ?? 'noreply@localhost',
  CONTACT_TO_EMAIL: process.env.CONTACT_TO_EMAIL ?? '',
  APP_BASE_URL: process.env.APP_BASE_URL ?? DEFAULT_FRONTEND_ORIGIN,
  CONTENT_SCHEMA_VERSION,
  MEDIA_STORAGE_DRIVER,
  CLOUDINARY_CLOUD_NAME,
  CLOUDINARY_API_KEY,
  CLOUDINARY_API_SECRET,
  CLOUDINARY_UPLOAD_FOLDER,
  MEDIA_UPLOAD_DIR,
  MEDIA_PUBLIC_BASE_PATH,
  MEDIA_MAX_UPLOAD_BYTES,
  MEDIA_ALLOWED_MIME_TYPES,
  validateCriticalEnv,
};
