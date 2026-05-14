const crypto = require('crypto');
const { normalizeEmail, normalizeUserInput } = require('../models/User');

const users = new Map();

class MemoryAuthRepository {
  async create(input) {
    const user = normalizeUserInput({ ...input, id: crypto.randomUUID() });
    users.set(user.id, user);
    return { ...user };
  }

  async findByEmailWithPassword(email) {
    const normalized = normalizeEmail(email);
    for (const user of users.values()) {
      if (user.email === normalized) return { ...user };
    }
    return null;
  }

  async findByEmail(email) {
    return this.findByEmailWithPassword(email);
  }

  async findByProvider(authProvider, providerId) {
    const providerIdText = String(providerId);
    for (const user of users.values()) {
      if (authProvider === 'google' && user.googleId === providerIdText) return { ...user };
      if (authProvider === 'facebook' && user.facebookId === providerIdText) return { ...user };
      if (user.authProvider === authProvider && user.providerId === providerIdText) return { ...user };
    }
    return null;
  }

  async findByEmailVerificationTokenHash(tokenHash) {
    for (const user of users.values()) {
      if (user.emailVerificationTokenHash === String(tokenHash)) return { ...user };
    }
    return null;
  }

  async findByPasswordResetTokenHash(tokenHash) {
    for (const user of users.values()) {
      if (user.passwordResetTokenHash === String(tokenHash)) return { ...user };
    }
    return null;
  }

  async linkOAuthProvider(id, { authProvider, providerId, name, emailVerified = true, avatarUrl = null }) {
    const user = users.get(String(id));
    if (!user) return null;
    const next = {
      ...user,
      providerId: String(providerId),
      name: name || user.name,
      avatarUrl: avatarUrl || user.avatarUrl || null,
      emailVerified,
      emailVerificationTokenHash: null,
      emailVerificationTokenExpiresAt: null,
      providers: Array.from(new Set([...(user.providers ?? [user.authProvider ?? 'local']), authProvider])),
      updatedAt: new Date(),
    };

    if (authProvider === 'google') next.googleId = String(providerId);
    if (authProvider === 'facebook') next.facebookId = String(providerId);

    const normalized = normalizeUserInput({ ...next, id: user.id });
    users.set(user.id, normalized);
    return { ...normalized };
  }

  async findById(id) {
    const user = users.get(String(id));
    return user ? { ...user } : null;
  }

  async listUsers() {
    return Array.from(users.values()).map((user) => ({ ...user }));
  }

  async existsByEmail(email) {
    const normalized = normalizeEmail(email);
    for (const user of users.values()) {
      if (user.email === normalized) return true;
    }
    return false;
  }

  async updateLastLoginAt(id, date) {
    const user = users.get(String(id));
    if (!user) return null;
    user.lastLoginAt = date;
    user.updatedAt = new Date();
    users.set(user.id, user);
    return { ...user };
  }

  async setEmailVerificationToken(id, { tokenHash, expiresAt }) {
    const user = users.get(String(id));
    if (!user) return null;
    user.emailVerificationTokenHash = String(tokenHash);
    user.emailVerificationTokenExpiresAt = expiresAt;
    user.updatedAt = new Date();
    users.set(user.id, user);
    return { ...user };
  }

  async markEmailVerified(id) {
    const user = users.get(String(id));
    if (!user) return null;
    user.emailVerified = true;
    user.emailVerificationTokenHash = null;
    user.emailVerificationTokenExpiresAt = null;
    user.updatedAt = new Date();
    users.set(user.id, user);
    return { ...user };
  }


  async setPasswordResetToken(id, { tokenHash, expiresAt }) {
    const user = users.get(String(id));
    if (!user) return null;
    user.passwordResetTokenHash = String(tokenHash);
    user.passwordResetTokenExpiresAt = expiresAt;
    user.updatedAt = new Date();
    users.set(user.id, user);
    return { ...user };
  }

  async resetPasswordByToken(id, { passwordHash }) {
    const user = users.get(String(id));
    if (!user) return null;
    user.passwordHash = passwordHash;
    user.passwordResetTokenHash = null;
    user.passwordResetTokenExpiresAt = null;
    user.updatedAt = new Date();
    users.set(user.id, user);
    return { ...user };
  }


  async updateUser(id, patch) {
    const user = users.get(String(id));
    if (!user) return null;
    const updated = normalizeUserInput({ ...user, ...patch, id: user.id, updatedAt: new Date() });
    users.set(user.id, updated);
    return { ...updated };
  }
}

module.exports = { MemoryAuthRepository };
