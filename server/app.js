const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const cookieParser = require('cookie-parser');

const {
  FRONTEND_ORIGIN,
  API_ORIGIN,
  isProduction,
  MEDIA_UPLOAD_DIR,
  MEDIA_PUBLIC_BASE_PATH,
  MEDIA_MAX_UPLOAD_BYTES,
  MEDIA_ALLOWED_MIME_TYPES,
} = require('./config/env');
const { createSessionMiddleware, createCorsOptions } = require('./config/session');
const { exposeCsrfToken } = require('./middleware/csrf');
const { MemoryAuthRepository } = require('./repositories/authRepository.memory');
const { MongoAuthRepository } = require('./repositories/authRepository.mongo');
const { getMongoose, getMongoConnectionState } = require('./config/mongo');
const { AuthService } = require('./services/authService');
const { buildAuthController } = require('./controllers/authController');
const { createAuthRoutes } = require('./routes/authRoutes');
const { createContentRoutes } = require('./routes/contentRoutes');
const { createContactRoutes } = require('./routes/contactRoutes');
const { createNewsletterRoutes } = require('./routes/newsletterRoutes');
const { sendError } = require('./utils/apiResponse');
const { FileContentRepository } = require('./repositories/contentRepository.file');
const { ContentService } = require('./services/contentService');
const { createOAuthConfig } = require('./config/passport');
const { FileAuditRepository } = require('./repositories/auditRepository.file');
const { AuditService } = require('./services/auditService');
const { setAuthAuditService } = require('./utils/authLogger');
const { LocalDiskMediaStorage } = require('./services/mediaStorageService');
const { EmailService } = require('./services/emailService');
const { MongoContactSubmissionRepository } = require('./repositories/contactSubmissionRepository.mongo');
const { ContactService } = require('./services/contactService');
const { NewsletterService } = require('./services/newsletterService');
const { logInfo, logError } = require('./utils/logger');
const { MongoNewsletterSubscriberRepository } = require('./repositories/newsletterSubscriberRepository.mongo');

const API_WS_ORIGIN = API_ORIGIN.replace(/^http/, 'ws');

const DEV_CSP = [
  "default-src 'self'",
  "base-uri 'self'",
  "frame-ancestors 'none'",
  "object-src 'none'",
  `script-src 'self' 'unsafe-inline' 'unsafe-eval' ${FRONTEND_ORIGIN} https://cdn.jsdelivr.net`,
  "worker-src 'self' blob:",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  `connect-src 'self' ${FRONTEND_ORIGIN} ${FRONTEND_ORIGIN.replace('http', 'ws')} ${API_ORIGIN} ${API_WS_ORIGIN} https://accounts.google.com https://oauth2.googleapis.com`,
].join('; ');

const PROD_CSP = [
  "default-src 'self'",
  "base-uri 'self'",
  "frame-ancestors 'none'",
  "object-src 'none'",
  "script-src 'self' https://cdn.jsdelivr.net",
  "worker-src 'self' blob:",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data:",
  "connect-src 'self' https:",
].join('; ');

function createRequestId() {
  if (typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `req_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

function createApp(deps = {}) {
  const app = express();

  const mongoose = getMongoose();
  const userRepository = deps.userRepository ?? (mongoose ? new MongoAuthRepository({ mongoose }) : new MemoryAuthRepository());
  const oauthConfig = createOAuthConfig();
  const authService = deps.authService ?? new AuthService({
    userRepository,
    oauthProviders: {
      emailPassword: { enabled: true },
      google: { enabled: oauthConfig.googleEnabled },
      facebook: { enabled: oauthConfig.facebookEnabled },
    },
  });
  const authController = deps.authController ?? buildAuthController({ authService });

  const contentRepository = deps.contentRepository ?? new FileContentRepository();
  const contentService = deps.contentService ?? new ContentService({ contentRepository });

  const auditRepository = deps.auditRepository ?? new FileAuditRepository();
  const auditService = deps.auditService ?? new AuditService({ auditRepository });
  setAuthAuditService(auditService);

  const mediaStorage =
    deps.mediaStorage ??
    new LocalDiskMediaStorage({
      uploadRootDir: MEDIA_UPLOAD_DIR,
      publicBasePath: MEDIA_PUBLIC_BASE_PATH,
      maxUploadBytes: MEDIA_MAX_UPLOAD_BYTES,
      allowedMimeTypes: MEDIA_ALLOWED_MIME_TYPES,
    });

  const sessionInit = deps.sessionInit ?? createSessionMiddleware();

  const emailService =
    deps.emailService ??
    new EmailService({
      smtpHost: process.env.SMTP_HOST ?? '',
      smtpPort: Number(process.env.SMTP_PORT ?? 587),
      smtpSecure: process.env.SMTP_SECURE === 'true',
      smtpUser: process.env.SMTP_USER ?? '',
      smtpPass: process.env.SMTP_PASS ?? '',
      resendApiKey: process.env.RESEND_API_KEY ?? '',
      from: process.env.EMAIL_FROM ?? 'noreply@localhost',
      appBaseUrl: process.env.APP_BASE_URL ?? FRONTEND_ORIGIN,
      contactTo: process.env.CONTACT_TO_EMAIL ?? '',
    });
  const contactSubmissionRepository =
    deps.contactSubmissionRepository ?? (mongoose ? new MongoContactSubmissionRepository({ mongoose }) : null);
  const contactService =
    deps.contactService ??
    (contactSubmissionRepository
      ? new ContactService({
          contactSubmissionRepository,
          emailService,
        })
      : null);

  const newsletterSubscriberRepository =
    deps.newsletterSubscriberRepository ?? (mongoose ? new MongoNewsletterSubscriberRepository({ mongoose }) : null);

  const newsletterService =
    deps.newsletterService ??
    (newsletterSubscriberRepository
      ? new NewsletterService({ newsletterSubscriberRepository, userRepository })
      : null);

  if (!contactService || !newsletterService) {
    throw new Error(
      '[contact|newsletter] MongoDB repository unavailable. Configure MongoDB or pass custom contact/newsletter services.',
    );
  }

  app.use((req, res, next) => {
    const requestId = req.headers['x-request-id'] || createRequestId();
    req.requestId = String(requestId);
    res.setHeader('x-request-id', req.requestId);
    next();
  });

  app.use((req, res, next) => {
    const startedAt = Date.now();
    res.on('finish', () => {
      logInfo('http_request', {
        requestId: req.requestId,
        method: req.method,
        path: req.originalUrl,
        statusCode: res.statusCode,
        durationMs: Date.now() - startedAt,
      });
    });
    next();
  });

  app.use(helmet({ contentSecurityPolicy: false }));
  app.use((req, res, next) => {
    res.setHeader('Content-Security-Policy', isProduction ? PROD_CSP : DEV_CSP);
    next();
  });

  const corsOptions = createCorsOptions();
  app.use(cors(corsOptions));
  app.options('*', cors(corsOptions));
  app.use(cookieParser());
  app.use(express.json({ limit: '10mb' }));
  app.use(sessionInit.middleware);
  app.use(async (req, _res, next) => {
    const sessionUserId = req.session?.userId;
    if (!sessionUserId) {
      req.appUser = null;
      return next();
    }
    try {
      req.appUser = await authService.getSessionUser(sessionUserId);
      if (!req.appUser) {
        req.session.userId = null;
        req.session.role = null;
        req.session.organizationId = null;
        req.session.planTier = null;
        req.session.accountStatus = null;
      } else {
        req.session.role = req.appUser.role;
        req.session.organizationId = req.appUser.organizationId ?? 'org_default';
        req.session.planTier = req.appUser.planTier ?? 'free';
        req.session.accountStatus = req.appUser.accountStatus ?? 'active';
      }
    } catch (_error) {
      req.appUser = null;
    }
    return next();
  });

  if (!fs.existsSync(MEDIA_UPLOAD_DIR)) {
    fs.mkdirSync(MEDIA_UPLOAD_DIR, { recursive: true });
  }
  app.use(MEDIA_PUBLIC_BASE_PATH, express.static(path.resolve(MEDIA_UPLOAD_DIR)));
  app.use(`/api${MEDIA_PUBLIC_BASE_PATH}`, express.static(path.resolve(MEDIA_UPLOAD_DIR)));
  app.use(exposeCsrfToken);

  app.get('/api/v1/health', (_req, res) => {
    res.status(200).json({ ok: true, service: 'smove-api', uptimeSec: Number(process.uptime().toFixed(2)) });
  });

  app.get('/api/v1/ready', (_req, res) => {
    const mongoState = getMongoConnectionState();
    const sessionStoreReady = Boolean(sessionInit.storeMeta?.mode);
    const ready = Boolean(mongoState.connected) && sessionStoreReady;
    const payload = {
      ready,
      dependencies: {
        mongo: mongoState,
        sessionStore: {
          ...sessionInit.storeMeta,
          ready: sessionStoreReady,
        },
      },
    };

    if (!ready) {
      return res.status(503).json(payload);
    }

    return res.status(200).json(payload);
  });

  app.use('/api/v1/auth', createAuthRoutes({ authController }));
  app.use('/api/v1/content', createContentRoutes({ contentService, auditService, mediaStorage }));
  app.use('/api/v1/contact', createContactRoutes({ contactService }));
  app.use('/api/v1/newsletter', createNewsletterRoutes({ newsletterService }));

  app.use((err, req, res, _next) => {
    logError('api_unhandled_error', {
      requestId: req.requestId,
      path: req.originalUrl,
      method: req.method,
      message: err?.message,
    });
    sendError(res, 500, 'INTERNAL_ERROR', 'Unexpected error');
  });

  return app;
}

module.exports = { createApp };
