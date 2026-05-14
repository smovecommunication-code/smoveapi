const { createContactSubmissionModel } = require('../models/ContactSubmission');

class MongoContactSubmissionRepository {
  constructor({ mongoose }) {
    this.ContactSubmissionModel = createContactSubmissionModel(mongoose);
  }

  async create(payload) {
    const doc = await this.ContactSubmissionModel.create(payload);
    return this.serialize(doc);
  }

  async updateDeliveryStatus(id, payload) {
    const doc = await this.ContactSubmissionModel.findByIdAndUpdate(id, payload, { new: true });
    if (!doc) {
      throw new Error(`Contact submission ${id} not found for delivery update.`);
    }
    return this.serialize(doc);
  }

  async list(filters = {}) {
    const page = Math.max(1, Number.parseInt(filters.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, Number.parseInt(filters.limit, 10) || 50));
    const query = `${filters.query || ''}`.trim();
    const source = `${filters.source || 'all'}`.trim().toLowerCase();
    const deliveryStatus = `${filters.deliveryStatus || 'all'}`.trim().toLowerCase();

    const mongoQuery = {};
    if (query) {
      mongoQuery.$or = [
        { name: { $regex: query, $options: 'i' } },
        { email: { $regex: query, $options: 'i' } },
        { subject: { $regex: query, $options: 'i' } },
        { message: { $regex: query, $options: 'i' } },
        { contextLabel: { $regex: query, $options: 'i' } },
      ];
    }
    if (source !== 'all') {
      mongoQuery.source = source;
    }
    if (deliveryStatus !== 'all') {
      mongoQuery.deliveryStatus = deliveryStatus;
    }

    const [docs, total, summaryRows] = await Promise.all([
      this.ContactSubmissionModel.find(mongoQuery)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit),
      this.ContactSubmissionModel.countDocuments(mongoQuery),
      this.ContactSubmissionModel.aggregate([
        { $match: mongoQuery },
        { $group: { _id: '$deliveryStatus', count: { $sum: 1 } } },
      ]),
    ]);

    const summary = {
      total,
      received: 0,
      sent: 0,
      failed: 0,
      disabled: 0,
    };

    for (const row of summaryRows) {
      const key = `${row._id || 'received'}`.toLowerCase();
      if (Object.prototype.hasOwnProperty.call(summary, key)) {
        summary[key] = row.count;
      }
    }

    return {
      items: docs.map((doc) => this.serialize(doc)),
      pagination: {
        page,
        limit,
        total,
        pages: Math.max(1, Math.ceil(total / limit)),
      },
      summary,
    };
  }

  serialize(doc) {
    return {
      id: String(doc._id),
      name: doc.name,
      email: doc.email,
      subject: doc.subject,
      message: doc.message,
      phone: doc.phone,
      source: doc.source,
      contextSlug: doc.contextSlug,
      contextLabel: doc.contextLabel,
      requestId: doc.requestId,
      delivered: Boolean(doc.delivered),
      deliveryMode: doc.deliveryMode ?? null,
      deliveryStatus: doc.deliveryStatus ?? 'received',
      deliveryError: doc.deliveryError ?? null,
      createdAt: doc.createdAt,
    };
  }
}

module.exports = { MongoContactSubmissionRepository };
