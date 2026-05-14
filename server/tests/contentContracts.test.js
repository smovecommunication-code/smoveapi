import { describe, expect, it } from 'vitest';

const {
  isHttpUrl,
  isValidContentHref,
  isValidMediaFieldValue,
  isValidSlug,
  normalizeSlug,
} = require('../utils/contentContracts');

describe('server shared content contracts', () => {
  it('keeps slug normalization and validation stable', () => {
    expect(normalizeSlug('Service Démo', '', 'fallback')).toBe('service-demo');
    expect(isValidSlug('service-demo')).toBe(true);
    expect(isValidSlug('service demo')).toBe(false);
  });

  it('validates URL and content href contracts', () => {
    expect(isHttpUrl('https://example.com')).toBe(true);
    expect(isHttpUrl('mailto:test@example.com')).toBe(false);
    expect(isValidContentHref('#services')).toBe(true);
    expect(isValidContentHref('/contact')).toBe(true);
    expect(isValidContentHref('https://example.com')).toBe(true);
    expect(isValidContentHref('ftp://example.com')).toBe(false);
  });

  it('validates media links with lookup callback', () => {
    expect(isValidMediaFieldValue('media:asset-1', { hasMediaById: (id) => id === 'asset-1' })).toBe(true);
    expect(isValidMediaFieldValue('media:missing', { hasMediaById: () => false })).toBe(false);
    expect(isValidMediaFieldValue('inline image keyword', { allowInlineText: true })).toBe(true);
  });
});
