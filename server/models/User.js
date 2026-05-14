const USER_ROLES = ['admin', 'editor', 'author', 'viewer', 'client'];
const USER_STATUSES = ['client', 'staff'];
const ACCOUNT_STATUSES = ['active', 'invited', 'suspended'];
const AUTH_PROVIDERS = ['local', 'google', 'facebook'];
const PLAN_TIERS = ['free', 'pro', 'enterprise'];

function normalizeOrganizationId(value) {
  const normalized = String(value ?? '').trim().toLowerCase();
  return normalized || 'org_default';
}

function normalizeFeatureFlags(value) {
  if (!Array.isArray(value)) return [];
  return Array.from(
    new Set(
      value
        .map((entry) => String(entry ?? '').trim())
        .filter(Boolean),
    ),
  );
}

function normalizeEmail(email) {
  return String(email ?? '').trim().toLowerCase();
}

function normalizeProviders(inputProviders, fallbackProvider) {
  const providers = Array.isArray(inputProviders) ? inputProviders : [];
  const normalized = new Set(
    providers
      .map((provider) => String(provider ?? '').trim().toLowerCase())
      .filter((provider) => AUTH_PROVIDERS.includes(provider)),
  );

  if (AUTH_PROVIDERS.includes(fallbackProvider)) {
    normalized.add(fallbackProvider);
  }

  if (normalized.size === 0) {
    normalized.add('local');
  }

  return Array.from(normalized);
}

function normalizeUserInput(input) {
  const authProvider = AUTH_PROVIDERS.includes(input.authProvider) ? input.authProvider : 'local';
  const googleId = input.googleId ? String(input.googleId) : null;
  const facebookId = input.facebookId ? String(input.facebookId) : null;

  return {
    id: String(input.id),
    email: normalizeEmail(input.email),
    passwordHash: input.passwordHash ? String(input.passwordHash) : null,
    name: String(input.name ?? '').trim(),
    role: USER_ROLES.includes(input.role) ? input.role : 'client',
    status: USER_STATUSES.includes(input.status) ? input.status : 'client',
    accountStatus: ACCOUNT_STATUSES.includes(input.accountStatus)
      ? input.accountStatus
      : (ACCOUNT_STATUSES.includes(input.status) ? input.status : 'active'),
    authProvider,
    providerId: input.providerId ? String(input.providerId) : (googleId ?? facebookId ?? null),
    providers: normalizeProviders(input.providers, authProvider),
    googleId,
    facebookId,
    avatarUrl: input.avatarUrl ? String(input.avatarUrl) : null,
    emailVerified: Boolean(input.emailVerified),
    emailVerificationTokenHash: input.emailVerificationTokenHash ? String(input.emailVerificationTokenHash) : null,
    emailVerificationTokenExpiresAt: input.emailVerificationTokenExpiresAt ?? null,
    lastLoginAt: input.lastLoginAt ?? null,
    lastActivityAt: input.lastActivityAt ?? input.lastLoginAt ?? null,
    passwordResetTokenHash: input.passwordResetTokenHash ? String(input.passwordResetTokenHash) : null,
    passwordResetTokenExpiresAt: input.passwordResetTokenExpiresAt ?? null,
    organizationId: normalizeOrganizationId(input.organizationId),
    planTier: PLAN_TIERS.includes(input.planTier) ? input.planTier : 'free',
    featureFlags: normalizeFeatureFlags(input.featureFlags),
    createdAt: input.createdAt ?? new Date(),
    updatedAt: input.updatedAt ?? new Date(),
  };
}

function createUserModel(mongoose) {
  if (!mongoose) {
    throw new Error('mongoose instance is required to create User model');
  }

  if (mongoose.models.User) {
    return mongoose.models.User;
  }

  const schema = new mongoose.Schema(
    {
      email: {
        type: String,
        required: true,
        unique: true,
        lowercase: true,
        trim: true,
      },
      passwordHash: {
        type: String,
        default: null,
      },
      name: {
        type: String,
        required: true,
        trim: true,
      },
      role: {
        type: String,
        enum: USER_ROLES,
        default: 'client',
        index: true,
      },
      status: {
        type: String,
        enum: USER_STATUSES,
        default: 'client',
        index: true,
      },
      accountStatus: {
        type: String,
        enum: ACCOUNT_STATUSES,
        default: 'active',
        index: true,
      },
      authProvider: {
        type: String,
        enum: AUTH_PROVIDERS,
        default: 'local',
        index: true,
      },
      providerId: {
        type: String,
        default: null,
      },
      providers: {
        type: [String],
        enum: AUTH_PROVIDERS,
        default: ['local'],
      },
      googleId: {
        type: String,
        default: null,
        unique: true,
        sparse: true,
      },
      facebookId: {
        type: String,
        default: null,
        unique: true,
        sparse: true,
      },

      avatarUrl: {
        type: String,
        default: null,
      },
      emailVerified: {
        type: Boolean,
        default: false,
        index: true,
      },
      emailVerificationTokenHash: {
        type: String,
        default: null,
      },
      emailVerificationTokenExpiresAt: {
        type: Date,
        default: null,
      },
      lastLoginAt: {
        type: Date,
        default: null,
      },
      lastActivityAt: {
        type: Date,
        default: null,
      },
      passwordResetTokenHash: {
        type: String,
        default: null,
      },
      passwordResetTokenExpiresAt: {
        type: Date,
        default: null,
      },
      organizationId: {
        type: String,
        default: 'org_default',
        index: true,
      },
      planTier: {
        type: String,
        enum: PLAN_TIERS,
        default: 'free',
        index: true,
      },
      featureFlags: {
        type: [String],
        default: [],
      },
    },
    {
      timestamps: true,
      collection: 'users',
    },
  );

  schema.index({ authProvider: 1, providerId: 1 }, { unique: true, sparse: true });

  schema.pre('validate', function normalizeBeforeValidate(next) {
    if (this.email) {
      this.email = normalizeEmail(this.email);
    }
    if (this.name) {
      this.name = String(this.name).trim();
    }
    this.providers = normalizeProviders(this.providers, this.authProvider);
    if (this.googleId) this.googleId = String(this.googleId);
    if (this.facebookId) this.facebookId = String(this.facebookId);
    if (!this.providerId) {
      this.providerId = this.googleId ?? this.facebookId ?? null;
    }
    this.organizationId = normalizeOrganizationId(this.organizationId);
    this.featureFlags = normalizeFeatureFlags(this.featureFlags);
    next();
  });

  return mongoose.model('User', schema);
}

module.exports = {
  USER_ROLES,
  USER_STATUSES,
  ACCOUNT_STATUSES,
  AUTH_PROVIDERS,
  PLAN_TIERS,
  normalizeEmail,
  normalizeUserInput,
  normalizeOrganizationId,
  normalizeFeatureFlags,
  createUserModel,
};
