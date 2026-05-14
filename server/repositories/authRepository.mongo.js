const { createUserModel, normalizeEmail } = require('../models/User');

function mapMongoUser(doc) {
  if (!doc) return null;
  const accountStatus = doc.accountStatus ?? (['active', 'invited', 'suspended'].includes(doc.status) ? doc.status : 'active');
  const providers = Array.isArray(doc.providers) && doc.providers.length > 0
    ? doc.providers
    : [doc.authProvider ?? 'local'];

  return {
    id: String(doc._id),
    email: doc.email,
    passwordHash: doc.passwordHash,
    name: doc.name,
    role: doc.role,
    status: doc.status,
    accountStatus,
    authProvider: doc.authProvider,
    providerId: doc.providerId ?? null,
    providers,
    googleId: doc.googleId ?? null,
    facebookId: doc.facebookId ?? null,
    avatarUrl: doc.avatarUrl ?? null,
    emailVerified: Boolean(doc.emailVerified),
    emailVerificationTokenHash: doc.emailVerificationTokenHash ?? null,
    emailVerificationTokenExpiresAt: doc.emailVerificationTokenExpiresAt ?? null,
    lastLoginAt: doc.lastLoginAt ?? null,
    passwordResetTokenHash: doc.passwordResetTokenHash ?? null,
    passwordResetTokenExpiresAt: doc.passwordResetTokenExpiresAt ?? null,
    lastActivityAt: doc.lastActivityAt ?? doc.lastLoginAt ?? null,
    organizationId: doc.organizationId ?? 'org_default',
    planTier: doc.planTier ?? 'free',
    featureFlags: Array.isArray(doc.featureFlags) ? doc.featureFlags : [],
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}

class MongoAuthRepository {
  constructor({ mongoose }) {
    this.UserModel = createUserModel(mongoose);
  }

  async create(input) {
    const user = await this.UserModel.create({
      email: normalizeEmail(input.email),
      passwordHash: input.passwordHash ?? null,
      name: input.name,
      role: input.role,
      status: input.status,
      accountStatus: input.accountStatus,
      authProvider: input.authProvider ?? 'local',
      providerId: input.providerId ?? null,
      providers: input.providers,
      googleId: input.googleId ?? null,
      facebookId: input.facebookId ?? null,
      avatarUrl: input.avatarUrl ?? null,
      emailVerified: Boolean(input.emailVerified),
      emailVerificationTokenHash: input.emailVerificationTokenHash ?? null,
      emailVerificationTokenExpiresAt: input.emailVerificationTokenExpiresAt ?? null,
      organizationId: input.organizationId ?? 'org_default',
      planTier: input.planTier ?? 'free',
      featureFlags: Array.isArray(input.featureFlags) ? input.featureFlags : [],
    });

    return mapMongoUser(user);
  }

  async findByEmailWithPassword(email) {
    const user = await this.UserModel.findOne({ email: normalizeEmail(email) }).exec();
    return mapMongoUser(user);
  }

  async findByEmail(email) {
    return this.findByEmailWithPassword(email);
  }

  async findByProvider(authProvider, providerId) {
    const providerKey = authProvider === 'google' ? 'googleId' : authProvider === 'facebook' ? 'facebookId' : 'providerId';
    const user = await this.UserModel.findOne({ [providerKey]: String(providerId) }).exec();
    return mapMongoUser(user);
  }

  async findByEmailVerificationTokenHash(tokenHash) {
    const user = await this.UserModel.findOne({ emailVerificationTokenHash: String(tokenHash) }).exec();
    return mapMongoUser(user);
  }

  async findByPasswordResetTokenHash(tokenHash) {
    const user = await this.UserModel.findOne({ passwordResetTokenHash: String(tokenHash) }).exec();
    return mapMongoUser(user);
  }

  async findById(id) {
    const user = await this.UserModel.findById(id).exec();
    return mapMongoUser(user);
  }

  async listUsers() {
    const docs = await this.UserModel.find({}).sort({ createdAt: -1 }).exec();
    return docs.map((doc) => mapMongoUser(doc));
  }

  async existsByEmail(email) {
    const count = await this.UserModel.countDocuments({ email: normalizeEmail(email) }).exec();
    return count > 0;
  }

  async linkOAuthProvider(id, { authProvider, providerId, name, emailVerified = true, avatarUrl = null }) {
    const providerField = authProvider === 'google' ? 'googleId' : 'facebookId';

    const user = await this.UserModel.findByIdAndUpdate(
      id,
      {
        $set: {
          [providerField]: String(providerId),
          providerId: String(providerId),
          ...(name ? { name } : {}),
          ...(avatarUrl ? { avatarUrl } : {}),
          emailVerified,
          emailVerificationTokenHash: null,
          emailVerificationTokenExpiresAt: null,
          updatedAt: new Date(),
        },
        $addToSet: { providers: authProvider },
      },
      { new: true },
    ).exec();

    return mapMongoUser(user);
  }

  async updateLastLoginAt(id, date) {
    const user = await this.UserModel.findByIdAndUpdate(
      id,
      {
        $set: {
          lastLoginAt: date,
          lastActivityAt: date,
          updatedAt: new Date(),
        },
      },
      { new: true },
    ).exec();

    return mapMongoUser(user);
  }

  async setEmailVerificationToken(id, { tokenHash, expiresAt }) {
    const user = await this.UserModel.findByIdAndUpdate(
      id,
      {
        $set: {
          emailVerificationTokenHash: String(tokenHash),
          emailVerificationTokenExpiresAt: expiresAt,
          updatedAt: new Date(),
        },
      },
      { new: true },
    ).exec();

    return mapMongoUser(user);
  }

  async markEmailVerified(id) {
    const user = await this.UserModel.findByIdAndUpdate(
      id,
      {
        $set: {
          emailVerified: true,
          emailVerificationTokenHash: null,
          emailVerificationTokenExpiresAt: null,
          updatedAt: new Date(),
        },
      },
      { new: true },
    ).exec();

    return mapMongoUser(user);
  }


  async setPasswordResetToken(id, { tokenHash, expiresAt }) {
    const user = await this.UserModel.findByIdAndUpdate(
      id,
      {
        $set: {
          passwordResetTokenHash: String(tokenHash),
          passwordResetTokenExpiresAt: expiresAt,
          updatedAt: new Date(),
        },
      },
      { new: true },
    ).exec();

    return mapMongoUser(user);
  }

  async resetPasswordByToken(id, { passwordHash }) {
    const user = await this.UserModel.findByIdAndUpdate(
      id,
      {
        $set: {
          passwordHash,
          passwordResetTokenHash: null,
          passwordResetTokenExpiresAt: null,
          updatedAt: new Date(),
        },
      },
      { new: true },
    ).exec();

    return mapMongoUser(user);
  }

  async updateUser(id, patch) {
    const user = await this.UserModel.findByIdAndUpdate(
      id,
      {
        $set: {
          ...patch,
          updatedAt: new Date(),
        },
      },
      { new: true },
    ).exec();

    return mapMongoUser(user);
  }
}

module.exports = { MongoAuthRepository };
