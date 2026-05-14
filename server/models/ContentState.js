function createContentStateModel(mongoose) {
  const modelName = 'ContentState';
  if (mongoose.models[modelName]) return mongoose.models[modelName];

  const schema = new mongoose.Schema(
    {
      key: { type: String, required: true, unique: true, index: true },
      schemaVersion: { type: Number, required: true },
      blogPosts: { type: Array, default: [] },
      projects: { type: Array, default: [] },
      mediaFiles: { type: Array, default: [] },
      services: { type: Array, default: [] },
      pageContent: { type: Object, default: null },
      settings: { type: Object, default: null },
      settingsHistory: { type: Array, default: [] },
      migrationHistory: { type: Array, default: [] },
      analyticsEvents: { type: Array, default: [] },
    },
    { minimize: false, timestamps: true },
  );

  return mongoose.model(modelName, schema);
}

module.exports = { createContentStateModel };
