const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const MEDIA_REFERENCE_PREFIX = 'media:';

const stripDiacritics = (value) => `${value || ''}`.normalize('NFD').replace(/[\u0300-\u036f]/g, '');

const normalizeSlug = (value, fallback = '', defaultSlug = '') => {
  const base = stripDiacritics(value || fallback)
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, ' ')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '');
  return base || defaultSlug;
};

const isValidSlug = (value) => SLUG_PATTERN.test(`${value || ''}`.trim());

const isHttpUrl = (value) => {
  if (typeof value !== 'string' || !value.trim()) return false;
  try {
    const parsed = new URL(value.trim());
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
};

const isValidOptionalHttpUrl = (value) => !value || !`${value}`.trim() || isHttpUrl(value);

const isValidContentHref = (value) => {
  if (typeof value !== 'string') return false;
  const href = value.trim();
  if (!href) return false;
  if (href.startsWith('#')) return href.length > 1;
  if (href.startsWith('/')) return true;
  return isHttpUrl(href);
};

const isMediaReference = (value) => typeof value === 'string' && value.trim().startsWith(MEDIA_REFERENCE_PREFIX);

const mediaIdFromReference = (value) => `${value || ''}`.trim().slice(MEDIA_REFERENCE_PREFIX.length).trim();

const toMediaReference = (mediaId) => `${MEDIA_REFERENCE_PREFIX}${`${mediaId || ''}`.trim()}`;

const mediaReferenceExists = (value, hasMediaById) => {
  if (!isMediaReference(value)) return false;
  const mediaId = mediaIdFromReference(value);
  return Boolean(mediaId) && hasMediaById(mediaId);
};

const isValidMediaFieldValue = (value, options = {}) => {
  const normalized = `${value || ''}`.trim();
  if (!normalized) return false;

  if (isMediaReference(normalized)) {
    if (!options.hasMediaById) return mediaIdFromReference(normalized).length > 0;
    return mediaReferenceExists(normalized, options.hasMediaById);
  }

  if (isHttpUrl(normalized)) return true;
  return Boolean(options.allowInlineText) && !normalized.includes('://');
};

const requiredTrimmed = (value) => (typeof value === 'string' ? value.trim() : '');
const hasMinTrimmedLength = (value, min) => requiredTrimmed(value).length >= min;
const normalizeStringArray = (value) => (Array.isArray(value) ? value.map((item) => requiredTrimmed(item)).filter(Boolean) : []);

module.exports = {
  SLUG_PATTERN,
  MEDIA_REFERENCE_PREFIX,
  normalizeSlug,
  isValidSlug,
  isHttpUrl,
  isValidOptionalHttpUrl,
  isValidContentHref,
  isMediaReference,
  mediaIdFromReference,
  toMediaReference,
  mediaReferenceExists,
  isValidMediaFieldValue,
  requiredTrimmed,
  hasMinTrimmedLength,
  normalizeStringArray,
};
