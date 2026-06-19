const { describe, it, expect, vi, beforeEach } = require('vitest');
const { NewsletterService } = require('../services/newsletterService');

describe('NewsletterService', () => {
  let repository;
  let service;

  beforeEach(() => {
    repository = {
      findByEmail: vi.fn(),
      upsertSubscription: vi.fn(),
      list: vi.fn(),
      findById: vi.fn(),
      updateStatus: vi.fn(),
    };
    service = new NewsletterService({ newsletterSubscriberRepository: repository });
  });

  it('creates a subscriber and confirms persistence', async () => {
    repository.findByEmail.mockResolvedValue(null);
    repository.upsertSubscription.mockResolvedValue({ id: 'sub_1', email: 'john@example.com', status: 'active' });

    const result = await service.subscribe({ email: 'john@example.com', source: 'footer' });

    expect(result.action).toBe('created');
    expect(result.subscriber.id).toBe('sub_1');
    expect(repository.upsertSubscription).toHaveBeenCalledTimes(1);
  });

  it('returns duplicate action without writing when subscriber is already active', async () => {
    repository.findByEmail.mockResolvedValue({ id: 'sub_1', email: 'john@example.com', status: 'active' });

    const result = await service.subscribe({ email: 'john@example.com', source: 'footer' });

    expect(result.action).toBe('already_active');
    expect(repository.upsertSubscription).not.toHaveBeenCalled();
  });

  it('throws when repository did not persist subscriber', async () => {
    repository.findByEmail.mockResolvedValue(null);
    repository.upsertSubscription.mockResolvedValue(null);

    await expect(service.subscribe({ email: 'john@example.com', source: 'footer' })).rejects.toThrow('NEWSLETTER_PERSISTENCE_FAILED');
  });

  it('returns list with summary counts from repository', async () => {
    repository.list.mockResolvedValue({
      items: [{ id: 'sub_1', email: 'john@example.com', status: 'active', linkedUserId: null }],
      pagination: { page: 1, limit: 50, total: 1, pages: 1 },
      summary: { total: 1, active: 1, unsubscribed: 0 },
    });

    const result = await service.listSubscribers({});

    expect(result.items).toHaveLength(1);
    expect(result.summary).toEqual({ total: 1, active: 1, unsubscribed: 0 });
  });
});

describe('NewsletterService delivery diagnostics', () => {
  it('records and reports missing email provider instead of fake success', async () => {
    const repository = {
      list: vi.fn(async () => ({
        items: [{ id: 'sub_1', email: 'john@example.com', status: 'active' }],
        pagination: { page: 1, limit: 1000, total: 1, pages: 1 },
        summary: { total: 1, active: 1, unsubscribed: 0 },
      })),
      createCampaign: vi.fn(async (payload) => ({ id: 'camp_1', ...payload })),
    };
    const service = new NewsletterService({
      newsletterSubscriberRepository: repository,
      emailService: { getProviderStatus: () => ({ deliveryReady: false, mode: 'dev-fallback' }) },
    });

    const result = await service.sendCampaign({ subject: 'Hello', html: '<p>Hello</p>' }, { sentBy: 'u_1' });

    expect(result.ok).toBe(false);
    expect(result.code).toBe('EMAIL_PROVIDER_NOT_CONFIGURED');
    expect(repository.createCampaign).toHaveBeenCalledWith(expect.objectContaining({
      status: 'failed',
      code: 'EMAIL_PROVIDER_NOT_CONFIGURED',
      recipientCount: 1,
      failedCount: 1,
    }));
  });
});
