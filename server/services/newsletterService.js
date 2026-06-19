const { logInfo, logError } = require('../utils/logger');

const PROVIDER_NOT_CONFIGURED = {
  ok: false,
  code: 'EMAIL_PROVIDER_NOT_CONFIGURED',
  message: 'Aucun fournisseur email n’est configuré.',
};

class NewsletterService {
  constructor({ newsletterSubscriberRepository, userRepository = null, emailService = null }) {
    if (!newsletterSubscriberRepository) {
      throw new Error('NewsletterService requires newsletterSubscriberRepository.');
    }

    this.newsletterSubscriberRepository = newsletterSubscriberRepository;
    this.userRepository = userRepository;
    this.emailService = emailService;
  }

  async subscribe(payload) {
    const now = new Date();
    logInfo('newsletter_subscription_received', { source: payload.source });
    const existing = await this.newsletterSubscriberRepository.findByEmail(payload.email);
    const linkedUser = this.userRepository ? await this.userRepository.findByEmail(payload.email) : null;

    if (existing?.status === 'active') {
      logInfo('newsletter_subscription_duplicate', { subscriberId: existing.id, source: payload.source });
      return { action: 'already_active', subscriber: existing };
    }

    const subscriber = await this.newsletterSubscriberRepository.upsertSubscription({
      email: payload.email,
      name: payload.name ?? existing?.name ?? '',
      status: 'active',
      subscribedAt: existing?.subscribedAt ?? now,
      unsubscribedAt: null,
      source: payload.source,
      linkedUserId: linkedUser?.id ?? existing?.linkedUserId ?? null,
      meta: { ...(existing?.meta ?? {}), lastSource: payload.source },
    });
    if (!subscriber?.id) throw new Error('NEWSLETTER_PERSISTENCE_FAILED');

    logInfo(existing ? 'newsletter_subscription_reactivated' : 'newsletter_subscription_created', {
      subscriberId: subscriber.id,
      source: payload.source,
    });

    return { action: existing ? 'reactivated' : 'created', subscriber };
  }

  async listSubscribers(filters) {
    const result = await this.newsletterSubscriberRepository.list(filters);
    logInfo('newsletter_admin_list_loaded', {
      page: result.pagination?.page ?? 1,
      limit: result.pagination?.limit ?? 50,
      total: result.pagination?.total ?? 0,
      active: result.summary?.active ?? 0,
      unsubscribed: result.summary?.unsubscribed ?? 0,
    });

    return {
      ...result,
      items: await Promise.all(
        result.items.map(async (item) => {
          const linkedUser = item.linkedUserId && this.userRepository
            ? await this.userRepository.findById(item.linkedUserId)
            : (this.userRepository ? await this.userRepository.findByEmail(item.email) : null);

          return {
            ...item,
            linkedUser: linkedUser
              ? { id: linkedUser.id, email: linkedUser.email, name: linkedUser.name, role: linkedUser.role }
              : null,
          };
        }),
      ),
    };
  }

  async listCampaigns(filters) {
    if (typeof this.newsletterSubscriberRepository.listCampaigns !== 'function') {
      return { items: [], pagination: { page: 1, limit: 50, total: 0, pages: 1 } };
    }
    return this.newsletterSubscriberRepository.listCampaigns(filters);
  }

  async sendCampaign(campaign, actor = {}) {
    const subscriberResult = await this.newsletterSubscriberRepository.list({ status: 'active', limit: 1000, page: 1 });
    const recipients = subscriberResult.items.filter((item) => item.status === 'active').map((item) => item.email);
    const providerStatus = this.emailService?.getProviderStatus?.() ?? { deliveryReady: false, mode: 'dev-fallback' };
    const baseRecord = {
      ...campaign,
      provider: providerStatus.mode,
      sentBy: actor.sentBy ?? 'unknown',
      sentAt: new Date(),
      recipientCount: recipients.length,
    };

    if (!providerStatus.deliveryReady) {
      const record = await this.persistCampaign({
        ...baseRecord,
        status: 'failed',
        code: PROVIDER_NOT_CONFIGURED.code,
        message: PROVIDER_NOT_CONFIGURED.message,
        deliveredCount: 0,
        failedCount: recipients.length,
        recipients: recipients.map((email) => ({ email, status: 'failed', errorCode: PROVIDER_NOT_CONFIGURED.code, errorMessage: PROVIDER_NOT_CONFIGURED.message })),
        providerResponse: providerStatus,
      });
      logError('newsletter_campaign_failed_provider_missing', { recipientCount: recipients.length, sentBy: actor.sentBy });
      return { ...PROVIDER_NOT_CONFIGURED, provider: providerStatus.mode, recipientCount: recipients.length, campaign: record };
    }

    if (recipients.length === 0) {
      const record = await this.persistCampaign({ ...baseRecord, status: 'skipped', code: 'NEWSLETTER_NO_ACTIVE_RECIPIENTS', message: 'Aucun abonné actif.', deliveredCount: 0, failedCount: 0, recipients: [], providerResponse: providerStatus });
      return { ok: false, code: 'NEWSLETTER_NO_ACTIVE_RECIPIENTS', message: 'Aucun abonné actif.', provider: providerStatus.mode, recipientCount: 0, campaign: record };
    }

    const recipientResults = [];
    for (const email of recipients) {
      try {
        const delivery = await this.emailService.sendNewsletterEmail({ to: email, ...campaign });
        recipientResults.push({ email, status: 'sent', providerMessageId: delivery.id || '' });
      } catch (error) {
        recipientResults.push({ email, status: 'failed', errorCode: error.code || 'EMAIL_PROVIDER_ERROR', errorMessage: error.message || 'Email provider failed.' });
      }
    }

    const deliveredCount = recipientResults.filter((item) => item.status === 'sent').length;
    const failedCount = recipientResults.length - deliveredCount;
    const status = deliveredCount === recipients.length ? 'sent' : (deliveredCount > 0 ? 'partial' : 'failed');
    const code = failedCount > 0 ? 'NEWSLETTER_DELIVERY_FAILED' : 'NEWSLETTER_DELIVERED';
    const message = failedCount > 0 ? `${failedCount} email(s) n’ont pas été acceptés par le fournisseur.` : 'Newsletter acceptée par le fournisseur email.';
    const record = await this.persistCampaign({ ...baseRecord, status, code, message, deliveredCount, failedCount, recipients: recipientResults, providerResponse: providerStatus });

    logInfo('newsletter_campaign_sent', { provider: providerStatus.mode, recipientCount: recipients.length, deliveredCount, failedCount, sentBy: actor.sentBy });
    return { ok: status === 'sent', code, message, provider: providerStatus.mode, recipientCount: recipients.length, deliveredCount, failedCount, subject: campaign.subject, campaign: record };
  }

  async persistCampaign(payload) {
    if (typeof this.newsletterSubscriberRepository.createCampaign !== 'function') return payload;
    return this.newsletterSubscriberRepository.createCampaign(payload);
  }

  async updateSubscriberStatus(id, { status, source = 'cms' }) {
    const existing = await this.newsletterSubscriberRepository.findById(id);
    if (!existing) return { ok: false, error: { code: 'NEWSLETTER_NOT_FOUND', message: 'Subscriber not found.' }, status: 404 };

    const linkedUser = this.userRepository ? await this.userRepository.findByEmail(existing.email) : null;
    const subscriber = await this.newsletterSubscriberRepository.updateStatus(id, {
      status,
      source,
      linkedUserId: linkedUser?.id ?? existing.linkedUserId ?? null,
      unsubscribedAt: status === 'unsubscribed' ? new Date() : null,
    });
    logInfo('newsletter_subscription_status_updated', { subscriberId: id, status, source });

    return { ok: true, subscriber };
  }
}

module.exports = { NewsletterService, PROVIDER_NOT_CONFIGURED };
