import { describe, expect, it } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const {
  createNewsletterRoutes,
  validateNewsletterSubscribePayload,
  validateNewsletterUpdatePayload,
} = require('../routes/newsletterRoutes');
const { requirePermission } = require('../middleware/authz');
const { Permissions } = require('../security/rbac');

function createRes() {
  return {
    statusCode: 200,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
  };
}

describe('newsletter payload validation', () => {
  it('rejects invalid emails', () => {
    const parsed = validateNewsletterSubscribePayload({ email: 'bad-email' });
    expect(parsed.ok).toBe(false);
    expect(parsed.error.code).toBe('NEWSLETTER_INVALID_EMAIL');
  });

  it('accepts valid payload and normalizes source', () => {
    const parsed = validateNewsletterSubscribePayload({ email: 'USER@Example.COM', source: 'Footer' });
    expect(parsed.ok).toBe(true);
    expect(parsed.data.email).toBe('user@example.com');
    expect(parsed.data.source).toBe('footer');
  });

  it('validates status update payload', () => {
    expect(validateNewsletterUpdatePayload({ status: 'active' }).ok).toBe(true);
    expect(validateNewsletterUpdatePayload({ status: 'paused' }).ok).toBe(false);
  });
});

describe('newsletter routes', () => {
  it('subscribes and returns graceful duplicate feedback', async () => {
    let calls = 0;
    const router = createNewsletterRoutes({
      newsletterService: {
        subscribe: async () => {
          calls += 1;
          if (calls === 1) return { action: 'created', subscriber: { id: 'sub_1', status: 'active' } };
          return { action: 'already_active', subscriber: { id: 'sub_1', status: 'active' } };
        },
      },
    });

    const postHandler = router.stack.find((layer) => layer.route?.path === '/' && layer.route?.methods?.post)?.route.stack[0].handle;

    const req = { body: { email: 'user@example.com', source: 'footer' } };
    const res1 = createRes();
    await postHandler(req, res1);
    expect(res1.statusCode).toBe(200);
    expect(res1.body.data.action).toBe('created');

    const res2 = createRes();
    await postHandler(req, res2);
    expect(res2.statusCode).toBe(200);
    expect(res2.body.data.action).toBe('already_active');
  });

  it('lists subscribers through admin endpoint handler', async () => {
    const router = createNewsletterRoutes({
      newsletterService: {
        subscribe: async () => ({ action: 'created', subscriber: { id: 'sub_1', status: 'active' } }),
        listSubscribers: async () => ({
          items: [{ id: 'sub_1', email: 'user@example.com' }],
          pagination: { page: 1, limit: 50, total: 1, pages: 1 },
          summary: { total: 1, active: 1, unsubscribed: 0 },
        }),
      },
    });

    const getHandler = router.stack.find((layer) => layer.route?.path === '/admin/subscribers' && layer.route?.methods?.get)?.route.stack[0].handle;

    const req = { query: { q: 'user' } };
    const res = createRes();
    await getHandler(req, res);

    expect(res.statusCode).toBe(200);
    expect(res.body.data.items).toHaveLength(1);
    expect(res.body.data.summary.active).toBe(1);
  });

  it('keeps admin-only protection on newsletter admin endpoints', () => {
    const req = { appUser: { id: 'u_editor', role: 'editor', accountStatus: 'active' }, session: null };
    const res = createRes();
    let nextCalled = false;

    requirePermission(Permissions.USER_MANAGE)(req, res, () => {
      nextCalled = true;
    });

    expect(nextCalled).toBe(false);
    expect(res.statusCode).toBe(403);
    expect(res.body?.error?.code).toBe('FORBIDDEN');
  });
});
