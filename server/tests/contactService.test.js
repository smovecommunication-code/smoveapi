const { describe, it, expect, vi, beforeEach } = require('vitest');
const { ContactService } = require('../services/contactService');

describe('ContactService', () => {
  let repository;

  beforeEach(() => {
    repository = {
      create: vi.fn(),
      updateDeliveryStatus: vi.fn(),
      list: vi.fn(),
    };
  });

  it('persists and returns sent status when email delivery succeeds', async () => {
    repository.create.mockResolvedValue({ id: 'lead_1' });
    repository.updateDeliveryStatus.mockResolvedValue({ id: 'lead_1', deliveryStatus: 'sent', delivered: true });

    const service = new ContactService({
      contactSubmissionRepository: repository,
      emailService: { sendContactEmail: vi.fn(async () => ({ delivered: true, mode: 'resend' })) },
    });

    const result = await service.submit({
      name: 'John Doe',
      email: 'john@example.com',
      subject: 'Project inquiry',
      message: 'Need help with a launch campaign.',
      source: 'project',
    }, { source: 'project_detail' });

    expect(repository.create).toHaveBeenCalledTimes(1);
    expect(repository.updateDeliveryStatus).toHaveBeenCalledWith('lead_1', expect.objectContaining({ deliveryStatus: 'sent' }));
    expect(result.status).toBe('sent');
    expect(result.submission.id).toBe('lead_1');
  });

  it('throws persistence failure when repository create does not return id', async () => {
    repository.create.mockResolvedValue(null);

    const service = new ContactService({
      contactSubmissionRepository: repository,
      emailService: { sendContactEmail: vi.fn() },
    });

    await expect(service.submit({
      name: 'John Doe',
      email: 'john@example.com',
      subject: 'Project inquiry',
      message: 'Need help with a launch campaign.',
    })).rejects.toThrow('CONTACT_PERSISTENCE_FAILED');
  });

  it('returns repository listing and summary for CMS', async () => {
    repository.list.mockResolvedValue({
      items: [{ id: 'lead_1', source: 'project', deliveryStatus: 'sent' }],
      pagination: { page: 1, limit: 50, total: 1, pages: 1 },
      summary: { total: 1, received: 0, sent: 1, failed: 0, disabled: 0 },
    });

    const service = new ContactService({
      contactSubmissionRepository: repository,
      emailService: null,
    });

    const result = await service.listSubmissions({ source: 'project' });
    expect(result.items).toHaveLength(1);
    expect(result.summary.total).toBe(1);
  });
});
