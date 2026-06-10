class ContactService {
  constructor({ contactSubmissionRepository, emailService }) {
    if (!contactSubmissionRepository) throw new Error('ContactService requires a contactSubmissionRepository.');
    this.contactSubmissionRepository = contactSubmissionRepository;
    this.emailService = emailService;
  }

  async submit(payload, context = {}) {
    const source = context.source ?? 'site';
    const requestId = context.requestId ?? null;
    const emailConfigured = Boolean(this.emailService?.isDeliveryReady?.());
    const submission = await this.contactSubmissionRepository.create({
      ...payload, source, requestId, status: 'new', delivered: false,
      deliveryMode: emailConfigured ? 'pending' : 'disabled',
      deliveryStatus: emailConfigured ? 'received' : 'disabled',
    });
    if (!submission?.id) throw new Error('CONTACT_PERSISTENCE_FAILED');

    if (!emailConfigured) {
      const updated = await this.contactSubmissionRepository.updateDeliveryStatus(submission.id, {
        delivered: false, deliveryMode: 'disabled', deliveryStatus: 'disabled', deliveryError: null,
      });
      return { submission: updated, delivered: false, mode: 'disabled', status: 'disabled', warning: 'EMAIL_NOT_CONFIGURED' };
    }

    try {
      const emailResult = await this.emailService.sendContactEmail({ ...payload, source });
      const updated = await this.contactSubmissionRepository.updateDeliveryStatus(submission.id, {
        delivered: Boolean(emailResult?.delivered), deliveryMode: emailResult?.mode ?? 'disabled',
        deliveryStatus: emailResult?.delivered ? 'sent' : 'disabled', deliveryError: null,
      });
      return { submission: updated, delivered: Boolean(emailResult?.delivered), mode: emailResult?.mode ?? 'disabled', status: emailResult?.delivered ? 'sent' : 'disabled', warning: emailResult?.delivered ? null : 'EMAIL_NOT_CONFIGURED' };
    } catch (error) {
      const updated = await this.contactSubmissionRepository.updateDeliveryStatus(submission.id, {
        delivered: false, deliveryMode: 'error', deliveryStatus: 'failed',
        deliveryError: `${error?.message || 'delivery_failed'}`.slice(0, 500),
      });
      return { submission: updated, delivered: false, mode: 'error', status: 'failed', warning: 'EMAIL_DELIVERY_FAILED' };
    }
  }

  async listSubmissions(filters = {}) { return this.contactSubmissionRepository.list(filters); }
  async updateStatus(id, status) { return this.contactSubmissionRepository.update(id, { status }); }
  async deleteSubmission(id) { return this.contactSubmissionRepository.delete(id); }
}
module.exports = { ContactService };
