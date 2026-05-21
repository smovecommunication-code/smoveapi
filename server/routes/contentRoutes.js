const express = require('express');
const { requireAuthenticated, requirePermission } = require('../middleware/authz');
const { Permissions } = require('../security/rbac');
const { sendSuccess, sendError } = require('../utils/apiResponse');
const { logInfo, logWarn } = require('../utils/logger');

function logContentFailure(req, event, code, details = {}) {
  logWarn(event, {
    requestId: req.requestId,
    userId: req.session?.userId ?? null,
    code,
    ...details,
  });
}

function toAuditContext(req, eventType, outcome, payload = {}) {
  return {
    eventType,
    outcome,
    actor: {
      userId: req.session?.userId ?? null,
      role: req.session?.role ?? null,
      ip: req.ip || null,
    },
    target: {
      entityType: payload.entityType || null,
      entityId: payload.entityId || null,
    },
    request: {
      requestId: req.requestId ?? null,
      method: req.method,
      path: req.originalUrl,
    },
    metadata: payload.metadata || {},
  };
}

function parseUploadPayload(payload) {
  const rawDataUrl = typeof payload?.dataUrl === 'string' ? payload.dataUrl.trim() : '';
  const dataUrlMatch = rawDataUrl.match(/^data:([^;]+);base64,(.+)$/);

  if (!dataUrlMatch) {
    return { ok: false, error: { code: 'MEDIA_INVALID_PAYLOAD', message: 'Expected media dataUrl with base64 payload.' } };
  }

  return {
    ok: true,
    parsed: {
      filename: `${payload?.filename || 'media-file'}`,
      mimeType: dataUrlMatch[1],
      encodedFile: dataUrlMatch[2],
      title: `${payload?.title || payload?.filename || ''}`.trim(),
      alt: `${payload?.alt || payload?.filename || ''}`.trim(),
      caption: `${payload?.caption || ''}`.trim(),
      tags: Array.isArray(payload?.tags) ? payload.tags.map((entry) => `${entry}`.trim()).filter(Boolean) : [],
    },
  };
}

function createContentRoutes({ contentService, auditService, mediaStorage }) {
  const router = express.Router();
  const actorFromRequest = (req) => ({
    userId: req.session?.userId ?? req.appUser?.id ?? 'system',
    role: req.session?.role ?? req.appUser?.role ?? 'viewer',
    organizationId: req.appUser?.organizationId ?? req.session?.organizationId ?? 'org_default',
  });
  const mergePatch = (current, patch) => ({
    ...current,
    ...(patch && typeof patch === 'object' ? patch : {}),
  });
  const normalizePublicBlogSlug = (value) =>
    `${value || ''}`
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');

  const isPublishedOrLegacy = (status) => status === undefined || status === null || status === '' || status === 'published';
  const isPublicBlogEligible = (post) => isPublishedOrLegacy(post.status) && post.title?.trim() && post.slug?.trim();
  const isPublicProjectEligible = (project) =>
    isPublishedOrLegacy(project.status) &&
    project.title?.trim() &&
    project.slug?.trim();

  router.get('/public/projects', (_req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    return sendSuccess(res, 200, { projects: contentService.listProjects().filter(isPublicProjectEligible) });
  });
  router.get('/public/services', (_req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    return sendSuccess(res, 200, { services: contentService.listServices().filter((s) => isPublishedOrLegacy(s.status)) });
  });
  router.get('/public/blog', (_req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    return sendSuccess(res, 200, {
      posts: contentService
        .listBlogPosts()
        .filter(isPublicBlogEligible),
    });
  });
  router.get('/public/blog/taxonomy', (_req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    return sendSuccess(res, 200, { taxonomy: contentService.getBlogTaxonomy() });
  });
  router.get('/public/blog/:slug', (req, res) => {
    const slug = normalizePublicBlogSlug(req.params.slug);
    if (!slug) {
      return sendError(res, 400, 'BLOG_NOT_FOUND', 'Blog post not found.');
    }

    const publishedPosts = contentService.listBlogPosts().filter(isPublicBlogEligible);
    const post =
      publishedPosts.find((entry) => normalizePublicBlogSlug(entry?.seo?.canonicalSlug) === slug) ||
      publishedPosts.find((entry) => normalizePublicBlogSlug(entry.slug) === slug) ||
      publishedPosts.find((entry) => normalizePublicBlogSlug(entry.id) === slug);

    if (!post) {
      return sendError(res, 404, 'BLOG_NOT_FOUND', 'Blog post not found.');
    }

    res.setHeader('Cache-Control', 'no-store');
    return sendSuccess(res, 200, { post });
  });
  router.get('/public/settings', (_req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    return sendSuccess(res, 200, { settings: contentService.getPublicSettings() });
  });
  router.get('/public/page-content', (_req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    return sendSuccess(res, 200, { pageContent: contentService.getPageContent() });
  });
  router.get('/public/media', (_req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    return sendSuccess(res, 200, { mediaFiles: contentService.listMediaFiles() });
  });
  router.get('/public/diagnostics', (_req, res) =>
    sendSuccess(res, 200, {
      diagnostics: contentService.getSyncDiagnostics(),
      health: contentService.getContentHealthSummary(),
    }));
  router.get('/public/metrics', (_req, res) =>
    sendSuccess(res, 200, {
      metrics: contentService.getPublicAnalyticsSummary(),
    }));
  router.get('/public/events', (req, res) => {
    const parsedLimit = Number.parseInt(`${req.query?.limit ?? ''}`, 10);
    const limit = Number.isFinite(parsedLimit) ? parsedLimit : 100;
    const events = typeof contentService.listAnalyticsEvents === 'function' ? contentService.listAnalyticsEvents(limit) : [];

    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json({ events: Array.isArray(events) ? events : [] });
  });

  router.post('/public/events', (req, res) => {
    const result = contentService.recordAnalyticsEvent(req.body || {}, { source: 'public', requestId: req.requestId });
    if (!result.ok) {
      return sendError(res, 400, result.error.code, result.error.message);
    }

    return sendSuccess(res, 202, { accepted: true });
  });


  router.all('/public/events', (req, res) => {
    res.setHeader('Allow', 'GET, POST');
    return sendError(res, 405, 'METHOD_NOT_ALLOWED', 'Method not allowed.');
  });

  router.use(requireAuthenticated);


  router.get('/blog', requirePermission(Permissions.CONTENT_READ), (req, res) => {
    const actor = actorFromRequest(req);
    return sendSuccess(res, 200, { posts: contentService.listBlogPosts({ organizationId: actor.organizationId }) });
  });

  router.get('/analytics', requirePermission(Permissions.CONTENT_READ), (req, res) => {
    return sendSuccess(res, 200, { analytics: contentService.getAnalytics() });
  });

  router.get('/metrics', requirePermission(Permissions.CONTENT_READ), (req, res) => {
    return sendSuccess(res, 200, { metrics: contentService.getPublicAnalyticsSummary() });
  });

  router.get('/health-summary', requirePermission(Permissions.CONTENT_READ), (req, res) => {
    return sendSuccess(res, 200, { health: contentService.getContentHealthSummary() });
  });

  router.post('/events', requirePermission(Permissions.CONTENT_WRITE), (req, res) => {
    const result = contentService.recordAnalyticsEvent(req.body || {}, {
      source: 'cms',
      requestId: req.requestId,
    });
    if (!result.ok) {
      return sendError(res, 400, result.error.code, result.error.message);
    }
    return sendSuccess(res, 202, { accepted: true });
  });

  router.post('/blog', requirePermission(Permissions.CONTENT_WRITE), (req, res) => {
    const actor = actorFromRequest(req);
    const result = contentService.saveBlogPost(req.body, actor);
    if (!result.ok) {
      logContentFailure(req, 'cms_blog_save_failed', result.error.code);
      auditService?.record(toAuditContext(req, 'cms_blog_save', 'failure', { entityType: 'blog_post', metadata: { code: result.error.code } }));
      return sendError(res, 400, result.error.code, result.error.message);
    }
    logInfo('cms_blog_saved', { requestId: req.requestId, userId: req.session?.userId ?? null, postId: result.post.id });
    auditService?.record(toAuditContext(req, 'cms_blog_save', 'success', { entityType: 'blog_post', entityId: result.post.id }));
    return sendSuccess(res, 200, { post: result.post });
  });

  router.patch('/blog/:id', requirePermission(Permissions.CONTENT_WRITE), (req, res) => {
    const actor = actorFromRequest(req);
    const existing = contentService.findBlogPostById(req.params.id, { organizationId: actor.organizationId });
    if (!existing) {
      return sendError(res, 404, 'BLOG_NOT_FOUND', 'Blog post not found.');
    }

    const result = contentService.saveBlogPost(mergePatch(existing, { ...req.body, id: req.params.id }), actor);
    if (!result.ok) {
      logContentFailure(req, 'cms_blog_patch_failed', result.error.code, { postId: req.params.id });
      return sendError(res, 400, result.error.code, result.error.message);
    }

    auditService?.record(toAuditContext(req, 'cms_blog_patch', 'success', { entityType: 'blog_post', entityId: result.post.id }));
    return sendSuccess(res, 200, { post: result.post });
  });

  router.delete('/blog/:id', requirePermission(Permissions.CONTENT_WRITE), (req, res) => {
    const actor = actorFromRequest(req);
    const post = contentService.findBlogPostById(req.params.id, { organizationId: actor.organizationId });
    if (!post) return sendError(res, 404, 'BLOG_NOT_FOUND', 'Blog post not found.');
    if (actor.role === 'author' && post.ownerUserId !== actor.userId) {
      return sendError(res, 403, 'FORBIDDEN_OWNERSHIP', 'Authors can only delete their own content.');
    }
    contentService.deleteBlogPost(req.params.id);
    logInfo('cms_blog_deleted', { requestId: req.requestId, userId: req.session?.userId ?? null, postId: req.params.id });
    auditService?.record(toAuditContext(req, 'cms_blog_delete', 'success', { entityType: 'blog_post', entityId: req.params.id }));
    return sendSuccess(res, 200, { deleted: true });
  });

  router.post('/blog/:id/transition', requirePermission(Permissions.CONTENT_WRITE), (req, res) => {
    const actor = actorFromRequest(req);
    const { status } = req.body || {};

    if (status === 'published' && req.session?.role === 'author') {
      logContentFailure(req, 'cms_blog_transition_failed', 'FORBIDDEN', { targetStatus: status, postId: req.params.id });
      auditService?.record(toAuditContext(req, 'cms_blog_transition', 'failure', {
        entityType: 'blog_post',
        entityId: req.params.id,
        metadata: { code: 'FORBIDDEN', targetStatus: status },
      }));
      return sendError(res, 403, 'FORBIDDEN', 'Authors cannot publish content directly.');
    }

    const result = contentService.transitionBlogStatus(req.params.id, status, actor);
    if (!result.ok) {
      const statusCode = result.error.code === 'BLOG_NOT_FOUND' ? 404 : 400;
      logContentFailure(req, 'cms_blog_transition_failed', result.error.code, { targetStatus: status, postId: req.params.id });
      auditService?.record(toAuditContext(req, 'cms_blog_transition', 'failure', {
        entityType: 'blog_post',
        entityId: req.params.id,
        metadata: { code: result.error.code, targetStatus: status },
      }));
      return sendError(res, statusCode, result.error.code, result.error.message);
    }

    auditService?.record(toAuditContext(req, 'cms_blog_transition', 'success', {
      entityType: 'blog_post',
      entityId: req.params.id,
      metadata: { targetStatus: status },
    }));
    return sendSuccess(res, 200, { post: result.post });
  });

  router.get('/projects', requirePermission(Permissions.CONTENT_READ), (req, res) =>
    sendSuccess(res, 200, { projects: contentService.listProjects({ organizationId: actorFromRequest(req).organizationId }) }));

  router.post('/projects', requirePermission(Permissions.CONTENT_WRITE), (req, res) => {
    const result = contentService.saveProject(req.body, actorFromRequest(req));
    if (!result.ok) {
      logContentFailure(req, 'cms_project_save_failed', result.error.code);
      auditService?.record(toAuditContext(req, 'cms_project_save', 'failure', { entityType: 'project', metadata: { code: result.error.code } }));
      return sendError(res, 400, result.error.code, result.error.message);
    }
    auditService?.record(toAuditContext(req, 'cms_project_save', 'success', { entityType: 'project', entityId: result.project.id }));
    return sendSuccess(res, 200, { project: result.project });
  });

  router.patch('/projects/:id', requirePermission(Permissions.CONTENT_WRITE), (req, res) => {
    const actor = actorFromRequest(req);
    const existing = contentService.findProjectById(req.params.id, { organizationId: actor.organizationId });
    if (!existing) {
      return sendError(res, 404, 'PROJECT_NOT_FOUND', 'Project not found.');
    }

    const result = contentService.saveProject(mergePatch(existing, { ...req.body, id: req.params.id }), actor);
    if (!result.ok) {
      logContentFailure(req, 'cms_project_patch_failed', result.error.code, { projectId: req.params.id });
      return sendError(res, 400, result.error.code, result.error.message);
    }

    auditService?.record(toAuditContext(req, 'cms_project_patch', 'success', { entityType: 'project', entityId: result.project.id }));
    return sendSuccess(res, 200, { project: result.project });
  });

  router.post('/projects/:id/transition', requirePermission(Permissions.CONTENT_WRITE), (req, res) => {
    const { status } = req.body || {};

    if (status === 'published' && req.session?.role === 'author') {
      logContentFailure(req, 'cms_project_transition_failed', 'FORBIDDEN', { targetStatus: status, projectId: req.params.id });
      auditService?.record(toAuditContext(req, 'cms_project_transition', 'failure', {
        entityType: 'project',
        entityId: req.params.id,
        metadata: { code: 'FORBIDDEN', targetStatus: status },
      }));
      return sendError(res, 403, 'FORBIDDEN', 'Authors cannot publish projects directly.');
    }

    const actor = actorFromRequest(req);
    const result = contentService.transitionProjectStatus(req.params.id, status, { ...actor, reviewedBy: req.session?.userId || undefined });
    if (!result.ok) {
      const statusCode = result.error.code === 'PROJECT_NOT_FOUND' ? 404 : 400;
      logContentFailure(req, 'cms_project_transition_failed', result.error.code, { targetStatus: status, projectId: req.params.id });
      auditService?.record(toAuditContext(req, 'cms_project_transition', 'failure', {
        entityType: 'project',
        entityId: req.params.id,
        metadata: { code: result.error.code, targetStatus: status },
      }));
      return sendError(res, statusCode, result.error.code, result.error.message);
    }

    auditService?.record(toAuditContext(req, 'cms_project_transition', 'success', {
      entityType: 'project',
      entityId: req.params.id,
      metadata: { targetStatus: status },
    }));
    return sendSuccess(res, 200, { project: result.project });
  });

  router.delete('/projects/:id', requirePermission(Permissions.CONTENT_WRITE), (req, res) => {
    const actor = actorFromRequest(req);
    const project = contentService.findProjectById(req.params.id, { organizationId: actor.organizationId });
    if (!project) return sendError(res, 404, 'PROJECT_NOT_FOUND', 'Project not found.');
    if (actor.role === 'author' && project.ownerUserId !== actor.userId) {
      return sendError(res, 403, 'FORBIDDEN_OWNERSHIP', 'Authors can only delete their own projects.');
    }
    contentService.deleteProject(req.params.id);
    auditService?.record(toAuditContext(req, 'cms_project_delete', 'success', { entityType: 'project', entityId: req.params.id }));
    return sendSuccess(res, 200, { deleted: true });
  });

  router.get('/services', requirePermission(Permissions.CONTENT_READ), (req, res) =>
    sendSuccess(res, 200, { services: contentService.listServices({ organizationId: actorFromRequest(req).organizationId }) }));

  router.post('/services', requirePermission(Permissions.CONTENT_WRITE), (req, res) => {
    const result = contentService.saveService(req.body, actorFromRequest(req));
    if (!result.ok) {
      const details = result.error.details ?? null;
      logContentFailure(req, 'cms_service_save_failed', result.error.code, details ? { details } : {});
      auditService?.record(toAuditContext(req, 'cms_service_save', 'failure', {
        entityType: 'service',
        metadata: {
          code: result.error.code,
          details,
        },
      }));
      return sendError(res, 400, result.error.code, result.error.message, details);
    }
    auditService?.record(toAuditContext(req, 'cms_service_save', 'success', { entityType: 'service', entityId: result.service.id }));
    return sendSuccess(res, 200, { service: result.service });
  });

  router.patch('/services/:id', requirePermission(Permissions.CONTENT_WRITE), (req, res) => {
    const actor = actorFromRequest(req);
    const existing = contentService.findServiceById(req.params.id, { organizationId: actor.organizationId });
    if (!existing) {
      return sendError(res, 404, 'SERVICE_NOT_FOUND', 'Service not found.');
    }

    const result = contentService.saveService(mergePatch(existing, { ...req.body, id: req.params.id }), actor);
    if (!result.ok) {
      const details = result.error.details ?? null;
      logContentFailure(req, 'cms_service_patch_failed', result.error.code, { serviceId: req.params.id, ...(details ? { details } : {}) });
      return sendError(res, 400, result.error.code, result.error.message, details);
    }

    auditService?.record(toAuditContext(req, 'cms_service_patch', 'success', { entityType: 'service', entityId: result.service.id }));
    return sendSuccess(res, 200, { service: result.service });
  });

  router.delete('/services/:id', requirePermission(Permissions.CONTENT_WRITE), (req, res) => {
    const actor = actorFromRequest(req);
    const service = contentService.findServiceById(req.params.id, { organizationId: actor.organizationId });
    if (!service) return sendError(res, 404, 'SERVICE_NOT_FOUND', 'Service not found.');
    if (actor.role === 'author' && service.ownerUserId !== actor.userId) {
      return sendError(res, 403, 'FORBIDDEN_OWNERSHIP', 'Authors can only delete their own services.');
    }
    contentService.deleteService(req.params.id);
    auditService?.record(toAuditContext(req, 'cms_service_delete', 'success', { entityType: 'service', entityId: req.params.id }));
    return sendSuccess(res, 200, { deleted: true });
  });

  router.get('/media', requirePermission(Permissions.CONTENT_READ), (req, res) =>
    sendSuccess(res, 200, { mediaFiles: contentService.listMediaFiles() }));

  router.get('/media/:id/references', requirePermission(Permissions.CONTENT_READ), (req, res) =>
    sendSuccess(res, 200, { references: contentService.findMediaReferences(req.params.id) }));
  router.get('/media/:id/impact', requirePermission(Permissions.CONTENT_READ), (req, res) =>
    sendSuccess(res, 200, { impact: contentService.getMediaUsageImpact(req.params.id) }));

  router.post('/media/upload', requirePermission(Permissions.CONTENT_WRITE), (req, res) => {
    const parsed = parseUploadPayload(req.body || {});
    if (!parsed.ok) {
      auditService?.record(toAuditContext(req, 'cms_media_upload', 'failure', { entityType: 'media_asset', metadata: { code: parsed.error.code } }));
      return sendError(res, 400, parsed.error.code, parsed.error.message);
    }

    const stored = mediaStorage.saveBase64Upload(parsed.parsed);
    if (!stored.ok) {
      logContentFailure(req, 'cms_media_upload_failed', stored.error.code);
      auditService?.record(toAuditContext(req, 'cms_media_upload', 'failure', { entityType: 'media_asset', metadata: { code: stored.error.code } }));
      return sendError(res, 400, stored.error.code, stored.error.message);
    }

    const now = new Date().toISOString();
    const mediaPayload = {
      id: stored.file.id,
      name: parsed.parsed.filename,
      title: parsed.parsed.title || parsed.parsed.filename,
      label: parsed.parsed.title || parsed.parsed.filename,
      type: stored.file.mediaType,
      url: stored.file.publicUrl,
      thumbnailUrl: stored.file.publicUrl,
      size: stored.file.size,
      uploadedDate: now,
      uploadedBy: req.session?.userId ?? 'unknown',
      alt: parsed.parsed.alt || parsed.parsed.filename,
      caption: parsed.parsed.caption || parsed.parsed.alt || parsed.parsed.filename,
      tags: parsed.parsed.tags,
      source: 'local-disk',
      metadata: {
        mimeType: stored.file.mimeType,
        checksumSha256: stored.file.checksumSha256,
      },
      createdAt: now,
      updatedAt: now,
    };

    const saved = contentService.saveMediaFile(mediaPayload);
    if (!saved.ok) {
      logContentFailure(req, 'cms_media_save_failed', saved.error.code);
      auditService?.record(toAuditContext(req, 'cms_media_upload', 'failure', {
        entityType: 'media_asset',
        entityId: stored.file.id,
        metadata: { code: saved.error.code },
      }));
      return sendError(res, 400, saved.error.code, saved.error.message);
    }

    auditService?.record(toAuditContext(req, 'cms_media_upload', 'success', {
      entityType: 'media_asset',
      entityId: stored.file.id,
      metadata: { mimeType: stored.file.mimeType, size: stored.file.size },
    }));
    return sendSuccess(res, 200, { mediaFile: saved.mediaFile });
  });

  router.post('/media', requirePermission(Permissions.CONTENT_WRITE), (req, res) => {
    const result = contentService.saveMediaFile(req.body);
    if (!result.ok) {
      logContentFailure(req, 'cms_media_save_failed', result.error.code);
      auditService?.record(toAuditContext(req, 'cms_media_save', 'failure', { entityType: 'media_asset', metadata: { code: result.error.code } }));
      return sendError(res, 400, result.error.code, result.error.message);
    }
    auditService?.record(toAuditContext(req, 'cms_media_save', 'success', { entityType: 'media_asset', entityId: result.mediaFile.id }));
    return sendSuccess(res, 200, { mediaFile: result.mediaFile });
  });

  router.post('/media/:id/replace', requirePermission(Permissions.CONTENT_WRITE), (req, res) => {
    const result = contentService.replaceMediaFile(req.params.id, req.body || {});
    if (!result.ok) {
      const statusCode = result.error.code === 'MEDIA_NOT_FOUND' ? 404 : 400;
      return sendError(res, statusCode, result.error.code, result.error.message);
    }
    return sendSuccess(res, 200, { mediaFile: result.mediaFile, replaced: true });
  });

  router.post('/media/:id/restore', requirePermission(Permissions.CONTENT_WRITE), (req, res) => {
    const restored = contentService.restoreMediaFile(req.params.id);
    if (!restored.ok) {
      const statusCode = restored.error.code === 'MEDIA_NOT_FOUND' ? 404 : 400;
      return sendError(res, statusCode, restored.error.code, restored.error.message);
    }
    return sendSuccess(res, 200, { restored: restored.restored, mediaFile: restored.mediaFile });
  });

  router.delete('/media/:id', requirePermission(Permissions.CONTENT_WRITE), (req, res) => {
    const impact = contentService.getMediaUsageImpact(req.params.id);
    if (!impact.okToArchive) {
      auditService?.record(toAuditContext(req, 'cms_media_delete', 'failure', {
        entityType: 'media_asset',
        entityId: req.params.id,
        metadata: { code: 'MEDIA_IN_USE', impact },
      }));
      return sendError(res, 409, 'MEDIA_IN_USE', 'Media file is still referenced by published or editable content.');
    }

    const archived = contentService.archiveMediaFile(req.params.id);
    if (!archived.ok) {
      const statusCode = archived.error.code === 'MEDIA_NOT_FOUND' ? 404 : 409;
      return sendError(res, statusCode, archived.error.code, archived.error.message);
    }
    auditService?.record(toAuditContext(req, 'cms_media_delete', 'success', { entityType: 'media_asset', entityId: req.params.id }));
    return sendSuccess(res, 200, { deleted: false, archived: true, mediaFile: archived.mediaFile });
  });

  router.get('/page-content', requirePermission(Permissions.CONTENT_READ), (req, res) =>
    sendSuccess(res, 200, { pageContent: contentService.getPageContent() }));

  router.post('/page-content', requirePermission(Permissions.CONTENT_WRITE), (req, res) => {
    const result = contentService.savePageContent(req.body);
    if (!result.ok) {
      logContentFailure(req, 'cms_page_content_save_failed', result.error.code);
      auditService?.record(toAuditContext(req, 'cms_page_content_save', 'failure', { entityType: 'page_content', metadata: { code: result.error.code } }));
      return sendError(res, 400, result.error.code, result.error.message);
    }
    auditService?.record(toAuditContext(req, 'cms_page_content_save', 'success', { entityType: 'page_content', entityId: 'home' }));
    return sendSuccess(res, 200, { pageContent: result.pageContent });
  });

  router.patch('/page-content', requirePermission(Permissions.CONTENT_WRITE), (req, res) => {
    const result = contentService.savePageContent(req.body);
    if (!result.ok) {
      logContentFailure(req, 'cms_page_content_patch_failed', result.error.code);
      return sendError(res, 400, result.error.code, result.error.message);
    }
    return sendSuccess(res, 200, { pageContent: result.pageContent });
  });

  router.get('/settings', requirePermission(Permissions.CONTENT_READ), (req, res) =>
    sendSuccess(res, 200, { settings: contentService.getSettings() }));

  router.get('/settings/history', requirePermission(Permissions.CONTENT_READ), (req, res) =>
    sendSuccess(res, 200, { history: contentService.listSettingsHistory(req.query?.limit) }));

  router.post('/settings/:versionId/rollback', requirePermission(Permissions.CONTENT_WRITE), (req, res) => {
    const result = contentService.rollbackSettings(req.params.versionId, { changedBy: req.session?.userId ?? 'unknown' });
    if (!result.ok) {
      return sendError(res, 404, result.error.code, result.error.message);
    }
    auditService?.record(toAuditContext(req, 'cms_settings_rollback', 'success', {
      entityType: 'cms_settings',
      entityId: 'global',
      metadata: { rollbackOf: req.params.versionId },
    }));
    return sendSuccess(res, 200, { settings: result.settings, rollbackOf: result.rollbackOf });
  });

  router.post('/settings', requirePermission(Permissions.CONTENT_WRITE), (req, res) => {
    const result = contentService.saveSettings(req.body, { changedBy: req.session?.userId ?? 'unknown' });
    if (!result.ok) {
      logContentFailure(req, 'cms_settings_save_failed', result.error.code);
      auditService?.record(toAuditContext(req, 'cms_settings_save', 'failure', { entityType: 'cms_settings', metadata: { code: result.error.code } }));
      return sendError(res, 400, result.error.code, result.error.message);
    }
    auditService?.record(toAuditContext(req, 'cms_settings_save', 'success', {
      entityType: 'cms_settings',
      entityId: 'global',
      metadata: { changedFields: result.audit?.changedFields || [] },
    }));
    return sendSuccess(res, 200, { settings: result.settings });
  });

  router.patch('/settings', requirePermission(Permissions.CONTENT_WRITE), (req, res) => {
    const result = contentService.saveSettings(req.body, { changedBy: req.session?.userId ?? 'unknown' });
    if (!result.ok) {
      logContentFailure(req, 'cms_settings_patch_failed', result.error.code);
      return sendError(res, 400, result.error.code, result.error.message);
    }
    return sendSuccess(res, 200, { settings: result.settings });
  });

  router.get('/sync-diagnostics', requirePermission(Permissions.CONTENT_READ), (req, res) =>
    sendSuccess(res, 200, { diagnostics: contentService.getSyncDiagnostics() }));

  router.get('/admin/audit-events', requirePermission(Permissions.USER_MANAGE), (req, res) => {
    const events = auditService?.list({ limit: req.query?.limit }) || [];
    return sendSuccess(res, 200, { events });
  });

  return router;
}

module.exports = { createContentRoutes };
