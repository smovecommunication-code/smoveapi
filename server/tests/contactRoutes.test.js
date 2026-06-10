import { describe, expect, it } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { createContactRoutes, createMessageManagementRoutes, validateContactPayload } = require('../routes/contactRoutes');

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

describe('contact route payload validation', () => {
  it('rejects invalid email payload', () => {
    const result = validateContactPayload({
      name: 'John Doe',
      email: 'invalid-email',
      subject: 'Project',
      message: 'Hello this is a message',
    });

    expect(result.ok).toBe(false);
    expect(result.error.code).toBe('CONTACT_INVALID_EMAIL');
  });

  it('accepts phone-only payload with an optional subject', () => {
    const result = validateContactPayload({ name: 'John Doe', phone: '+22501020304', message: 'Please call me about a project.' });
    expect(result.ok).toBe(true);
    expect(result.data.email).toBe('');
    expect(result.data.subject).toBe('');
  });

  it('accepts valid payload', () => {
    const result = validateContactPayload({
      name: 'John Doe',
      email: 'john@example.com',
      subject: 'Need a quote',
      message: 'Hello, I need support for a new campaign.',
      source: 'PROJECT',
      contextSlug: 'Nouveau-Projet',
      contextLabel: 'Nouveau Projet',
    });

    expect(result.ok).toBe(true);
    expect(result.data.email).toBe('john@example.com');
    expect(result.data.source).toBe('project');
    expect(result.data.contextSlug).toBe('nouveau-projet');
  });
  it('exposes message status update and delete handlers', async () => {
    const service = { updateStatus: async (id, status) => ({ id, status }), deleteSubmission: async () => true };
    const router = createMessageManagementRoutes({ contactService: service });
    const patchLayer = router.stack.find((entry) => entry.route?.path === '/:id' && entry.route.methods.patch);
    const deleteLayer = router.stack.find((entry) => entry.route?.path === '/:id' && entry.route.methods.delete);
    const patchRes = createRes();
    await patchLayer.route.stack.at(-1).handle({ params: { id: 'sub_1' }, body: { status: 'read' } }, patchRes);
    expect(patchRes.body.data.message.status).toBe('read');
    const deleteRes = createRes();
    await deleteLayer.route.stack.at(-1).handle({ params: { id: 'sub_1' } }, deleteRes);
    expect(deleteRes.body.data.deleted).toBe(true);
  });

});

describe('contact route delivery responses', () => {
  it('returns success when email provider sends', async () => {
    const router = createContactRoutes({
      contactService: { submit: async () => ({ delivered: true, mode: 'resend', status: 'sent', submission: { id: 'sub_1' } }) },
    });

    const handler = router.stack[0].route.stack[0].handle;
    const req = {
      body: {
        name: 'John Doe',
        email: 'john@example.com',
        subject: 'Need a quote',
        message: 'Hello, I need support for a new campaign.',
      },
      get: () => 'https://www.example.com',
    };
    const res = createRes();

    await handler(req, res);

    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.status).toBeDefined();
    expect(res.body.data.message).toContain('message');
  });

  it('returns provider failure when sender throws', async () => {
    const router = createContactRoutes({
      contactService: { submit: async () => { throw new Error('provider down'); } },
    });

    const handler = router.stack[0].route.stack[0].handle;
    const req = {
      body: {
        name: 'John Doe',
        email: 'john@example.com',
        subject: 'Need a quote',
        message: 'Hello, I need support for a new campaign.',
      },
      get: () => 'https://www.example.com',
      requestId: 'req-1',
    };
    const res = createRes();

    await handler(req, res);

    expect(res.statusCode).toBe(500);
    expect(res.body.error.code).toBe('CONTACT_SUBMISSION_FAILED');
  });

  it('returns persistence failure when repository did not save record', async () => {
    const router = createContactRoutes({
      contactService: { submit: async () => { throw new Error('CONTACT_PERSISTENCE_FAILED'); } },
    });

    const handler = router.stack[0].route.stack[0].handle;
    const req = {
      body: {
        name: 'John Doe',
        email: 'john@example.com',
        subject: 'Need a quote',
        message: 'Hello, I need support for a new campaign.',
      },
      get: () => 'https://www.example.com',
      requestId: 'req-1',
    };
    const res = createRes();

    await handler(req, res);

    expect(res.statusCode).toBe(500);
    expect(res.body.error.code).toBe('CONTACT_PERSISTENCE_FAILED');
  });

  it('exposes admin submissions list endpoint', async () => {
    const router = createContactRoutes({
      contactService: {
        submit: async () => ({ delivered: true, mode: 'resend', status: 'sent', submission: { id: 'sub_1' } }),
        listSubmissions: async () => ({
          items: [{ id: 'sub_1', email: 'john@example.com', source: 'project', deliveryStatus: 'sent' }],
          pagination: { page: 1, limit: 50, total: 1, pages: 1 },
          summary: { total: 1, received: 0, sent: 1, failed: 0, disabled: 0 },
        }),
      },
    });

    const adminLayer = router.stack.find((entry) => entry.route?.path === '/admin/submissions');
    const handler = adminLayer.route.stack[0].handle;
    const req = { query: { source: 'project' } };
    const res = { ...createRes(), setHeader: () => {} };

    await handler(req, res);

    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.items).toHaveLength(1);
    expect(res.body.data.summary.sent).toBe(1);
  });
});
