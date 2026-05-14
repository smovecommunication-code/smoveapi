import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { sendError, sendSuccess } = require('../utils/apiResponse');

function createRes() {
  return {
    statusCode: 200,
    payload: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.payload = body;
      return this;
    },
  };
}

describe('apiResponse status normalization', () => {
  it('falls back to 500 for non-numeric error status values', () => {
    const res = createRes();
    sendError(res, 'client', 'X', 'bad');
    expect(res.statusCode).toBe(500);
    expect(res.payload.success).toBe(false);
  });

  it('falls back to 200 for non-numeric success status values', () => {
    const res = createRes();
    sendSuccess(res, 'client', { ok: true });
    expect(res.statusCode).toBe(200);
    expect(res.payload.success).toBe(true);
  });
});
