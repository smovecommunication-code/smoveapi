const { isMediaReference, mediaIdFromReference, toMediaReference, isHttpUrl } = require('../shared/contracts/contentContracts');

const HTTP_SCHEME_PATTERN = /^[a-zA-Z][a-zA-Z\d+.-]*:/;

function isDev() {
  return process.env.NODE_ENV !== 'production';
}

function devLog(message, payload) {
  if (!isDev()) return;
  // eslint-disable-next-line no-console
  console.warn(`[media-resolver] ${message}`, payload || '');
}

function absolutizePath(value, apiOrigin) {
  const normalized = `${value || ''}`.trim();
  if (!normalized) return '';
  if (HTTP_SCHEME_PATTERN.test(normalized) || normalized.startsWith('//') || normalized.startsWith('data:') || normalized.startsWith('blob:')) return normalized;
  if (!apiOrigin) return normalized.startsWith('/') ? normalized : `/${normalized}`;
  if (normalized.startsWith('/')) return `${apiOrigin}${normalized}`;
  if (normalized.startsWith('uploads/')) return `${apiOrigin}/${normalized}`;
  return normalized;
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
    const candidate = value;
    const direct = candidate.url || candidate.publicUrl || candidate.publicPath || (candidate.filename ? `/uploads/${candidate.filename}` : '');
    return direct ? absolutizePath(direct, options.apiOrigin || '') : '';
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
    const direct = match.url || match.publicPath || (match.filename ? `/uploads/${match.filename}` : '');
    return absolutizePath(direct, options.apiOrigin || '');
  }

  if (isHttpUrl(normalized) || normalized.startsWith('/uploads/') || normalized.startsWith('uploads/')) {
    return absolutizePath(normalized, options.apiOrigin || '');
  }

  const byId = mediaFiles.find((entry) => entry.id === normalized && !entry.archivedAt);
  if (byId) {
    const direct = byId.url || byId.publicPath || (byId.filename ? `/uploads/${byId.filename}` : '');
    return absolutizePath(direct, options.apiOrigin || '');
  }

  devLog('unsupported media value', { value: normalized });
  return '';
}

module.exports = { resolveMediaUrl, normalizeMediaReference, absolutizePath };
