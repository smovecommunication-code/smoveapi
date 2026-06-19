const NEWSLETTER_CAMPAIGN_STATUSES = ['sent', 'failed', 'partial', 'skipped'];

function createNewsletterCampaignModel(mongoose) {
  const modelName = 'NewsletterCampaign';
  if (mongoose.models[modelName]) return mongoose.models[modelName];

  const recipientSchema = new mongoose.Schema(
    {
      email: { type: String, required: true, trim: true, lowercase: true, maxlength: 160 },
      status: { type: String, enum: ['sent', 'failed', 'skipped'], required: true },
      providerMessageId: { type: String, default: '' },
      errorCode: { type: String, default: '' },
      errorMessage: { type: String, default: '' },
    },
    { _id: false },
  );

  const schema = new mongoose.Schema(
    {
      subject: { type: String, required: true, trim: true, maxlength: 180 },
      previewText: { type: String, trim: true, maxlength: 220, default: '' },
      html: { type: String, default: '' },
      text: { type: String, default: '' },
      provider: { type: String, required: true, index: true },
      status: { type: String, enum: NEWSLETTER_CAMPAIGN_STATUSES, required: true, index: true },
      code: { type: String, default: '', index: true },
      message: { type: String, default: '' },
      sentBy: { type: String, default: 'unknown', index: true },
      sentAt: { type: Date, default: Date.now, index: true },
      recipientCount: { type: Number, default: 0 },
      deliveredCount: { type: Number, default: 0 },
      failedCount: { type: Number, default: 0 },
      recipients: { type: [recipientSchema], default: [] },
      providerResponse: { type: mongoose.Schema.Types.Mixed, default: {} },
    },
    { timestamps: true, collection: 'newsletter_campaigns' },
  );

  return mongoose.model(modelName, schema);
}

module.exports = { NEWSLETTER_CAMPAIGN_STATUSES, createNewsletterCampaignModel };
