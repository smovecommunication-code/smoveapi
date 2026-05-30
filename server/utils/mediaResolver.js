const { isMediaReference, mediaIdFromReference, toMediaReference, isHttpUrl } = require('../shared/contracts/contentContracts');

const DEFAULT_API_ORIGIN = 'https://smoveapi-1.onrender.com';
const HTTP_URL_PATTERN = /^https?:\/\//i;
const FORBIDDEN_RENDER_SCHEME_PATTERN = /^(?:blob|file|data):/i;
const LOCAL_DISK_PATH_PATTERN = /^(?:[a-zA-Z]:[\\/]|~[\\/]|\/Users\/|\/home\/|\/workspace\/|\/var\/|\/tmp\/|server\/data\/|api\/server\/data\/)/;

function isDev() {
  return process.env.NODE_ENV !== 'production';
}

function devLog(message, payload) {
  if (!isDev()) return;
  // eslint-disable-next-line no-console
  console.warn(`[media-resolver] ${message}`, payload || '');
}

function toApiOrigin(apiOrigin) {
  const configured = `${apiOrigin || process.env.API_ORIGIN || DEFAULT_API_ORIGIN}`.trim();
  try {
    return new URL(configured).origin;
  } catch (_error) {
    return DEFAULT_API_ORIGIN;
  }
}

function isForbiddenRenderableValue(value) {
  const normalized = `${value || ''}`.trim();
  return (
    !normalized ||
    normalized.startsWith('//') ||
    FORBIDDEN_RENDER_SCHEME_PATTERN.test(normalized) ||
    normalized.startsWith('media:') ||
    LOCAL_DISK_PATH_PATTERN.test(normalized) ||
    normalized.includes('\\')
  );
}

function absolutizePath(value, apiOrigin) {
  const normalized = `${value || ''}`.trim();
  if (isForbiddenRenderableValue(normalized)) return '';
  if (HTTP_URL_PATTERN.test(normalized)) return normalized;
  const origin = toApiOrigin(apiOrigin);
  if (normalized.startsWith('/uploads/')) return `${origin}${normalized}`;
  if (normalized.startsWith('uploads/')) return `${origin}/${normalized}`;
  return '';
}

function resolveMediaRecordUrl(mediaFile, options = {}) {
  if (!mediaFile || typeof mediaFile !== 'object') return '';

  const url = `${mediaFile.url || mediaFile.publicUrl || ''}`.trim();
  if (HTTP_URL_PATTERN.test(url)) return url;

  const publicPath = `${mediaFile.publicPath || ''}`.trim();
  if (publicPath.startsWith('/uploads/')) return `${toApiOrigin(options.apiOrigin)}${publicPath}`;
  if (publicPath.startsWith('uploads/')) return `${toApiOrigin(options.apiOrigin)}/${publicPath}`;

  const filename = `${mediaFile.filename || ''}`.trim();
  if (filename && !isForbiddenRenderableValue(filename)) return `${toApiOrigin(options.apiOrigin)}/uploads/${filename.replace(/^\/+/, '')}`;

  return '';
}

function normalizeMediaReference(value, options = {}) {
  const normalized = `${value || ''}`.trim();
  if (!normalized) return '';
  if (isMediaReference(normalized)) return toMediaReference(mediaIdFromReference(normalized));
  if (isHttpUrl(normalized)) return normalized;
  if (normalized.startsWith('/uploads/') || normalized.startsWith('uploads/')) return absolutizePath(normalized, options.apiOrigin || '');
  if (options.allowIdOnly && /^[a-zA-Z0-9_-]{6,}$/.test(normalized)) return toMediaReference(normalized);
  return '';
}

function resolveMediaUrl(value, mediaFiles = [], options = {}) {
  if (value && typeof value === 'object') {
    const resolved = resolveMediaRecordUrl(value, options);
    if (!resolved) devLog('unrenderable media record', value);
    return resolved;
  }

  const normalized = `${value || ''}`.trim();
  if (!normalized) return '';

  if (isMediaReference(normalized)) {
    const mediaId = mediaIdFromReference(normalized);
    const match = mediaFiles.find((entry) => entry.id === mediaId && !entry.archivedAt);
    if (!match) {
      devLog('unresolved media reference', { value: normalized, mediaId });
      return '';
    }
    return resolveMediaRecordUrl(match, options);
  }

  const byId = mediaFiles.find((entry) => entry.id === normalized && !entry.archivedAt);
  if (byId) return resolveMediaRecordUrl(byId, options);

  if (HTTP_URL_PATTERN.test(normalized) || normalized.startsWith('/uploads/') || normalized.startsWith('uploads/')) {
    return absolutizePath(normalized, options.apiOrigin || '');
  }

  devLog('unsupported media value', { value: normalized });
  return '';
}

module.exports = { resolveMediaUrl, resolveMediaRecordUrl, normalizeMediaReference, absolutizePath };
