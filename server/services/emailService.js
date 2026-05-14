let nodemailer = null;
try {
  // eslint-disable-next-line global-require
  nodemailer = require('nodemailer');
} catch (_error) {
  nodemailer = null;
}

class EmailService {
  constructor(config = {}) {
    this.config = {
      smtpHost: config.smtpHost ?? '',
      smtpPort: Number(config.smtpPort ?? 587),
      smtpSecure: config.smtpSecure === true,
      smtpUser: config.smtpUser ?? '',
      smtpPass: config.smtpPass ?? '',
      resendApiKey: config.resendApiKey ?? '',
      from: config.from ?? 'noreply@localhost',
      appBaseUrl: config.appBaseUrl ?? 'http://localhost:5173',
      contactTo: config.contactTo ?? '',
    };

    this.smtpReady = Boolean(
      nodemailer && this.config.smtpHost && this.config.smtpUser && this.config.smtpPass,
    );

    this.resendReady = Boolean(this.config.resendApiKey && this.config.from);

    this.deliveryReady = this.resendReady || this.smtpReady;

    this.transporter = this.smtpReady
      ? nodemailer.createTransport({
          host: this.config.smtpHost,
          port: this.config.smtpPort,
          secure: this.config.smtpSecure,
          auth: {
            user: this.config.smtpUser,
            pass: this.config.smtpPass,
          },
        })
      : null;
  }

  isDeliveryReady() {
    return this.deliveryReady;
  }

  getDeliveryMode() {
    if (this.resendReady) return 'resend';
    if (this.smtpReady) return 'smtp';
    return 'dev-fallback';
  }

  buildVerificationUrl(token) {
    return `${this.config.appBaseUrl.replace(/\/$/, '')}/#account?verifyToken=${encodeURIComponent(token)}`;
  }

  buildPasswordResetUrl(token) {
    return `${this.config.appBaseUrl.replace(/\/$/, '')}/#reset-password?token=${encodeURIComponent(token)}`;
  }

  async sendMail({ to, subject, text, replyTo }) {
    if (this.resendReady) {
      const response = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.config.resendApiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: this.config.from,
          to: [to],
          subject,
          text,
          reply_to: replyTo || undefined,
        }),
      });

      if (!response.ok) {
        const payload = await response.text().catch(() => '');
        const error = new Error(`Resend delivery failed (${response.status})`);
        error.details = payload;
        throw error;
      }

      return { delivered: true, mode: 'resend' };
    }

    if (this.smtpReady && this.transporter) {
      await this.transporter.sendMail({
        from: this.config.from,
        to,
        subject,
        text,
        replyTo: replyTo || undefined,
      });
      return { delivered: true, mode: 'smtp' };
    }

    return { delivered: false, mode: 'dev' };
  }

  async sendVerificationEmail({ to, name, token, expiresAt }) {
    const verifyUrl = this.buildVerificationUrl(token);
    const subject = 'Verify your email';
    const text = [
      `Hi ${name || 'there'},`,
      'Please verify your account email by clicking the link below:',
      verifyUrl,
      `This link expires on ${new Date(expiresAt).toISOString()}.`,
    ].join('\n');

    const result = await this.sendMail({ to, subject, text });
    if (!result.delivered) {
      return { delivered: false, mode: 'dev', previewUrl: verifyUrl };
    }

    return result;
  }

  async sendPasswordResetEmail({ to, name, token, expiresAt }) {
    const resetUrl = this.buildPasswordResetUrl(token);
    const subject = 'Password reset request';
    const text = [
      `Hi ${name || 'there'},`,
      'We received a request to reset your password.',
      'Use the link below to set a new password:',
      resetUrl,
      `This link expires on ${new Date(expiresAt).toISOString()}.`,
      'If you did not request this change, you can ignore this email.',
    ].join('\n');

    const result = await this.sendMail({ to, subject, text });
    if (!result.delivered) {
      return { delivered: false, mode: 'dev', previewUrl: resetUrl };
    }

    return result;
  }

  async sendContactEmail({ name, email, phone, subject, message, source = 'website', contextSlug = '', contextLabel = '' }) {
    const to = this.config.contactTo;
    if (!to) {
      throw new Error('CONTACT_TO_EMAIL is not configured.');
    }

    const safePhone = `${phone || ''}`.trim() || 'not provided';
    const composedSubject = `[Contact] ${subject}`;
    const text = [
      'New contact form submission',
      `Source: ${source}`,
      `Name: ${name}`,
      `Email: ${email}`,
      `Phone: ${safePhone}`,
      `Context slug: ${contextSlug || 'n/a'}`,
      `Context label: ${contextLabel || 'n/a'}`,
      '',
      'Message:',
      message,
    ].join('\n');

    return this.sendMail({
      to,
      subject: composedSubject,
      text,
      replyTo: email,
    });
  }
}

module.exports = { EmailService };
