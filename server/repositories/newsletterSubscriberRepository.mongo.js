const { createNewsletterSubscriberModel } = require('../models/NewsletterSubscriber');

class MongoNewsletterSubscriberRepository {
  constructor({ mongoose }) {
    this.NewsletterSubscriberModel = createNewsletterSubscriberModel(mongoose);
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

  serialize(doc) {
    return {
      id: String(doc._id),
      email: doc.email,
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
