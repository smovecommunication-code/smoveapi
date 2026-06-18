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
    getPublicPageContent: () => ({}),
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

  
  it('includes published blog posts and projects even when media fields are empty', () => {
    const router = createContentRoutes({
      contentService: createContentService({
        listProjects: () => [{ id: 'p2', title: 'Project without media', slug: 'project-without-media', status: 'published' }],
        listBlogPosts: () => [{ id: 'b2', title: 'Blog without media', slug: 'blog-without-media', status: 'published' }],
      }),
    });

    const projectsHandler = router.stack.find((layer) => layer.route?.path === '/public/projects')?.route.stack[0].handle;
    const blogHandler = router.stack.find((layer) => layer.route?.path === '/public/blog')?.route.stack[0].handle;

    const projectsRes = createRes();
    const blogRes = createRes();

    projectsHandler({}, projectsRes);
    blogHandler({}, blogRes);

    expect(projectsRes.body?.data?.projects).toHaveLength(1);
    expect(blogRes.body?.data?.posts).toHaveLength(1);
  });

it('serves public page-content and media without authentication guards', () => {
    const router = createContentRoutes({
      contentService: createContentService({
        getPageContent: () => ({ home: { heroBadge: 'Public hero' } }),
        getPublicPageContent: () => ({ home: { heroBadge: 'Public hero' } }),
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

describe('content project mutation routes', () => {
  it('returns the created project only after it is visible in the persisted project list', async () => {
    const createdProject = {
      id: 'project-created-1',
      title: 'Created Project',
      slug: 'created-project',
      status: 'published',
    };
    const router = createContentRoutes({
      contentService: createContentService({
        saveProject: () => ({ ok: true, project: createdProject }),
        flushWrites: async () => undefined,
        findProjectById: () => createdProject,
      }),
      auditService: { record: () => undefined },
    });

    const postProjectHandler = router.stack.find((layer) => layer.route?.path === '/projects' && layer.route.methods?.post)?.route.stack.at(-1).handle;
    const res = createRes();

    await postProjectHandler({
      body: { title: 'Created Project' },
      appUser: { id: 'admin-1', role: 'admin', organizationId: 'org_default' },
      session: { userId: 'admin-1', role: 'admin', organizationId: 'org_default' },
      requestId: 'req-project-create',
      ip: '127.0.0.1',
      method: 'POST',
      originalUrl: '/api/v1/content/projects',
    }, res);

    expect(res.statusCode).toBe(201);
    expect(res.body?.data?.project).toEqual(createdProject);
  });

  it('does not report success when the created project is absent after persistence', async () => {
    const router = createContentRoutes({
      contentService: createContentService({
        saveProject: () => ({
          ok: true,
          project: {
            id: 'project-missing-after-save',
            title: 'Missing Project',
            slug: 'missing-project',
            status: 'published',
          },
        }),
        flushWrites: async () => undefined,
        findProjectById: () => null,
      }),
      auditService: { record: () => undefined },
    });

    const postProjectHandler = router.stack.find((layer) => layer.route?.path === '/projects' && layer.route.methods?.post)?.route.stack.at(-1).handle;
    const res = createRes();

    await postProjectHandler({
      body: { title: 'Missing Project' },
      appUser: { id: 'admin-1', role: 'admin', organizationId: 'org_default' },
      session: { userId: 'admin-1', role: 'admin', organizationId: 'org_default' },
      requestId: 'req-project-create-missing',
      ip: '127.0.0.1',
      method: 'POST',
      originalUrl: '/api/v1/content/projects',
    }, res);

    expect(res.statusCode).toBe(500);
    expect(res.body?.success).toBe(false);
    expect(res.body?.error?.code).toBe('PROJECT_RESPONSE_INVALID');
  });
});


describe('content team mutation routes', () => {
  const request = {
    body: { name: 'Ada Lovelace', role: 'Backend Lead', bio: '', status: 'published' },
    appUser: { id: 'admin-1', role: 'admin', organizationId: 'org_default' },
    session: { userId: 'admin-1', role: 'admin', organizationId: 'org_default' },
    requestId: 'req-team-create',
    ip: '127.0.0.1',
    method: 'POST',
    originalUrl: '/api/v1/content/team',
  };

  it('returns the created team member after persistence and visibility check', async () => {
    const member = { id: 'team-1', name: 'Ada Lovelace', role: 'Backend Lead', status: 'published' };
    let flushed = false;
    const router = createContentRoutes({
      contentService: createContentService({
        saveTeamMember: () => ({ ok: true, member }),
        flushWrites: async () => { flushed = true; },
        findTeamMemberById: () => member,
      }),
      auditService: { record: () => undefined },
    });
    const handler = router.stack.find((layer) => layer.route?.path === '/team' && layer.route.methods?.post)?.route.stack.at(-1).handle;
    const res = createRes();

    await handler(request, res);

    expect(flushed).toBe(true);
    expect(res.statusCode).toBe(201);
    expect(res.body?.data?.member).toEqual(member);
  });

  it('returns validation failures as safe client errors instead of generic 500s', async () => {
    const router = createContentRoutes({
      contentService: createContentService({
        saveTeamMember: () => ({ ok: false, error: { code: 'TEAM_VALIDATION_ERROR', message: 'Invalid team member payload.' } }),
      }),
      auditService: { record: () => undefined },
    });
    const handler = router.stack.find((layer) => layer.route?.path === '/team' && layer.route.methods?.post)?.route.stack.at(-1).handle;
    const res = createRes();

    await handler({ ...request, body: { role: '' } }, res);

    expect(res.statusCode).toBe(400);
    expect(res.body?.error?.code).toBe('TEAM_VALIDATION_ERROR');
  });

  it('logs unhandled backend failures and returns a stable team save error', async () => {
    const router = createContentRoutes({
      contentService: createContentService({
        saveTeamMember: () => { throw new Error('saveTeamMember undefined'); },
      }),
      auditService: { record: () => undefined },
    });
    const handler = router.stack.find((layer) => layer.route?.path === '/team' && layer.route.methods?.post)?.route.stack.at(-1).handle;
    const res = createRes();

    await handler(request, res);

    expect(res.statusCode).toBe(500);
    expect(res.body?.error?.code).toBe('TEAM_SAVE_FAILED');
  });
});

describe('content service mutation durability', () => {
  const request = {
    body: { id: 'service-1', title: 'Service One' },
    params: { id: 'service-1' },
    appUser: { id: 'admin-1', role: 'admin', organizationId: 'org_default' },
    session: { userId: 'admin-1', role: 'admin', organizationId: 'org_default' },
    requestId: 'req-service-mutation',
    ip: '127.0.0.1',
    method: 'POST',
    originalUrl: '/api/v1/content/services',
  };

  it.each([
    ['POST', '/services', 'post'],
    ['PATCH', '/services/:id', 'patch'],
    ['DELETE', '/services/:id', 'delete'],
  ])('flushes pending persistence before returning success for %s', async (method, path, methodKey) => {
    let flushed = false;
    const service = { id: 'service-1', title: 'Service One', slug: 'service-one', status: 'published' };
    const router = createContentRoutes({
      contentService: createContentService({
        saveService: () => ({ ok: true, service }),
        findServiceById: () => service,
        deleteService: () => ({ ok: true }),
        flushWrites: async () => { flushed = true; },
      }),
      auditService: { record: () => undefined },
    });
    const handler = router.stack.find((layer) => layer.route?.path === path && layer.route.methods?.[methodKey])?.route.stack.at(-1).handle;
    const res = createRes();

    await handler({ ...request, method }, res);

    expect(flushed).toBe(true);
    expect(res.statusCode).toBe(200);
    expect(res.body?.success).toBe(true);
  });

  it('reports persistence failure instead of claiming a service save succeeded', async () => {
    const router = createContentRoutes({
      contentService: createContentService({
        saveService: () => ({ ok: true, service: { id: 'service-1' } }),
        flushWrites: async () => { throw new Error('database unavailable'); },
      }),
    });
    const handler = router.stack.find((layer) => layer.route?.path === '/services' && layer.route.methods?.post)?.route.stack.at(-1).handle;
    const res = createRes();

    await handler(request, res);

    expect(res.statusCode).toBe(500);
    expect(res.body?.error?.code).toBe('SERVICE_PERSIST_FAILED');
  });
});
