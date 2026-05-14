import { describe, expect, it } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const envModulePath = require.resolve('../config/env');

function loadEnvWith(overrides) {
  const previous = new Map();
  for (const [key, value] of Object.entries(overrides)) {
    previous.set(key, process.env[key]);
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }

  delete require.cache[envModulePath];
  const loaded = require('../config/env');

  for (const [key, value] of previous.entries()) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }

  delete require.cache[envModulePath];
  return loaded;
}

describe('env frontend origins', () => {
  it('prefers VITE_PUBLIC_SITE_URL as frontend origin when FRONTEND_ORIGIN is not explicitly set', () => {
    const env = loadEnvWith({
      NODE_ENV: 'production',
      FRONTEND_ORIGIN: undefined,
      VITE_PUBLIC_SITE_URL: 'https://smove-three.vercel.app/#home',
      FRONTEND_ORIGINS: 'https://smove-three.vercel.app,https://smoovecms.vercel.app',
    });

    expect(env.FRONTEND_ORIGIN).toBe('https://smove-three.vercel.app');
    expect(env.APP_BASE_URL).toBe('https://smove-three.vercel.app');
  });

  it('includes Vite CMS/public URLs as safe frontend origins for OAuth redirects', () => {
    const env = loadEnvWith({
      NODE_ENV: 'production',
      FRONTEND_ORIGIN: 'https://www.example.com',
      FRONTEND_ORIGINS: '',
      CMS_ORIGIN: undefined,
      CMS_FRONTEND_ORIGIN: undefined,
      VITE_CMS_APP_URL: 'https://cms.example.com/#cms',
      VITE_PUBLIC_SITE_URL: 'https://www.example.com/#home',
      VITE_PUBLIC_APP_URL: 'https://legacy.example.com/#home',
    });

    expect(env.FRONTEND_ORIGINS).toContain('https://www.example.com');
    expect(env.FRONTEND_ORIGINS).toContain('https://cms.example.com');
    expect(env.FRONTEND_ORIGINS).toContain('https://legacy.example.com');
  });

  it('keeps Google/Facebook disabled by default and does not require provider secrets', () => {
    const env = loadEnvWith({
      NODE_ENV: 'development',
      ENABLE_GOOGLE_LOGIN: undefined,
      ENABLE_FACEBOOK_LOGIN: undefined,
      GOOGLE_CLIENT_ID: undefined,
      GOOGLE_CLIENT_SECRET: undefined,
      FACEBOOK_APP_ID: undefined,
      FACEBOOK_APP_SECRET: undefined,
    });

    expect(env.ENABLE_GOOGLE_LOGIN).toBe(false);
    expect(env.ENABLE_FACEBOOK_LOGIN).toBe(false);
    expect(() => env.validateCriticalEnv()).not.toThrow();
  });

  it('requires full Google credentials only when Google login is enabled', () => {
    const env = loadEnvWith({
      NODE_ENV: 'development',
      ENABLE_GOOGLE_LOGIN: 'true',
      GOOGLE_CLIENT_ID: 'google-client',
      GOOGLE_CLIENT_SECRET: undefined,
    });

    expect(() => env.validateCriticalEnv()).toThrow(/ENABLE_GOOGLE_LOGIN=true/);
  });
});
