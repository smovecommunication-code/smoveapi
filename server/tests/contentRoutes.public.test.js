import { describe, expect, it } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { createContentRoutes } = require('../routes/contentRoutes');

function createRes() {
  return {
    statusCode: 200,
    body: null,
    headers: {},
    setHeader(name, value) {
      this.headers[name] = value;
      return this;
    },
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
  };
}

function createContentService(overrides = {}) {
  return {
    listProjects: () => [],
    listServices: () => [],
    listBlogPosts: () => [],
    getBlogTaxonomy: () => ({ categories: [], tags: [] }),
    getPublicSettings: () => ({}),
    getPageContent: () => ({}),
    listMediaFiles: () => [],
    getSyncDiagnostics: () => ({}),
    getContentHealthSummary: () => ({}),
    getPublicAnalyticsSummary: () => ({}),
    listAnalyticsEvents: () => [],
    recordAnalyticsEvent: () => ({ ok: true }),
    ...overrides,
  };
}

describe('content public routes hardening', () => {
  it('registers taxonomy route before slug route to prevent accidental 404 shadowing', () => {
    const router = createContentRoutes({ contentService: createContentService() });
    const routePaths = router.stack
      .filter((layer) => layer.route)
      .map((layer) => layer.route.path);

    expect(routePaths.indexOf('/public/blog/taxonomy')).toBeGreaterThan(-1);
    expect(routePaths.indexOf('/public/blog/:slug')).toBeGreaterThan(-1);
    expect(routePaths.indexOf('/public/blog/taxonomy')).toBeLessThan(routePaths.indexOf('/public/blog/:slug'));
  });

  it('allows legacy published content without explicit status on public listing endpoints', async () => {
    const router = createContentRoutes({
      contentService: createContentService({
        listProjects: () => [{ id: 'p1', title: 'Legacy Project', slug: 'legacy-project', mediaRoles: { heroImage: 'media:hero' } }],
        listServices: () => [{ id: 's1', title: 'Legacy Service', slug: 'legacy-service' }],
        listBlogPosts: () => [{ id: 'b1', title: 'Legacy Blog', slug: 'legacy-blog', featuredImage: 'https://cdn.example.com/legacy.jpg' }],
      }),
    });

    const projectsHandler = router.stack.find((layer) => layer.route?.path === '/public/projects')?.route.stack[0].handle;
    const servicesHandler = router.stack.find((layer) => layer.route?.path === '/public/services')?.route.stack[0].handle;
    const blogHandler = router.stack.find((layer) => layer.route?.path === '/public/blog')?.route.stack[0].handle;

    const resProjects = createRes();
    const resServices = createRes();
    const resBlog = createRes();

    projectsHandler({}, resProjects);
    servicesHandler({}, resServices);
    blogHandler({}, resBlog);

    expect(resProjects.body?.data?.projects).toHaveLength(1);
    expect(resServices.body?.data?.services).toHaveLength(1);
    expect(resBlog.body?.data?.posts).toHaveLength(1);
    expect(resProjects.headers['Cache-Control']).toBe('no-store');
    expect(resServices.headers['Cache-Control']).toBe('no-store');
    expect(resBlog.headers['Cache-Control']).toBe('no-store');
  });

  it('serves public page-content and media without authentication guards', () => {
    const router = createContentRoutes({
      contentService: createContentService({
        getPageContent: () => ({ home: { heroBadge: 'Public hero' } }),
        listMediaFiles: () => [{ id: 'hero-1', url: 'https://cdn.example.com/hero-1.jpg' }],
      }),
    });

    const pageContentHandler = router.stack.find((layer) => layer.route?.path === '/public/page-content')?.route.stack[0].handle;
    const mediaHandler = router.stack.find((layer) => layer.route?.path === '/public/media')?.route.stack[0].handle;

    const pageRes = createRes();
    const mediaRes = createRes();

    pageContentHandler({}, pageRes);
    mediaHandler({}, mediaRes);

    expect(pageRes.statusCode).toBe(200);
    expect(mediaRes.statusCode).toBe(200);
    expect(pageRes.body?.data?.pageContent?.home?.heroBadge).toBe('Public hero');
    expect(mediaRes.body?.data?.mediaFiles).toHaveLength(1);
    expect(pageRes.headers['Cache-Control']).toBe('no-store');
    expect(mediaRes.headers['Cache-Control']).toBe('no-store');
  });

  it('serves public analytics events over GET to avoid method mismatch failures', () => {
    const router = createContentRoutes({
      contentService: createContentService({
        listAnalyticsEvents: () => [{ id: 'evt_1', name: 'cta_clicked' }],
      }),
    });

    const eventsGetHandler = router.stack.find((layer) => layer.route?.path === '/public/events' && layer.route.methods?.get)?.route.stack[0].handle;
    const res = createRes();

    eventsGetHandler({ query: { limit: '10' } }, res);

    expect(res.statusCode).toBe(200);
    expect(res.body?.events).toHaveLength(1);
    expect(res.headers['Cache-Control']).toBe('no-store');
  });

  it('returns safe empty events list when analytics service is unavailable', () => {
    const router = createContentRoutes({
      contentService: createContentService({
        listAnalyticsEvents: undefined,
      }),
    });

    const eventsGetHandler = router.stack.find((layer) => layer.route?.path === '/public/events' && layer.route.methods?.get)?.route.stack[0].handle;
    const res = createRes();

    eventsGetHandler({ query: {} }, res);

    expect(res.statusCode).toBe(200);
    expect(res.body?.events).toEqual([]);
  });

  it('returns 405 for unsupported methods on public analytics events endpoint', () => {
    const router = createContentRoutes({ contentService: createContentService() });

    const methodNotAllowedHandler = router.stack.find((layer) => layer.route?.path === '/public/events' && layer.route.methods?._all)?.route.stack[0].handle;
    const res = createRes();

    methodNotAllowedHandler({ method: 'PUT' }, res);

    expect(res.statusCode).toBe(405);
    expect(res.headers.Allow).toBe('GET, POST');
  });
});
