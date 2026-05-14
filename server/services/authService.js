const crypto = require('crypto');
const { normalizeEmail } = require('../models/User');
const {
  PASSWORD_HASH_ROUNDS,
  OAUTH_DEFAULT_ROLE,
  PUBLIC_REGISTRATION_ENABLED,
  ENABLE_EMAIL_PASSWORD_AUTH,
  isProduction,
  GOOGLE_CLIENT_ID,
  GOOGLE_CLIENT_SECRET,
  GOOGLE_CALLBACK_URL,
  FACEBOOK_APP_ID,
  FACEBOOK_APP_SECRET,
  FACEBOOK_CALLBACK_URL,
} = require('../config/env');

const EMAIL_VERIFICATION_TOKEN_TTL_MS = 1000 * 60 * 60 * 24;
const PASSWORD_RESET_TOKEN_TTL_MS = 1000 * 60 * 30;

let bcryptLib = null;
try {
  // eslint-disable-next-line global-require
  bcryptLib = require('bcryptjs');
} catch (_error) {
  bcryptLib = null;
}

async function hashPassword(password) {
  if (bcryptLib) {
    return bcryptLib.hash(password, PASSWORD_HASH_ROUNDS);
  }

  if (isProduction) {
    throw new Error('bcryptjs dependency is required in production for password hashing.');
  }

  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

async function verifyPassword(password, storedHash) {
  if (bcryptLib) {
    return bcryptLib.compare(password, storedHash);
  }

  if (isProduction) {
    throw new Error('bcryptjs dependency is required in production for password verification.');
  }

  const [salt, hash] = String(storedHash).split(':');
  if (!salt || !hash) return false;
  const compare = crypto.scryptSync(password, salt, 64).toString('hex');
  return crypto.timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(compare, 'hex'));
}

function hashVerificationToken(token) {
  return crypto.createHash('sha256').update(String(token)).digest('hex');
}

function createEmailVerificationToken() {
  const token = crypto.randomBytes(32).toString('hex');
  return {
    token,
    tokenHash: hashVerificationToken(token),
    expiresAt: new Date(Date.now() + EMAIL_VERIFICATION_TOKEN_TTL_MS),
  };
}

function createPasswordResetToken() {
  const token = crypto.randomBytes(32).toString('hex');
  return {
    token,
    tokenHash: hashVerificationToken(token),
    expiresAt: new Date(Date.now() + PASSWORD_RESET_TOKEN_TTL_MS),
  };
}

function buildVerificationMeta(user) {
  const expiresAt = user.emailVerificationTokenExpiresAt ?? null;
  const pending = !user.emailVerified && !!user.emailVerificationTokenHash && (!expiresAt || new Date(expiresAt) > new Date());
  return {
    emailVerified: Boolean(user.emailVerified),
    verificationPending: pending,
    verificationMethod: user.authProvider === 'local' ? 'email_token' : 'provider_trust',
  };
}



function sanitizeUser(user) {
  if (!user) return null;
  return {
    id: String(user.id),
    email: user.email,
    name: user.name,
    role: user.role,
    status: user.status,
    accountStatus: user.accountStatus ?? 'active',
    organizationId: user.organizationId ?? 'org_default',
    planTier: user.planTier ?? 'free',
    featureFlags: Array.isArray(user.featureFlags) ? user.featureFlags : [],
    authProvider: user.authProvider ?? 'local',
    providers: user.providers ?? [user.authProvider ?? 'local'],
    providerId: user.providerId ?? null,
    avatarUrl: user.avatarUrl ?? null,
    ...buildVerificationMeta(user),
    lastLoginAt: user.lastLoginAt ?? null,
    lastActivityAt: user.lastActivityAt ?? user.lastLoginAt ?? null,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };
}

class AuthService {
  constructor({
    userRepository,
    oauthProviders = {},
    publicRegistrationEnabled = PUBLIC_REGISTRATION_ENABLED,
    emailPasswordAuthEnabled = ENABLE_EMAIL_PASSWORD_AUTH,
    emailService = null,
    auditLogger = null,
  }) {
    this.userRepository = userRepository;
    this.oauthProviders = oauthProviders;
    this.publicRegistrationEnabled = Boolean(publicRegistrationEnabled);
    this.emailPasswordAuthEnabled = Boolean(emailPasswordAuthEnabled);
    this.emailService = emailService;
    this.auditLogger = auditLogger;
  }

  buildOAuthAuthorizationUrl({ provider, state }) {
    if (!['google', 'facebook'].includes(provider)) {
      return { ok: false, status: 400, code: 'OAUTH_PROVIDER_UNSUPPORTED', message: 'Unsupported OAuth provider' };
    }

    const providerConfig = this.oauthProviders?.[provider] ?? {};
    if (!providerConfig.enabled) {
      return { ok: false, status: 503, code: 'OAUTH_PROVIDER_DISABLED', message: `${provider} OAuth is not configured` };
    }

    if (provider === 'google') {
      const params = new URLSearchParams({
        client_id: GOOGLE_CLIENT_ID,
        redirect_uri: GOOGLE_CALLBACK_URL,
        response_type: 'code',
        scope: 'openid email profile',
        state,
        access_type: 'online',
        include_granted_scopes: 'true',
        prompt: 'select_account',
      });
      return { ok: true, url: `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}` };
    }

    const params = new URLSearchParams({
      client_id: FACEBOOK_APP_ID,
      redirect_uri: FACEBOOK_CALLBACK_URL,
      response_type: 'code',
      scope: 'email,public_profile',
      state,
    });
    return { ok: true, url: `https://www.facebook.com/v20.0/dialog/oauth?${params.toString()}` };
  }

  async exchangeGoogleCodeForProfile(code) {
    const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: GOOGLE_CLIENT_ID,
        client_secret: GOOGLE_CLIENT_SECRET,
        redirect_uri: GOOGLE_CALLBACK_URL,
        grant_type: 'authorization_code',
      }),
    });

    if (!tokenResponse.ok) {
      return { ok: false, status: 502, code: 'OAUTH_TOKEN_EXCHANGE_FAILED', message: 'Failed to exchange Google authorization code' };
    }

    const tokenPayload = await tokenResponse.json();
    if (!tokenPayload.access_token) {
      return { ok: false, status: 502, code: 'OAUTH_TOKEN_EXCHANGE_FAILED', message: 'Google access token missing' };
    }

    const profileResponse = await fetch('https://openidconnect.googleapis.com/v1/userinfo', {
      headers: { Authorization: `Bearer ${tokenPayload.access_token}` },
    });

    if (!profileResponse.ok) {
      return { ok: false, status: 502, code: 'OAUTH_PROFILE_FETCH_FAILED', message: 'Failed to fetch Google profile' };
    }

    const profile = await profileResponse.json();
    return {
      ok: true,
      profile: {
        authProvider: 'google',
        providerId: String(profile.sub ?? ''),
        email: profile.email ? String(profile.email) : null,
        name: String(profile.name ?? profile.given_name ?? 'Google User').trim(),
        emailVerified: Boolean(profile.email_verified),
        avatarUrl: profile.picture ? String(profile.picture) : null,
      },
    };
  }

  async exchangeFacebookCodeForProfile(code) {
    const tokenParams = new URLSearchParams({
      client_id: FACEBOOK_APP_ID,
      client_secret: FACEBOOK_APP_SECRET,
      redirect_uri: FACEBOOK_CALLBACK_URL,
      code,
    });

    const tokenResponse = await fetch(`https://graph.facebook.com/v20.0/oauth/access_token?${tokenParams.toString()}`);
    if (!tokenResponse.ok) {
      return { ok: false, status: 502, code: 'OAUTH_TOKEN_EXCHANGE_FAILED', message: 'Failed to exchange Facebook authorization code' };
    }

    const tokenPayload = await tokenResponse.json();
    if (!tokenPayload.access_token) {
      return { ok: false, status: 502, code: 'OAUTH_TOKEN_EXCHANGE_FAILED', message: 'Facebook access token missing' };
    }

    const profileParams = new URLSearchParams({
      fields: 'id,name,email,picture.type(large)',
      access_token: tokenPayload.access_token,
    });

    const profileResponse = await fetch(`https://graph.facebook.com/me?${profileParams.toString()}`);
    if (!profileResponse.ok) {
      return { ok: false, status: 502, code: 'OAUTH_PROFILE_FETCH_FAILED', message: 'Failed to fetch Facebook profile' };
    }

    const profile = await profileResponse.json();
    return {
      ok: true,
      profile: {
        authProvider: 'facebook',
        providerId: String(profile.id ?? ''),
        email: profile.email ? String(profile.email) : null,
        name: String(profile.name ?? 'Facebook User').trim(),
        emailVerified: Boolean(profile.email),
        avatarUrl: profile.picture?.data?.url ? String(profile.picture.data.url) : null,
      },
    };
  }

  async loginWithOAuthCode({ provider, code }) {
    if (!['google', 'facebook'].includes(provider)) {
      return { ok: false, status: 400, code: 'OAUTH_PROVIDER_UNSUPPORTED', message: 'Unsupported OAuth provider' };
    }

    const providerConfig = this.oauthProviders?.[provider] ?? {};
    if (!providerConfig.enabled) {
      return { ok: false, status: 403, code: 'OAUTH_PROVIDER_DISABLED', message: `${provider} OAuth login is disabled` };
    }

    if (!code || typeof code !== 'string') {
      return { ok: false, status: 400, code: 'OAUTH_CODE_MISSING', message: 'Missing OAuth authorization code' };
    }

    const exchanged = provider === 'google'
      ? await this.exchangeGoogleCodeForProfile(code)
      : await this.exchangeFacebookCodeForProfile(code);

    if (!exchanged.ok) {
      return exchanged;
    }

    return this.loginWithOAuthProfile(exchanged.profile);
  }

  async loginWithOAuthProfile({ email, name, authProvider, providerId, emailVerified = true, avatarUrl = null }) {
    const normalizedEmail = normalizeEmail(email);
    if (!providerId || !['google', 'facebook'].includes(authProvider)) {
      return { ok: false, status: 400, code: 'OAUTH_PROFILE_INVALID', message: 'Invalid OAuth profile' };
    }

    const existingByProvider = await this.userRepository.findByProvider(authProvider, providerId);
    if (existingByProvider) {
      if (existingByProvider.accountStatus === 'suspended') {
        return { ok: false, status: 403, code: 'ACCOUNT_SUSPENDED', message: 'Account suspended' };
      }
      const linked = await this.userRepository.linkOAuthProvider(existingByProvider.id, {
        authProvider,
        providerId,
        name: String(name ?? existingByProvider.name).trim(),
        emailVerified,
        avatarUrl,
      });
      const updatedUser = await this.userRepository.updateLastLoginAt(existingByProvider.id, new Date());
      return { ok: true, user: sanitizeUser(updatedUser ?? linked ?? existingByProvider) };
    }

    if (!normalizedEmail) {
      return { ok: false, status: 409, code: 'OAUTH_EMAIL_REQUIRED', message: 'Unable to sign in: provider did not return an email address' };
    }

    const existingByEmail = await this.userRepository.findByEmail(normalizedEmail);
    if (existingByEmail) {
      if (existingByEmail.accountStatus === 'suspended') {
        return { ok: false, status: 403, code: 'ACCOUNT_SUSPENDED', message: 'Account suspended' };
      }

      const hasProviderLinked = authProvider === 'google' ? Boolean(existingByEmail.googleId) : Boolean(existingByEmail.facebookId);
      if (hasProviderLinked) {
        return { ok: false, status: 409, code: 'OAUTH_ACCOUNT_CONFLICT', message: 'OAuth provider is already linked to another account' };
      }

      const linked = await this.userRepository.linkOAuthProvider(existingByEmail.id, {
        authProvider,
        providerId,
        name: String(name ?? existingByEmail.name).trim(),
        emailVerified,
        avatarUrl,
      });
      const updatedUser = await this.userRepository.updateLastLoginAt(existingByEmail.id, new Date());
      return { ok: true, user: sanitizeUser(updatedUser ?? linked ?? existingByEmail) };
    }

    let user;
    try {
      user = await this.userRepository.create({
        email: normalizedEmail,
        name: String(name ?? normalizedEmail.split('@')[0]).trim(),
        authProvider,
        providerId: String(providerId),
        providers: [authProvider],
        googleId: authProvider === 'google' ? String(providerId) : null,
        facebookId: authProvider === 'facebook' ? String(providerId) : null,
        avatarUrl,
        role: OAUTH_DEFAULT_ROLE,
        status: 'client',
        accountStatus: 'active',
        emailVerified,
        emailVerificationTokenHash: null,
        emailVerificationTokenExpiresAt: null,
        organizationId: 'org_default',
        planTier: 'free',
        featureFlags: [],
      });
    } catch (error) {
      if (error?.code === 11000) {
        const recoveredByProvider = await this.userRepository.findByProvider(authProvider, providerId);
        if (recoveredByProvider) {
          const updatedUser = await this.userRepository.updateLastLoginAt(recoveredByProvider.id, new Date());
          return { ok: true, user: sanitizeUser(updatedUser ?? recoveredByProvider) };
        }

        if (normalizedEmail) {
          const recoveredByEmail = await this.userRepository.findByEmail(normalizedEmail);
          if (recoveredByEmail) {
            const linked = await this.userRepository.linkOAuthProvider(recoveredByEmail.id, {
              authProvider,
              providerId,
              name: String(name ?? recoveredByEmail.name).trim(),
              emailVerified,
              avatarUrl,
            });
            const updatedUser = await this.userRepository.updateLastLoginAt(recoveredByEmail.id, new Date());
            return { ok: true, user: sanitizeUser(updatedUser ?? linked ?? recoveredByEmail) };
          }
        }

        return {
          ok: false,
          status: 409,
          code: 'OAUTH_ACCOUNT_CONFLICT',
          message: 'OAuth account conflict detected',
        };
      }
      throw error;
    }

    const updatedUser = await this.userRepository.updateLastLoginAt(user.id, new Date());
    return { ok: true, user: sanitizeUser(updatedUser ?? user) };
  }

  async seedAdminFromEnv({ email, password, name }) {
    const normalizedEmail = normalizeEmail(email);
    if (!normalizedEmail || !password) {
      return { ok: false, reason: 'missing_config' };
    }

    const existing = await this.userRepository.findByEmailWithPassword(normalizedEmail);
    if (existing) {
      const patch = {
        role: 'admin',
        status: 'staff',
        accountStatus: 'active',
        emailVerified: true,
        authProvider: existing.authProvider === 'google' || existing.authProvider === 'facebook' ? existing.authProvider : 'local',
        providers: Array.from(new Set([...(existing.providers ?? [existing.authProvider ?? 'local']), 'local'])),
      };

      if (!existing.passwordHash) {
        patch.passwordHash = await hashPassword(String(password));
      }

      const updated = await this.userRepository.updateUser(existing.id, patch);
      return { ok: true, created: false, repaired: true, user: sanitizeUser(updated ?? existing) };
    }

    const passwordHash = await hashPassword(String(password));
    const user = await this.userRepository.create({
      email: normalizedEmail,
      name: String(name ?? 'Administrator').trim() || 'Administrator',
      passwordHash,
      role: 'admin',
      status: 'staff',
      accountStatus: 'active',
      authProvider: 'local',
      providers: ['local'],
      providerId: null,
      emailVerified: true,
      emailVerificationTokenHash: null,
      emailVerificationTokenExpiresAt: null,
      organizationId: 'org_default',
      planTier: 'enterprise',
      featureFlags: ['analytics:advanced', 'users:manage', 'billing:hooks'],
    });

    return { ok: true, created: true, user: sanitizeUser(user) };
  }

  async register(payload) {
    if (!this.emailPasswordAuthEnabled) {
      return { ok: false, status: 403, code: 'EMAIL_PASSWORD_AUTH_DISABLED', message: 'Email/password authentication is disabled' };
    }

    if (!this.publicRegistrationEnabled) {
      return { ok: false, status: 403, code: 'REGISTRATION_DISABLED', message: 'Public registration is disabled' };
    }

    const email = normalizeEmail(payload.email);
    const name = String(payload.name ?? '').trim();
    const password = String(payload.password ?? '');

    if (!email || !name || !password) {
      return { ok: false, status: 400, code: 'VALIDATION_ERROR', message: 'name, email and password are required' };
    }

    if (password.length < 8) {
      return { ok: false, status: 400, code: 'VALIDATION_ERROR', message: 'password must be at least 8 characters' };
    }

    const exists = await this.userRepository.existsByEmail(email);
    if (exists) {
      return { ok: false, status: 409, code: 'EMAIL_ALREADY_EXISTS', message: 'An account already exists with this email' };
    }

    const passwordHash = await hashPassword(password);
    const verification = createEmailVerificationToken();

    let user;
    try {
      user = await this.userRepository.create({
        email,
        name,
        passwordHash,
        role: 'client',
        status: 'client',
        accountStatus: 'active',
        authProvider: 'local',
        providers: ['local'],
        providerId: null,
        emailVerified: false,
        emailVerificationTokenHash: verification.tokenHash,
        emailVerificationTokenExpiresAt: verification.expiresAt,
        organizationId: 'org_default',
        planTier: 'free',
        featureFlags: [],
      });
    } catch (error) {
      if (error?.code === 11000) {
        return { ok: false, status: 409, code: 'EMAIL_ALREADY_EXISTS', message: 'An account already exists with this email' };
      }
      throw error;
    }

    const delivery = await this.emailService?.sendVerificationEmail?.({
      to: email,
      name,
      token: verification.token,
      expiresAt: verification.expiresAt,
    });

    return {
      ok: true,
      user: sanitizeUser(user),
      verification: {
        emailDeliveryReady: Boolean(delivery?.delivered),
        expiresAt: verification.expiresAt,
        ...(delivery?.delivered ? {} : { devToken: verification.token, devPreviewUrl: delivery?.previewUrl ?? null }),
      },
    };
  }

  async login(payload) {
    if (!this.emailPasswordAuthEnabled) {
      return { ok: false, status: 403, code: 'EMAIL_PASSWORD_AUTH_DISABLED', message: 'Email/password authentication is disabled' };
    }

    const email = normalizeEmail(payload.email);
    const password = String(payload.password ?? '');

    if (!email || !password) {
      return { ok: false, status: 400, code: 'VALIDATION_ERROR', message: 'email and password are required' };
    }

    const user = await this.userRepository.findByEmailWithPassword(email);
    if (!user) {
      return { ok: false, status: 401, code: 'INVALID_CREDENTIALS', message: 'Invalid credentials', reason: 'email_not_found' };
    }

    if (!user.providers?.includes('local') || !user.passwordHash) {
      return { ok: false, status: 401, code: 'INVALID_CREDENTIALS', message: 'Invalid credentials', reason: 'local_password_missing' };
    }

    const isValidPassword = await verifyPassword(password, user.passwordHash);
    if (!isValidPassword) {
      return { ok: false, status: 401, code: 'INVALID_CREDENTIALS', message: 'Invalid credentials', reason: 'password_mismatch' };
    }

    if (user.accountStatus === 'suspended') {
      return { ok: false, status: 403, code: 'ACCOUNT_SUSPENDED', message: 'Account suspended' };
    }

    const updatedUser = await this.userRepository.updateLastLoginAt(user.id, new Date());
    return { ok: true, user: sanitizeUser(updatedUser ?? user) };
  }

  async loginWithOAuth(params) {
    return this.loginWithOAuthProfile(params);
  }

  async resendVerification({ userId }) {
    const user = await this.userRepository.findById(userId);
    if (!user) {
      return { ok: false, status: 404, code: 'USER_NOT_FOUND', message: 'User not found' };
    }

    if (user.emailVerified) {
      return { ok: false, status: 409, code: 'EMAIL_ALREADY_VERIFIED', message: 'Email already verified' };
    }

    const verification = createEmailVerificationToken();
    const updated = await this.userRepository.setEmailVerificationToken(user.id, {
      tokenHash: verification.tokenHash,
      expiresAt: verification.expiresAt,
    });

    const delivery = await this.emailService?.sendVerificationEmail?.({
      to: user.email,
      name: user.name,
      token: verification.token,
      expiresAt: verification.expiresAt,
    });

    return {
      ok: true,
      user: sanitizeUser(updated ?? user),
      verification: {
        emailDeliveryReady: Boolean(delivery?.delivered),
        expiresAt: verification.expiresAt,
        ...(delivery?.delivered ? {} : { devToken: verification.token, devPreviewUrl: delivery?.previewUrl ?? null }),
      },
    };
  }

  async verifyEmailToken({ token }) {
    const tokenHash = hashVerificationToken(token);
    const user = await this.userRepository.findByEmailVerificationTokenHash(tokenHash);
    if (!user) {
      return { ok: false, status: 400, code: 'INVALID_VERIFICATION_TOKEN', message: 'Verification token is invalid' };
    }

    if (user.emailVerified) {
      return { ok: false, status: 409, code: 'EMAIL_ALREADY_VERIFIED', message: 'Email already verified' };
    }

    if (!user.emailVerificationTokenExpiresAt || new Date(user.emailVerificationTokenExpiresAt) < new Date()) {
      return { ok: false, status: 400, code: 'VERIFICATION_TOKEN_EXPIRED', message: 'Verification token is expired' };
    }

    const updated = await this.userRepository.markEmailVerified(user.id);
    return { ok: true, user: sanitizeUser(updated ?? user) };
  }

  async listUsersForAdmin() {
    const users = await this.userRepository.listUsers();
    return users.map((user) => sanitizeUser(user));
  }

  async updateUserByAdmin(targetUserId, payload, actor) {
    const user = await this.userRepository.findById(targetUserId);
    if (!user) {
      return { ok: false, status: 404, code: 'USER_NOT_FOUND', message: 'User not found' };
    }

    const patch = {};

    if (typeof payload.accountStatus === 'string') {
      if (!['active', 'invited', 'suspended'].includes(payload.accountStatus)) {
        return { ok: false, status: 400, code: 'VALIDATION_ERROR', message: 'Invalid account status' };
      }
      patch.accountStatus = payload.accountStatus;
    }

    if (typeof payload.role === 'string') {
      if (actor?.role !== 'admin') {
        return { ok: false, status: 403, code: 'FORBIDDEN_ROLE_CHANGE', message: 'Only admins can change roles' };
      }
      if (!['admin', 'editor', 'author', 'viewer', 'client'].includes(payload.role)) {
        return { ok: false, status: 400, code: 'VALIDATION_ERROR', message: 'Invalid role' };
      }
      if (String(actor?.id) === String(user.id) && payload.role !== user.role) {
        return { ok: false, status: 400, code: 'ADMIN_SELF_ROLE_CHANGE_FORBIDDEN', message: 'Cannot change own role' };
      }
      patch.role = payload.role;
      patch.status = ['admin', 'editor', 'author', 'viewer'].includes(payload.role) ? 'staff' : 'client';
    }

    if (typeof payload.emailVerified === 'boolean') {
      patch.emailVerified = payload.emailVerified;
      if (payload.emailVerified) {
        patch.emailVerificationTokenHash = null;
        patch.emailVerificationTokenExpiresAt = null;
      }
    }

    if (typeof payload.organizationId === 'string' && actor?.role === 'admin') {
      const normalizedOrg = payload.organizationId.trim().toLowerCase();
      if (!normalizedOrg) {
        return { ok: false, status: 400, code: 'VALIDATION_ERROR', message: 'Invalid organization id' };
      }
      patch.organizationId = normalizedOrg;
    }

    if (typeof payload.planTier === 'string') {
      if (actor?.role !== 'admin') {
        return { ok: false, status: 403, code: 'FORBIDDEN_PLAN_CHANGE', message: 'Only admins can change plan tier' };
      }
      if (!['free', 'pro', 'enterprise'].includes(payload.planTier)) {
        return { ok: false, status: 400, code: 'VALIDATION_ERROR', message: 'Invalid plan tier' };
      }
      patch.planTier = payload.planTier;
    }

    if (payload.featureFlags !== undefined) {
      if (actor?.role !== 'admin') {
        return { ok: false, status: 403, code: 'FORBIDDEN_FEATURE_FLAGS_CHANGE', message: 'Only admins can change feature flags' };
      }
      if (!Array.isArray(payload.featureFlags) || payload.featureFlags.some((entry) => typeof entry !== 'string')) {
        return { ok: false, status: 400, code: 'VALIDATION_ERROR', message: 'featureFlags must be an array of strings' };
      }
      patch.featureFlags = Array.from(new Set(payload.featureFlags.map((entry) => entry.trim()).filter(Boolean)));
    }

    if (patch.accountStatus === 'suspended' && String(actor?.id) === String(user.id)) {
      return { ok: false, status: 400, code: 'ADMIN_SELF_SUSPEND_FORBIDDEN', message: 'Cannot suspend own account' };
    }

    if (Object.keys(patch).length === 0) {
      return { ok: false, status: 400, code: 'VALIDATION_ERROR', message: 'No valid fields to update' };
    }

    const updated = await this.userRepository.updateUser(user.id, patch);
    return { ok: true, user: sanitizeUser(updated ?? user) };
  }


  async requestPasswordReset({ email }) {
    const emailDeliveryReady = Boolean(this.emailService?.isDeliveryReady?.());
    if (!emailDeliveryReady) {
      return {
        ok: false,
        status: 503,
        code: 'EMAIL_DELIVERY_NOT_CONFIGURED',
        message: 'Password reset email delivery is not configured.',
      };
    }

    const normalizedEmail = normalizeEmail(email);
    if (!normalizedEmail) {
      return { ok: true, emailDeliveryReady };
    }

    const user = await this.userRepository.findByEmailWithPassword(normalizedEmail);
    if (!user || !user.providers?.includes('local')) {
      return { ok: true, emailDeliveryReady };
    }

    const reset = createPasswordResetToken();
    await this.userRepository.setPasswordResetToken(user.id, { tokenHash: reset.tokenHash, expiresAt: reset.expiresAt });

    const delivery = await this.emailService.sendPasswordResetEmail({
      to: user.email,
      name: user.name,
      token: reset.token,
      expiresAt: reset.expiresAt,
    });

    if (!delivery?.delivered) {
      return {
        ok: false,
        status: 502,
        code: 'EMAIL_DELIVERY_FAILED',
        message: 'Password reset email could not be sent.',
      };
    }

    return {
      ok: true,
      emailDeliveryReady: true,
      expiresAt: reset.expiresAt,
    };
  }

  async resetPasswordWithToken({ token, password }) {
    if (!token || typeof token !== 'string') {
      return { ok: false, status: 400, code: 'INVALID_RESET_TOKEN', message: 'Invalid reset token' };
    }

    const nextPassword = String(password ?? '');
    if (nextPassword.length < 8) {
      return { ok: false, status: 400, code: 'VALIDATION_ERROR', message: 'password must be at least 8 characters' };
    }

    const tokenHash = hashVerificationToken(token);
    const user = await this.userRepository.findByPasswordResetTokenHash(tokenHash);
    if (!user) {
      return { ok: false, status: 400, code: 'INVALID_RESET_TOKEN', message: 'Invalid reset token' };
    }

    if (!user.passwordResetTokenExpiresAt || new Date(user.passwordResetTokenExpiresAt) < new Date()) {
      return { ok: false, status: 400, code: 'RESET_TOKEN_EXPIRED', message: 'Password reset token expired' };
    }

    const passwordHash = await hashPassword(nextPassword);
    const updated = await this.userRepository.resetPasswordByToken(user.id, { passwordHash });

    return { ok: true, user: sanitizeUser(updated ?? user) };
  }

  getOAuthProviders() {
    return this.oauthProviders;
  }

  async getSessionUser(sessionUserId) {
    if (!sessionUserId) return null;
    const user = await this.userRepository.findById(sessionUserId);
    if (!user || user.accountStatus === 'suspended') {
      return null;
    }
    return sanitizeUser(user);
  }
}

module.exports = {
  AuthService,
  sanitizeUser,
  hashPassword,
  verifyPassword,
  hashVerificationToken,
  createEmailVerificationToken,
  createPasswordResetToken,
};
