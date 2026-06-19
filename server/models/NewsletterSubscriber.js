const NEWSLETTER_STATUSES = ['active', 'unsubscribed'];

function createNewsletterSubscriberModel(mongoose) {
  const modelName = 'NewsletterSubscriber';
  if (mongoose.models[modelName]) return mongoose.models[modelName];

  const schema = new mongoose.Schema(
    {
      email: {
        type: String,
        required: true,
        trim: true,
        lowercase: true,
        maxlength: 160,
        unique: true,
      },
      status: {
        type: String,
        enum: NEWSLETTER_STATUSES,
        default: 'active',
        index: true,
      },
      subscribedAt: {
        type: Date,
        default: Date.now,
        index: true,
      },
      unsubscribedAt: {
        type: Date,
        default: null,
      },
      name: {
        type: String,
        trim: true,
        maxlength: 120,
        default: '',
      },
      source: {
        type: String,
        trim: true,
        maxlength: 64,
        default: 'website',
      },
      linkedUserId: {
        type: String,
        default: null,
        index: true,
      },
      meta: {
        type: mongoose.Schema.Types.Mixed,
        default: {},
      },
    },
    { timestamps: true, collection: 'newsletter_subscribers' },
  );


  return mongoose.model(modelName, schema);
}

module.exports = { NEWSLETTER_STATUSES, createNewsletterSubscriberModel };
