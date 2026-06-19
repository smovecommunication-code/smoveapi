const net = require('net');
const tls = require('tls');

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
      newsletterFrom: config.newsletterFrom ?? config.from ?? 'noreply@localhost',
      newsletterReplyTo: config.newsletterReplyTo ?? '',
      appBaseUrl: config.appBaseUrl ?? 'http://localhost:5173',
      contactTo: config.contactTo ?? '',
    };

    this.smtpReady = Boolean(
      this.config.smtpHost,
    );

    this.resendReady = Boolean(this.config.resendApiKey);

    this.deliveryReady = Boolean(this.config.contactTo && (this.resendReady || this.smtpReady));

    this.transporter = null;
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

  getProviderStatus() {
    return {
      deliveryReady: Boolean(this.resendReady || this.smtpReady),
      mode: this.getDeliveryMode(),
      activeProvider: this.getDeliveryMode(),
      resendConfigured: this.resendReady,
      smtpConfigured: this.smtpReady,
      resendReady: this.resendReady,
      smtpReady: this.smtpReady,
      hasFrom: Boolean(this.config.from),
      hasResendApiKey: Boolean(this.config.resendApiKey),
      hasSmtpHost: Boolean(this.config.smtpHost),
      hasSmtpPort: Boolean(this.config.smtpPort),
      hasSmtpUser: Boolean(this.config.smtpUser),
      hasSmtpPass: Boolean(this.config.smtpPass),
    };
  }

  async sendMail({ to, subject, text, html, replyTo, from }) {
    const sender = from || this.config.from;
    if (this.resendReady) {
      const response = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.config.resendApiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: sender,
          to: [to],
          subject,
          text,
          html: html || undefined,
          reply_to: replyTo || undefined,
        }),
      });

      if (!response.ok) {
        const payload = await response.text().catch(() => '');
        const error = new Error(`Resend delivery failed (${response.status})`);
        error.details = payload;
        throw error;
      }

      const payload = await response.json().catch(() => ({}));
      return { delivered: true, mode: 'resend', provider: 'resend', id: payload.id || '', response: payload };
    }

    if (this.smtpReady) {
      const info = await this.sendViaSmtp({ from: sender, to, subject, text, html, replyTo });
      return { delivered: true, mode: 'smtp', provider: 'smtp', response: info, id: info.messageId || '' };
    }

    return { delivered: false, mode: 'dev-fallback', provider: 'dev-fallback', response: {} };
  }


  encodeHeader(value) {
    const input = String(value ?? '');
    return /^[\x00-\x7F]*$/.test(input) ? input : `=?UTF-8?B?${Buffer.from(input, 'utf8').toString('base64')}?=`;
  }

  formatAddress(value) {
    return String(value ?? '').replace(/[\r\n]/g, '').trim();
  }

  buildMimeMessage({ from, to, subject, text, html, replyTo }) {
    const messageId = `<${Date.now()}.${Math.random().toString(16).slice(2)}@smovecommunication.com>`;
    const headers = [
      `From: ${this.formatAddress(from)}`,
      `To: ${this.formatAddress(to)}`,
      `Subject: ${this.encodeHeader(subject)}`,
      `Message-ID: ${messageId}`,
      `Date: ${new Date().toUTCString()}`,
      'MIME-Version: 1.0',
    ];
    if (replyTo) headers.push(`Reply-To: ${this.formatAddress(replyTo)}`);

    if (html) {
      const boundary = `smove-${Date.now()}-${Math.random().toString(16).slice(2)}`;
      headers.push(`Content-Type: multipart/alternative; boundary="${boundary}"`);
      return {
        messageId,
        data: [
          ...headers,
          '',
          `--${boundary}`,
          'Content-Type: text/plain; charset=UTF-8',
          'Content-Transfer-Encoding: 8bit',
          '',
          text || '',
          `--${boundary}`,
          'Content-Type: text/html; charset=UTF-8',
          'Content-Transfer-Encoding: 8bit',
          '',
          html,
          `--${boundary}--`,
          '',
        ].join('\r\n'),
      };
    }

    headers.push('Content-Type: text/plain; charset=UTF-8', 'Content-Transfer-Encoding: 8bit');
    return { messageId, data: [...headers, '', text || ''].join('\r\n') };
  }

  async sendViaSmtp({ from, to, subject, text, html, replyTo }) {
    let socket = this.config.smtpSecure
      ? tls.connect({ host: this.config.smtpHost, port: this.config.smtpPort, servername: this.config.smtpHost })
      : net.connect({ host: this.config.smtpHost, port: this.config.smtpPort });
    socket.setEncoding('utf8');

    let buffer = '';
    const readResponse = () => new Promise((resolve, reject) => {
      const onData = (chunk) => {
        buffer += chunk;
        const lines = buffer.split(/\r?\n/).filter(Boolean);
        const last = lines[lines.length - 1] || '';
        if (/^\d{3} /.test(last)) {
          socket.off('data', onData);
          const response = buffer;
          buffer = '';
          resolve(response);
        }
      };
      socket.on('data', onData);
      socket.once('error', reject);
    });
    const expect = async (command, okCodes) => {
      if (command) socket.write(`${command}\r\n`);
      const response = await readResponse();
      const code = response.slice(0, 3);
      if (!okCodes.includes(code)) throw new Error(`SMTP command failed (${code}): ${response.trim()}`);
      return response;
    };

    await expect('', ['220']);
    await expect(`EHLO ${this.config.smtpHost}`, ['250']);
    if (!this.config.smtpSecure && this.config.smtpPort === 587) {
      await expect('STARTTLS', ['220']);
      const secureSocket = tls.connect({ socket, servername: this.config.smtpHost });
      await new Promise((resolve) => secureSocket.once('secureConnect', resolve));
      socket = secureSocket;
      socket.setEncoding('utf8');
      await expect(`EHLO ${this.config.smtpHost}`, ['250']);
    }
    if (this.config.smtpUser || this.config.smtpPass) {
      await expect('AUTH LOGIN', ['334']);
      await expect(Buffer.from(this.config.smtpUser).toString('base64'), ['334']);
      await expect(Buffer.from(this.config.smtpPass).toString('base64'), ['235']);
    }
    const built = this.buildMimeMessage({ from, to, subject, text, html, replyTo });
    await expect(`MAIL FROM:<${this.extractEmail(from)}>`, ['250']);
    await expect(`RCPT TO:<${this.extractEmail(to)}>`, ['250', '251']);
    await expect('DATA', ['354']);
    socket.write(`${built.data.replace(/\r?\n\./g, '\r\n..')}\r\n.\r\n`);
    await expect('', ['250']);
    socket.write('QUIT\r\n');
    socket.end();
    return { accepted: [to], rejected: [], messageId: built.messageId };
  }

  extractEmail(value) {
    const match = String(value ?? '').match(/<([^>]+)>/);
    return (match ? match[1] : String(value ?? '')).trim();
  }


  async sendTestEmail({ to }) {
    const status = this.getProviderStatus();
    if (!status.deliveryReady) {
      const error = new Error('Aucun fournisseur email n’est configuré.');
      error.code = 'EMAIL_PROVIDER_NOT_CONFIGURED';
      error.providerStatus = status;
      throw error;
    }

    return this.sendMail({
      to,
      subject: 'SMOVE newsletter test email',
      text: 'Ceci est un email de test envoyé depuis le CMS SMOVE.',
      html: '<p>Ceci est un email de test envoyé depuis le CMS SMOVE.</p>',
      from: this.config.newsletterFrom || this.config.from,
      replyTo: this.config.newsletterReplyTo || undefined,
    });
  }

  async sendNewsletterEmail({ to, subject, text, html, previewText }) {
    const result = await this.sendMail({
      to,
      subject,
      text: text || previewText || subject,
      html: html || undefined,
      from: this.config.newsletterFrom || this.config.from,
      replyTo: this.config.newsletterReplyTo || undefined,
    });

    return result.delivered ? { ...result, status: 'sent' } : { ...result, status: 'failed' };
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
    const composedSubject = `[Contact] ${subject || 'New message'}`;
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
      replyTo: email || undefined,
    });
  }
}

module.exports = { EmailService };
