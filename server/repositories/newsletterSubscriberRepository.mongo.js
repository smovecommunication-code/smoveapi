const { createNewsletterSubscriberModel } = require('../models/NewsletterSubscriber');
const { createNewsletterCampaignModel } = require('../models/NewsletterCampaign');

class MongoNewsletterSubscriberRepository {
  constructor({ mongoose }) {
    this.NewsletterSubscriberModel = createNewsletterSubscriberModel(mongoose);
    this.NewsletterCampaignModel = createNewsletterCampaignModel(mongoose);
  }

  async findByEmail(email) {
    const normalized = String(email || '').trim().toLowerCase();
    if (!normalized) return null;
    const doc = await this.NewsletterSubscriberModel.findOne({ email: normalized });
    return doc ? this.serialize(doc) : null;
  }

  async upsertSubscription(payload) {
    const doc = await this.NewsletterSubscriberModel.findOneAndUpdate(
      { email: payload.email },
      {
        $set: {
          status: payload.status,
          name: payload.name ?? '',
          source: payload.source,
          linkedUserId: payload.linkedUserId ?? null,
          unsubscribedAt: payload.unsubscribedAt ?? null,
          meta: payload.meta ?? {},
        },
        $setOnInsert: {
          subscribedAt: payload.subscribedAt,
        },
      },
      { new: true, upsert: true },
    );

    return this.serialize(doc);
  }

  async updateStatus(id, payload) {
    const doc = await this.NewsletterSubscriberModel.findByIdAndUpdate(
      id,
      {
        $set: {
          status: payload.status,
          unsubscribedAt: payload.unsubscribedAt ?? null,
          source: payload.source,
          linkedUserId: payload.linkedUserId ?? null,
        },
      },
      { new: true },
    );

    return doc ? this.serialize(doc) : null;
  }

  async findById(id) {
    const doc = await this.NewsletterSubscriberModel.findById(id);
    return doc ? this.serialize(doc) : null;
  }

  async list({ page = 1, limit = 50, query = '', status = 'all', source = 'all' } = {}) {
    const mongoQuery = this.buildMongoQuery({ query, status, source });
    const summaryQuery = this.buildMongoQuery({ query, source, status: 'all' });

    const normalizedPage = Math.max(1, Number(page) || 1);
    const normalizedLimit = Math.min(200, Math.max(1, Number(limit) || 50));
    const skip = (normalizedPage - 1) * normalizedLimit;

    const [docs, total] = await Promise.all([
      this.NewsletterSubscriberModel.find(mongoQuery)
        .sort({ subscribedAt: -1, createdAt: -1 })
        .skip(skip)
        .limit(normalizedLimit),
      this.NewsletterSubscriberModel.countDocuments(mongoQuery),
    ]);

    const [activeCount, unsubscribedCount] = await Promise.all([
      this.NewsletterSubscriberModel.countDocuments({ ...summaryQuery, status: 'active' }),
      this.NewsletterSubscriberModel.countDocuments({ ...summaryQuery, status: 'unsubscribed' }),
    ]);

    return {
      items: docs.map((doc) => this.serialize(doc)),
      pagination: {
        page: normalizedPage,
        limit: normalizedLimit,
        total,
        pages: Math.max(1, Math.ceil(total / normalizedLimit)),
      },
      summary: {
        total: activeCount + unsubscribedCount,
        active: activeCount,
        unsubscribed: unsubscribedCount,
      },
    };
  }


  async createCampaign(payload) {
    const doc = await this.NewsletterCampaignModel.create({
      subject: payload.subject,
      previewText: payload.previewText ?? '',
      html: payload.html ?? '',
      text: payload.text ?? '',
      provider: payload.provider,
      status: payload.status,
      code: payload.code ?? '',
      message: payload.message ?? '',
      sentBy: payload.sentBy ?? 'unknown',
      sentAt: payload.sentAt ?? new Date(),
      recipientCount: payload.recipientCount ?? 0,
      deliveredCount: payload.deliveredCount ?? 0,
      failedCount: payload.failedCount ?? 0,
      recipients: payload.recipients ?? [],
      providerResponse: payload.providerResponse ?? {},
    });

    return this.serializeCampaign(doc);
  }

  async listCampaigns({ page = 1, limit = 50, status = 'all' } = {}) {
    const normalizedPage = Math.max(1, Number(page) || 1);
    const normalizedLimit = Math.min(100, Math.max(1, Number(limit) || 50));
    const skip = (normalizedPage - 1) * normalizedLimit;
    const query = status && status !== 'all' ? { status } : {};

    const [docs, total] = await Promise.all([
      this.NewsletterCampaignModel.find(query).sort({ sentAt: -1, createdAt: -1 }).skip(skip).limit(normalizedLimit),
      this.NewsletterCampaignModel.countDocuments(query),
    ]);

    return {
      items: docs.map((doc) => this.serializeCampaign(doc)),
      pagination: {
        page: normalizedPage,
        limit: normalizedLimit,
        total,
        pages: Math.max(1, Math.ceil(total / normalizedLimit)),
      },
    };
  }

  buildMongoQuery({ query = '', status = 'all', source = 'all' } = {}) {
    const mongoQuery = {};
    if (query.trim()) {
      mongoQuery.email = { $regex: query.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), $options: 'i' };
    }
    if (status !== 'all') {
      mongoQuery.status = status;
    }
    if (source !== 'all') {
      mongoQuery.source = source;
    }
    return mongoQuery;
  }

  serializeCampaign(doc) {
    return {
      id: String(doc._id),
      subject: doc.subject,
      previewText: doc.previewText ?? '',
      provider: doc.provider,
      status: doc.status,
      code: doc.code ?? '',
      message: doc.message ?? '',
      sentBy: doc.sentBy ?? 'unknown',
      sentAt: doc.sentAt,
      recipientCount: doc.recipientCount ?? 0,
      deliveredCount: doc.deliveredCount ?? 0,
      failedCount: doc.failedCount ?? 0,
      recipients: doc.recipients ?? [],
      providerResponse: doc.providerResponse ?? {},
      createdAt: doc.createdAt,
      updatedAt: doc.updatedAt,
    };
  }

  serialize(doc) {
    return {
      id: String(doc._id),
      email: doc.email,
      name: doc.name ?? '',
      status: doc.status,
      subscribedAt: doc.subscribedAt,
      unsubscribedAt: doc.unsubscribedAt,
      source: doc.source,
      linkedUserId: doc.linkedUserId,
      meta: doc.meta ?? {},
      createdAt: doc.createdAt,
      updatedAt: doc.updatedAt,
    };
  }
}

module.exports = { MongoNewsletterSubscriberRepository };
