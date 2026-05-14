class ContactService {
  constructor({ contactSubmissionRepository, emailService }) {
    if (!contactSubmissionRepository) {
      throw new Error('ContactService requires a contactSubmissionRepository.');
    }
    this.contactSubmissionRepository = contactSubmissionRepository;
    this.emailService = emailService;
  }

  async submit(payload, context = {}) {
    const source = context.source ?? 'website';
    const requestId = context.requestId ?? null;

    const submission = await this.contactSubmissionRepository.create({
      ...payload,
      source,
      requestId,
      delivered: false,
      deliveryMode: this.emailService ? 'pending' : 'disabled',
      deliveryStatus: this.emailService ? 'received' : 'disabled',
    });
    if (!submission?.id) {
      throw new Error('CONTACT_PERSISTENCE_FAILED');
    }

    try {
      const emailResult = this.emailService
        ? await this.emailService.sendContactEmail({ ...payload, source })
        : { delivered: false, mode: 'disabled' };

      const deliveryStatus = emailResult?.delivered ? 'sent' : 'disabled';
      const updatedSubmission = await this.contactSubmissionRepository.updateDeliveryStatus(submission.id, {
        delivered: Boolean(emailResult?.delivered),
        deliveryMode: emailResult?.mode ?? 'disabled',
        deliveryStatus,
        deliveryError: null,
      });

      return {
        submission: updatedSubmission,
        delivered: Boolean(emailResult?.delivered),
        mode: emailResult?.mode ?? 'disabled',
        status: deliveryStatus,
      };
    } catch (error) {
      await this.contactSubmissionRepository.updateDeliveryStatus(submission.id, {
        delivered: false,
        deliveryMode: 'error',
        deliveryStatus: 'failed',
        deliveryError: `${error?.message || 'delivery_failed'}`.slice(0, 500),
      });
      throw error;
    }
  }

  async listSubmissions(filters = {}) {
    return this.contactSubmissionRepository.list(filters);
  }
}

module.exports = { ContactService };
