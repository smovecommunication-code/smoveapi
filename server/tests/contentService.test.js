const { describe, it, expect } = require('vitest');
const { ContentService } = require('../services/contentService');

class MemoryContentRepository {
  constructor(state = {}) {
    this.state = {
      blogPosts: [],
      projects: [],
      mediaFiles: [],
      services: [],
      pageContent: null,
      settings: null,
      ...state,
    };
  }

  getState() {
    return JSON.parse(JSON.stringify(this.state));
  }

  saveState(state) {
    this.state = JSON.parse(JSON.stringify(state));
  }
}

describe('ContentService blog persistence', () => {
  it('seeds legacy public blog posts when repository is empty', () => {
    const service = new ContentService({ contentRepository: new MemoryContentRepository() });

    const posts = service.listBlogPosts();

    expect(posts.length).toBeGreaterThan(0);
    expect(posts.every((post) => post.status === 'published')).toBe(true);
  });

  it('keeps seed migration idempotent by slug', () => {
    const repo = new MemoryContentRepository();
    const service = new ContentService({ contentRepository: repo });

    const first = service.listBlogPosts();
    const second = service.listBlogPosts();

    expect(second).toHaveLength(first.length);
    expect(new Set(second.map((post) => post.slug)).size).toBe(second.length);
  });

  it('supports status lifecycle and prevents publishing invalid posts', () => {
    const repo = new MemoryContentRepository({
      blogPosts: [
        {
          id: 'draft-1',
          title: 'Draft',
          slug: 'draft',
          excerpt: 'Excerpt',
          content: 'Content',
          author: 'Author',
          authorRole: 'Role',
          category: 'Cat',
          tags: [],
          publishedDate: '2024-01-01',
          readTime: '2 min',
          featuredImage: 'img',
          images: [],
          status: 'draft',
        },
      ],
    });
    const service = new ContentService({ contentRepository: repo });

    expect(service.transitionBlogStatus('draft-1', 'published').ok).toBe(false);
    expect(service.transitionBlogStatus('draft-1', 'in_review').ok).toBe(true);
    expect(service.transitionBlogStatus('draft-1', 'published').ok).toBe(true);
  });

  it('blocks publish transitions when instant publishing is disabled in settings', () => {
    const repo = new MemoryContentRepository({
      settings: {
        siteTitle: 'SMOVE',
        supportEmail: 'contact@smove.africa',
        instantPublishing: false,
      },
      blogPosts: [
        {
          id: 'review-1',
          title: 'Review',
          slug: 'review',
          excerpt: 'Excerpt',
          content: 'Content',
          author: 'Author',
          authorRole: 'Role',
          category: 'Cat',
          tags: [],
          publishedDate: '2024-01-01',
          readTime: '2 min',
          featuredImage: 'img',
          images: [],
          status: 'in_review',
        },
      ],
    });
    const service = new ContentService({ contentRepository: repo });

    const transition = service.transitionBlogStatus('review-1', 'published');

    expect(transition.ok).toBe(false);
    expect(transition.error.code).toBe('BLOG_INSTANT_PUBLISHING_DISABLED');
  });

  it('enforces the same publishability contract for save-as-published and transition-to-published', () => {
    const repo = new MemoryContentRepository({
      blogPosts: [
        {
          id: 'parity-1',
          title: 'Parity',
          slug: 'parity',
          excerpt: 'Excerpt',
          content: 'Content',
          author: 'Author',
          authorRole: 'Role',
          category: 'Cat',
          tags: [],
          publishedDate: '2024-01-01T00:00:00.000Z',
          readTime: '2 min',
          featuredImage: 'img',
          images: [],
          status: 'draft',
        },
      ],
    });
    const service = new ContentService({ contentRepository: repo });

    const inReview = service.transitionBlogStatus('parity-1', 'in_review');
    expect(inReview.ok).toBe(true);

    // Transition path should reject invalid publish date.
    const patched = service.saveBlogPost({ ...inReview.post, publishedDate: 'invalid-date', status: 'in_review' });
    expect(patched.ok).toBe(true);
    const transition = service.transitionBlogStatus('parity-1', 'published');
    expect(transition.ok).toBe(false);
    expect(transition.error.code).toBe('BLOG_NOT_PUBLISHABLE');

    // Save path with direct published status should reject with same code.
    const directPublish = service.saveBlogPost({ ...inReview.post, id: 'parity-2', slug: 'parity-2', status: 'published', publishedDate: 'invalid-date' });
    expect(directPublish.ok).toBe(false);
    expect(directPublish.error.code).toBe('BLOG_NOT_PUBLISHABLE');
  });

});


describe('ContentService project persistence', () => {
  it('imports legacy site projects into canonical CMS store when missing', () => {
    const repo = new MemoryContentRepository();
    const service = new ContentService({ contentRepository: repo });

    const projects = service.listProjects();
    const state = repo.getState();

    expect(projects.length).toBeGreaterThan(0);
    expect(projects.some((project) => project.slug === 'plateforme-smove-digital')).toBe(true);
    expect(state.migrationHistory[0].source).toBe('site-legacy-projects');
    expect(state.migrationHistory[0].strategy).toBe('slug_then_id');
  });

  it('keeps legacy project import idempotent and avoids duplicates by slug/id', () => {
    const repo = new MemoryContentRepository();
    const service = new ContentService({ contentRepository: repo });

    const first = service.listProjects();
    const second = service.listProjects();

    expect(second).toHaveLength(first.length);
    expect(new Set(second.map((project) => project.slug)).size).toBe(second.length);
    expect(new Set(second.map((project) => project.id)).size).toBe(second.length);
  });

  it('creates and updates projects with normalized slug/status contract', () => {
    const service = new ContentService({ contentRepository: new MemoryContentRepository() });

    const created = service.saveProject({
      id: 'project-cms-1',
      title: 'Projet CMS Démo',
      slug: '',
      client: 'Client Démo',
      category: 'Web',
      year: '2026',
      summary: 'Résumé court',
      description: 'Description complète',
      challenge: 'Challenge',
      solution: 'Solution',
      results: ['Résultat 1'],
      tags: ['cms'],
      mainImage: 'image projet',
      images: [],
      status: 'published',
    });

    expect(created.ok).toBe(true);
    expect(created.project.slug).toBe('projet-cms-demo');
    expect(created.project.featuredImage).toBe('image projet');
    expect(created.project.imageAlt).toBe('Projet CMS Démo');

    const updatedResult = service.saveProject({ ...created.project, title: 'Projet CMS Démo MAJ' });
    expect(updatedResult.ok).toBe(true);

    const listed = service.listProjects();
    const updatedProject = listed.find((project) => project.id === 'project-cms-1');
    expect(updatedProject?.title).toBe('Projet CMS Démo MAJ');
  });




  it('enforces project lifecycle transitions and publish readiness checks', () => {
    const service = new ContentService({ contentRepository: new MemoryContentRepository() });

    const create = service.saveProject({
      id: 'project-governance-1',
      title: 'Projet gouvernance',
      slug: 'projet-gouvernance',
      client: 'Client',
      category: 'Web',
      year: '2026',
      summary: 'Résumé initial bien détaillé pour validation.',
      description: 'Description longue pour publication',
      challenge: 'Challenge',
      solution: 'Solution',
      results: ['result'],
      tags: ['tag'],
      mainImage: 'cover-image',
      featuredImage: 'cover-image',
      status: 'draft',
      images: ['cover-image'],
    });

    expect(create.ok).toBe(true);
    expect(service.transitionProjectStatus('project-governance-1', 'published').ok).toBe(false);
    expect(service.transitionProjectStatus('project-governance-1', 'in_review').ok).toBe(true);

    const publish = service.transitionProjectStatus('project-governance-1', 'published', { reviewedBy: 'editor-1' });
    expect(publish.ok).toBe(true);
    expect(publish.project.reviewedAt).toBeTruthy();
    expect(publish.project.reviewedBy).toBe('editor-1');
  });

  it('blocks invalid project transitions', () => {
    const service = new ContentService({ contentRepository: new MemoryContentRepository() });
    service.saveProject({
      id: 'project-governance-2',
      title: 'Projet transition',
      slug: 'projet-transition',
      client: 'Client',
      category: 'Web',
      year: '2026',
      summary: 'Résumé initial bien détaillé pour validation.',
      description: 'Description longue pour publication',
      challenge: 'Challenge',
      solution: 'Solution',
      results: ['result'],
      tags: ['tag'],
      mainImage: 'cover-image',
      featuredImage: 'cover-image',
      status: 'draft',
      images: ['cover-image'],
    });

    const invalid = service.transitionProjectStatus('project-governance-2', 'archived');
    expect(invalid.ok).toBe(true);
    const blocked = service.transitionProjectStatus('project-governance-2', 'published');
    expect(blocked.ok).toBe(false);
    expect(blocked.error.code).toBe('PROJECT_INVALID_STATUS_TRANSITION');
  });

  it('persists project testimonial and case study contract fields', () => {
    const service = new ContentService({ contentRepository: new MemoryContentRepository() });

    const result = service.saveProject({
      id: 'project-contract-1',
      title: 'Projet Contrat',
      slug: 'projet-contrat',
      client: 'Client Contrat',
      category: 'Web',
      year: '2026',
      description: 'Description',
      challenge: 'Challenge',
      solution: 'Solution',
      results: ['Résultat 1'],
      tags: ['cms'],
      mainImage: 'image projet',
      images: ['img-1', 'img-2', 'img-3'],
      status: 'published',
      links: {
        live: 'https://smove.africa/projet',
        caseStudy: 'https://smove.africa/case-study',
      },
      testimonial: {
        text: 'Super accompagnement',
        author: 'Mariam',
        position: 'CMO',
      },
    });

    expect(result.ok).toBe(true);
    expect(result.project.images).toEqual(['img-1', 'img-2', 'img-3']);
    expect(result.project.links.caseStudy).toBe('https://smove.africa/case-study');
    expect(result.project.testimonial.author).toBe('Mariam');
  });

  it('preserves migration fields required for CMS edit/delete lifecycle', () => {
    const service = new ContentService({ contentRepository: new MemoryContentRepository() });
    const imported = service.listProjects().find((project) => project.slug === 'plateforme-smove-digital');

    expect(imported).toBeTruthy();
    expect(imported.summary).toBeTruthy();
    expect(imported.featuredImage).toBeTruthy();
    expect(imported.mainImage).toBeTruthy();
    expect(imported.images.length).toBeGreaterThan(0);
    expect(imported.status).toBe('published');
    expect(imported.client).toBeTruthy();
    expect(imported.category).toBeTruthy();
  });

  it('allows CMS edit/delete lifecycle for imported legacy projects', () => {
    const service = new ContentService({ contentRepository: new MemoryContentRepository() });
    const imported = service.listProjects().find((project) => project.slug === 'plateforme-smove-digital');

    expect(imported).toBeTruthy();

    const updated = service.saveProject({
      ...imported,
      title: 'Plateforme SMOVE Digital MAJ',
      summary: 'Résumé édité depuis CMS avec suffisamment de détails pour rester publiable.',
      status: 'published',
    });
    expect(updated.ok).toBe(true);

    const afterUpdate = service.listProjects().find((project) => project.id === imported.id);
    expect(afterUpdate?.title).toBe('Plateforme SMOVE Digital MAJ');

    const deleted = service.deleteProject(imported.id);
    expect(deleted.ok).toBe(true);
    expect(service.listProjects().some((project) => project.id === imported.id)).toBe(false);
  });

  it('normalizes legacy project link fields into canonical links contract', () => {
    const service = new ContentService({ contentRepository: new MemoryContentRepository() });

    const result = service.saveProject({
      id: 'project-legacy-link-fields',
      title: 'Projet Legacy Links',
      slug: 'projet-legacy-links',
      client: 'Client',
      category: 'Web',
      year: '2026',
      description: 'Description',
      challenge: 'Challenge',
      solution: 'Solution',
      results: [],
      tags: [],
      mainImage: 'image projet',
      featuredImage: 'image projet',
      images: [],
      status: 'published',
      externalLink: 'https://smove.africa/live-legacy',
      caseStudyLink: 'https://smove.africa/case-legacy',
    });

    expect(result.ok).toBe(true);
    expect(result.project.link).toBe('https://smove.africa/live-legacy');
    expect(result.project.links.live).toBe('https://smove.africa/live-legacy');
    expect(result.project.links.caseStudy).toBe('https://smove.africa/case-legacy');
  });


  it('accepts project payloads with only title and image as meaningful required fields', () => {
    const service = new ContentService({ contentRepository: new MemoryContentRepository() });

    const result = service.saveProject({
      id: 'project-minimal-server',
      title: 'Projet minimal serveur',
      slug: '',
      client: '',
      category: '',
      year: '',
      description: '',
      challenge: '',
      solution: '',
      results: [],
      tags: [],
      mainImage: 'minimal server image',
      featuredImage: 'minimal server image',
      images: [],
      status: 'published',
    });

    expect(result.ok).toBe(true);
    expect(result.project.featuredImage).toBe('minimal server image');
  });


  it('normalizes project mediaRoles into explicit card/hero/gallery contract', () => {
    const service = new ContentService({ contentRepository: new MemoryContentRepository() });

    const result = service.saveProject({
      id: 'project-media-roles',
      title: 'Projet media roles',
      slug: 'projet-media-roles',
      client: 'Client',
      category: 'Web',
      year: '2026',
      description: 'Description',
      challenge: 'Challenge',
      solution: 'Solution',
      results: [],
      tags: [],
      featuredImage: 'card-image',
      mainImage: 'hero-image',
      images: ['gallery-1'],
      mediaRoles: {
        cardImage: 'role-card-image',
        heroImage: 'role-hero-image',
        galleryImages: ['role-gallery-1', 'role-gallery-2'],
      },
      status: 'published',
    });

    expect(result.ok).toBe(true);
    expect(result.project.featuredImage).toBe('role-card-image');
    expect(result.project.mainImage).toBe('role-hero-image');
    expect(result.project.mediaRoles.coverImage).toBe('role-hero-image');
    expect(result.project.mediaRoles.socialImage).toBe('role-card-image');
    expect(result.project.mediaRoles.galleryImages).toEqual(['role-gallery-1', 'role-gallery-2']);
    expect(result.project.seo.canonicalSlug).toBe('projet-media-roles');
  });

  it('uses media roles as primary source even when legacy project media is empty', () => {
    const service = new ContentService({ contentRepository: new MemoryContentRepository() });

    const result = service.saveProject({
      id: 'project-media-role-primary',
      title: 'Projet role first',
      slug: 'projet-role-first',
      client: 'Client',
      category: 'Web',
      year: '2026',
      description: 'Description',
      challenge: 'Challenge',
      solution: 'Solution',
      results: [],
      tags: [],
      featuredImage: '',
      mainImage: '',
      images: [],
      mediaRoles: {
        heroImage: 'role-hero-only',
        galleryImages: ['role-gallery'],
      },
      seo: {
        socialImage: 'seo-social-role',
      },
      status: 'published',
    });

    expect(result.ok).toBe(true);
    expect(result.project.featuredImage).toBe('role-hero-only');
    expect(result.project.mainImage).toBe('role-hero-only');
    expect(result.project.images).toEqual(['role-gallery']);
    expect(result.project.mediaRoles.socialImage).toBe('seo-social-role');
  });

  it('rejects duplicate project slugs across different ids', () => {
    const service = new ContentService({ contentRepository: new MemoryContentRepository() });

    const first = service.saveProject({
      id: 'project-1',
      title: 'Projet Alpha',
      slug: 'projet-alpha',
      client: 'Client Alpha',
      category: 'Web',
      year: '2026',
      description: 'Description',
      challenge: 'Challenge',
      solution: 'Solution',
      results: [],
      tags: [],
      mainImage: 'cover',
      images: [],
      status: 'published',
    });

    expect(first.ok).toBe(true);

    const duplicate = service.saveProject({
      id: 'project-2',
      title: 'Projet Beta',
      slug: 'projet-alpha',
      client: 'Client Beta',
      category: 'Web',
      year: '2026',
      description: 'Description',
      challenge: 'Challenge',
      solution: 'Solution',
      results: [],
      tags: [],
      mainImage: 'cover',
      images: [],
      status: 'published',
    });

    expect(duplicate.ok).toBe(false);
    expect(duplicate.error.code).toBe('PROJECT_SLUG_CONFLICT');
  });

  it('rejects invalid project payloads', () => {
    const service = new ContentService({ contentRepository: new MemoryContentRepository() });

    const result = service.saveProject({
      id: 'project-invalid',
      title: '',
      client: '',
      category: '',
      year: '2026',
      description: '',
      challenge: '',
      solution: '',
      results: [],
      tags: [],
      mainImage: '',
      images: [],
    });

    expect(result.ok).toBe(false);
    expect(result.error.code).toBe('PROJECT_VALIDATION_ERROR');
  });

  it('rejects project URLs and media references that are invalid', () => {
    const service = new ContentService({ contentRepository: new MemoryContentRepository() });

    const result = service.saveProject({
      id: 'project-invalid-links',
      title: 'Projet invalide',
      slug: 'projet-invalide',
      client: 'Client',
      category: 'Web',
      year: '20',
      description: 'Description',
      challenge: 'Challenge',
      solution: 'Solution',
      results: [],
      tags: [],
      mainImage: 'media:missing',
      featuredImage: 'media:missing',
      images: ['ftp://invalid'],
      link: 'not-a-url',
      status: 'published',
    });

    expect(result.ok).toBe(false);
    expect(result.error.code).toBe('PROJECT_VALIDATION_ERROR');
  });
});


describe('ContentService services synchronization', () => {
  it('seeds legacy default services when repository is empty', () => {
    const service = new ContentService({ contentRepository: new MemoryContentRepository() });

    const services = service.listServices();

    expect(services.length).toBeGreaterThan(0);
    expect(services.some((entry) => entry.slug === 'design-branding')).toBe(true);
    expect(services.every((entry) => entry.status === 'published')).toBe(true);
  });

  it('keeps service seed migration idempotent by slug', () => {
    const repo = new MemoryContentRepository();
    const service = new ContentService({ contentRepository: repo });

    const first = service.listServices();
    const second = service.listServices();

    expect(second).toHaveLength(first.length);
    expect(new Set(second.map((entry) => entry.slug)).size).toBe(second.length);
  });

  it('supports service create, update status/archive, and delete lifecycle', () => {
    const service = new ContentService({ contentRepository: new MemoryContentRepository() });

    const created = service.saveService({
      id: 'svc-lifecycle',
      title: 'Lifecycle Service',
      slug: 'lifecycle-service',
      routeSlug: 'lifecycle-service',
      description: 'Service description long enough for publication.',
      shortDescription: 'Short copy',
      icon: 'palette',
      color: 'from-[#00b3e8] to-[#00c0e8]',
      features: ['Feature one'],
      status: 'draft',
    });

    expect(created.ok).toBe(true);
    expect(service.findServiceById('svc-lifecycle')).not.toBeNull();

    const archived = service.saveService({
      ...created.service,
      status: 'archived',
      features: ['Feature one', 'Feature two'],
    });
    expect(archived.ok).toBe(true);
    expect(service.findServiceById('svc-lifecycle').status).toBe('archived');

    const deleted = service.deleteService('svc-lifecycle');
    expect(deleted.ok).toBe(true);
    expect(service.findServiceById('svc-lifecycle')).toBeNull();
  });

  it('rejects service payload when icon-like media reference does not exist', () => {
    const service = new ContentService({ contentRepository: new MemoryContentRepository() });

    const result = service.saveService({
      id: 'svc-invalid-media',
      title: 'Service invalid media',
      slug: 'service-invalid-media',
      routeSlug: 'service-invalid-media',
      description: 'Valid service description for media validation.',
      icon: 'palette',
      color: 'from-[#00b3e8] to-[#00c0e8]',
      features: ['Feature one'],
      status: 'draft',
      iconLikeAsset: 'media:missing-service-media',
    });

    expect(result.ok).toBe(false);
    expect(result.error.code).toBe('SERVICE_VALIDATION_ERROR');
  });

  it('rejects duplicate service route slug to avoid public detail collisions', () => {
    const service = new ContentService({ contentRepository: new MemoryContentRepository() });

    const first = service.saveService({
      id: 'svc-route-1',
      title: 'Service Route One',
      slug: 'service-route-one',
      routeSlug: 'service-route',
      description: 'Service description one.',
      icon: 'palette',
      color: 'from-[#00b3e8] to-[#00c0e8]',
      features: ['Feature one'],
      status: 'draft',
    });

    const second = service.saveService({
      id: 'svc-route-2',
      title: 'Service Route Two',
      slug: 'service-route-two',
      routeSlug: 'service-route',
      description: 'Service description two.',
      icon: 'palette',
      color: 'from-[#00b3e8] to-[#00c0e8]',
      features: ['Feature two'],
      status: 'draft',
    });

    expect(first.ok).toBe(true);
    expect(second.ok).toBe(false);
    expect(second.error.code).toBe('SERVICE_ROUTE_SLUG_CONFLICT');
  });

  it('allows media-only updates for legacy-like published services with incomplete optional data', () => {
    const repo = new MemoryContentRepository({
      services: [
        {
          id: 'svc-legacy-media',
          title: 'Legacy Media Service',
          slug: 'legacy-media-service',
          routeSlug: 'legacy-media-service',
          description: 'Legacy description',
          icon: 'palette',
          color: 'from-[#00b3e8] to-[#00c0e8]',
          features: ['Legacy feature'],
          status: 'published',
          ctaTitle: '',
          ctaDescription: '',
          processSteps: [],
        },
      ],
      mediaFiles: [
        {
          id: 'asset-service-icon',
          name: 'service-icon.jpg',
          type: 'image',
          url: 'https://cdn.example.com/service-icon.jpg',
          thumbnailUrl: 'https://cdn.example.com/service-icon.jpg',
          size: 1500,
          uploadedDate: '2026-01-01T00:00:00.000Z',
          uploadedBy: 'tester',
          alt: 'service icon',
        },
      ],
    });
    const service = new ContentService({ contentRepository: repo });

    const result = service.saveService({
      id: 'svc-legacy-media',
      iconLikeAsset: 'media:asset-service-icon',
    });

    expect(result.ok).toBe(true);
    expect(result.service.iconLikeAsset).toBe('media:asset-service-icon');
    expect(result.service.title).toBe('Legacy Media Service');
    expect(result.service.features).toEqual(['Legacy feature']);
  });

  it('allows minor updates on legacy services that use deprecated icon/color values', () => {
    const repo = new MemoryContentRepository({
      services: [
        {
          id: 'svc-legacy-style',
          title: 'Legacy Style Service',
          slug: 'legacy-style-service',
          routeSlug: 'legacy-style-service',
          description: 'Legacy description still renderable.',
          icon: 'rocket',
          color: 'legacy-gradient-token',
          features: ['Legacy feature'],
          status: 'published',
        },
      ],
    });
    const service = new ContentService({ contentRepository: repo });

    const result = service.saveService({
      id: 'svc-legacy-style',
      overviewDescription: 'Added one extra detail from CMS.',
    });

    expect(result.ok).toBe(true);
    expect(result.service.icon).toBe('rocket');
    expect(result.service.color).toBe('legacy-gradient-token');
    expect(result.service.overviewDescription).toBe('Added one extra detail from CMS.');
  });

  it('accepts minor updates for legacy services with invalid optional media/href fields when those fields are not modified', () => {
    const repo = new MemoryContentRepository({
      services: [
        {
          id: 'svc-legacy-invalid-optionals',
          title: 'Legacy Optional Fields Service',
          slug: 'legacy-optional-fields-service',
          routeSlug: 'legacy-optional-fields-service',
          description: 'Legacy service still rendered on public surfaces.',
          icon: 'palette',
          color: 'from-[#00b3e8] to-[#00c0e8]',
          features: ['Legacy feature'],
          status: 'published',
          iconLikeAsset: 'media:missing-legacy-icon',
          seo: {
            title: 'Legacy optional fields service',
            description: 'Legacy service metadata',
            canonicalSlug: 'legacy-optional-fields-service',
            socialImage: 'media:missing-legacy-social',
          },
        },
      ],
    });
    const service = new ContentService({ contentRepository: repo });

    const result = service.saveService({
      id: 'svc-legacy-invalid-optionals',
      overviewDescription: 'Safe minor copy edit from CMS.',
    });

    expect(result.ok).toBe(true);
    expect(result.service.overviewDescription).toBe('Safe minor copy edit from CMS.');
    expect(result.service.iconLikeAsset).toBe('media:missing-legacy-icon');
    expect(result.service.seo.socialImage).toBe('media:missing-legacy-social');
  });

  it('still rejects invalid optional media fields when explicitly provided on update', () => {
    const service = new ContentService({ contentRepository: new MemoryContentRepository() });
    const created = service.saveService({
      id: 'svc-update-optional-validation',
      title: 'Service Update Optional Validation',
      slug: 'service-update-optional-validation',
      routeSlug: 'service-update-optional-validation',
      description: 'Description',
      icon: 'palette',
      color: 'from-[#00b3e8] to-[#00c0e8]',
      features: ['Feature one'],
      status: 'draft',
    });
    expect(created.ok).toBe(true);

    const invalid = service.saveService({
      id: 'svc-update-optional-validation',
      iconLikeAsset: 'media:missing-update-icon',
    });

    expect(invalid.ok).toBe(false);
    expect(invalid.error.code).toBe('SERVICE_VALIDATION_ERROR');
    expect(invalid.error.details.field).toBe('iconLikeAsset');
  });

  it('accepts unchanged legacy optional media fields even when CMS resends them on update', () => {
    const repo = new MemoryContentRepository({
      services: [
        {
          id: 'svc-legacy-unchanged-media',
          title: 'Legacy Unchanged Media Service',
          slug: 'legacy-unchanged-media-service',
          routeSlug: 'legacy-unchanged-media-service',
          description: 'Legacy service still renders.',
          icon: 'palette',
          color: 'from-[#00b3e8] to-[#00c0e8]',
          features: ['Legacy feature'],
          status: 'published',
          iconLikeAsset: 'media:missing-legacy-icon',
        },
      ],
    });
    const service = new ContentService({ contentRepository: repo });

    const result = service.saveService({
      id: 'svc-legacy-unchanged-media',
      iconLikeAsset: 'media:missing-legacy-icon',
      overviewDescription: 'Updated another field only.',
    });

    expect(result.ok).toBe(true);
    expect(result.service.iconLikeAsset).toBe('media:missing-legacy-icon');
    expect(result.service.overviewDescription).toBe('Updated another field only.');
  });

  it('normalizes legacy iconLikeAsset aliases into canonical media references', () => {
    const service = new ContentService({ contentRepository: new MemoryContentRepository() });
    const created = service.saveService({
      id: 'svc-legacy-alias-icon',
      title: 'Service Legacy Alias Icon',
      slug: 'service-legacy-alias-icon',
      routeSlug: 'service-legacy-alias-icon',
      description: 'Description',
      icon: 'palette',
      color: 'from-[#00b3e8] to-[#00c0e8]',
      features: ['Feature one'],
      status: 'draft',
      iconLikeAsset: 'asset:legacy-icon-id',
    });

    expect(created.ok).toBe(true);
    expect(created.service.iconLikeAsset).toBe('media:legacy-icon-id');
  });

  it('keeps existing optional values when update payload sends empty strings/arrays', () => {
    const service = new ContentService({ contentRepository: new MemoryContentRepository() });
    const created = service.saveService({
      id: 'svc-empty-merge',
      title: 'Service Empty Merge',
      slug: 'service-empty-merge',
      routeSlug: 'service-empty-merge',
      description: 'Original description',
      icon: 'palette',
      color: 'from-[#00b3e8] to-[#00c0e8]',
      features: ['Feature one'],
      status: 'draft',
      ctaTitle: 'Initial CTA title',
      processSteps: ['Step 1'],
    });
    expect(created.ok).toBe(true);

    const update = service.saveService({
      id: 'svc-empty-merge',
      ctaTitle: '   ',
      processSteps: [],
    });

    expect(update.ok).toBe(true);
    expect(update.service.ctaTitle).toBe('Initial CTA title');
    expect(update.service.processSteps).toEqual(['Step 1']);
  });

  it('preserves existing values when update payload omits non-critical fields', () => {
    const service = new ContentService({ contentRepository: new MemoryContentRepository() });
    const created = service.saveService({
      id: 'svc-preserve',
      title: 'Service Preserve',
      slug: 'service-preserve',
      routeSlug: 'service-preserve',
      description: 'Description to preserve',
      icon: 'palette',
      color: 'from-[#00b3e8] to-[#00c0e8]',
      features: ['Feature one'],
      status: 'draft',
      ctaTitle: 'CTA initial',
    });
    expect(created.ok).toBe(true);

    const update = service.saveService({
      id: 'svc-preserve',
      title: 'Service Preserve Updated',
    });

    expect(update.ok).toBe(true);
    expect(update.service.description).toBe('Description to preserve');
    expect(update.service.features).toEqual(['Feature one']);
    expect(update.service.ctaTitle).toBe('CTA initial');
    expect(update.service.title).toBe('Service Preserve Updated');
  });

  it('still enforces required create fields and returns field-level validation details', () => {
    const service = new ContentService({ contentRepository: new MemoryContentRepository() });
    const result = service.saveService({
      id: 'svc-invalid-create',
      title: 'Invalid create',
      slug: 'invalid-create',
      routeSlug: 'invalid-create',
      icon: 'palette',
      color: 'from-[#00b3e8] to-[#00c0e8]',
      features: [],
      status: 'draft',
    });

    expect(result.ok).toBe(false);
    expect(result.error.code).toBe('SERVICE_VALIDATION_ERROR');
    expect(result.error.details.field).toBe('description');
    expect(result.error.message).toContain('description is required on create');
  });
});

describe('ContentService production hardening', () => {

  it('normalizes blog payloads with optional fields omitted and keeps them publishable', () => {
    const service = new ContentService({ contentRepository: new MemoryContentRepository() });

    const result = service.saveBlogPost({
      id: 'blog-minimal-server',
      title: 'Blog minimal serveur',
      slug: '',
      excerpt: '',
      content: '',
      author: '',
      authorRole: '',
      category: '',
      tags: [],
      publishedDate: '',
      readTime: '',
      featuredImage: 'blog minimal image',
      images: [],
      status: 'published',
    });

    expect(result.ok).toBe(false);
    expect(result.error.code).toBe('BLOG_INVALID_STATUS_TRANSITION');

    const draft = service.saveBlogPost({
      id: 'blog-minimal-server',
      title: 'Blog minimal serveur',
      slug: '',
      excerpt: '',
      content: '',
      author: '',
      authorRole: '',
      category: '',
      tags: [],
      publishedDate: '',
      readTime: '',
      featuredImage: 'blog minimal image',
      images: [],
      status: 'draft',
    });

    expect(draft.ok).toBe(true);
    expect(draft.post.excerpt.length).toBeGreaterThan(0);
    expect(draft.post.content.length).toBeGreaterThan(0);
  });

  it('rejects blog payload with invalid date or dangling media reference', () => {
    const service = new ContentService({ contentRepository: new MemoryContentRepository() });

    const result = service.saveBlogPost({
      id: 'blog-invalid',
      title: 'Blog invalide',
      slug: 'blog-invalide',
      excerpt: 'Extrait',
      content: 'Contenu',
      author: 'Auteur',
      authorRole: 'Role',
      category: 'Cat',
      tags: [],
      publishedDate: 'not-a-date',
      readTime: '4 min',
      featuredImage: 'media:missing',
      images: [],
      status: 'draft',
    });

    expect(result.ok).toBe(false);
    expect(result.error.code).toBe('BLOG_VALIDATION_ERROR');
  });


  it('rejects blog payload when seo social image media reference is invalid', () => {
    const service = new ContentService({ contentRepository: new MemoryContentRepository() });

    const result = service.saveBlogPost({
      id: 'blog-invalid-seo-media',
      title: 'Blog SEO invalide',
      slug: 'blog-seo-invalide',
      excerpt: 'Extrait',
      content: 'Contenu',
      author: 'Auteur',
      authorRole: 'Role',
      category: 'Cat',
      tags: [],
      publishedDate: '2024-01-01T00:00:00.000Z',
      readTime: '4 min',
      featuredImage: 'blog article image',
      images: [],
      status: 'draft',
      seo: {
        socialImage: 'media:missing-seo',
      },
    });

    expect(result.ok).toBe(false);
    expect(result.error.code).toBe('BLOG_VALIDATION_ERROR');
  });

  it('enforces service icon and color whitelist', () => {
    const service = new ContentService({ contentRepository: new MemoryContentRepository() });

    const invalid = service.saveService({
      id: 'service-invalid',
      title: 'Service invalide',
      slug: 'service-invalide',
      description: 'Description',
      icon: 'rocket',
      color: 'red',
      features: ['Feature'],
      status: 'published',
    });

    expect(invalid.ok).toBe(false);
    expect(invalid.error.code).toBe('SERVICE_VALIDATION_ERROR');
  });


  it('enforces service routeSlug contract and icon-like media reference when provided', () => {
    const service = new ContentService({ contentRepository: new MemoryContentRepository() });

    const invalid = service.saveService({
      id: 'service-invalid-route',
      title: 'Service invalide route',
      slug: 'service-invalide-route',
      routeSlug: 'invalid route slug',
      description: 'Description',
      icon: 'palette',
      iconLikeAsset: 'media:missing',
      color: 'from-[#00b3e8] to-[#00c0e8]',
      features: ['Feature'],
      status: 'published',
    });

    expect(invalid.ok).toBe(false);
    expect(invalid.error.code).toBe('SERVICE_VALIDATION_ERROR');
  });

  it('persists home content but rejects invalid aboutImage media references', () => {
    const service = new ContentService({ contentRepository: new MemoryContentRepository() });
    const baseHomePayload = service.getPageContent().home;

    const rejected = service.savePageContent({
      home: {
        ...baseHomePayload,
        heroBadge: 'Badge',
        heroTitleLine1: 'Line 1',
        heroTitleLine2: 'Line 2',
        heroDescription: 'Description',
        heroPrimaryCtaLabel: 'CTA 1',
        heroSecondaryCtaLabel: 'CTA 2',
        aboutBadge: 'About',
        aboutTitle: 'Title',
        aboutParagraphOne: 'P1',
        aboutParagraphTwo: 'P2',
        aboutImage: 'media:missing',
        servicesIntroTitle: 'Services',
        servicesIntroSubtitle: 'Subtitle',
      },
    });
    expect(rejected.ok).toBe(false);
    expect(rejected.error.code).toBe('PAGE_CONTENT_VALIDATION_ERROR');

    service.saveMediaFile({
      id: 'media-home',
      name: 'about.jpg',
      type: 'image',
      url: 'https://example.com/about.jpg',
      thumbnailUrl: 'https://example.com/about.jpg',
      size: 120,
      uploadedDate: new Date().toISOString(),
      uploadedBy: 'admin',
      alt: 'about',
      tags: [],
    });

    const accepted = service.savePageContent({
      home: {
        ...baseHomePayload,
        heroBadge: 'Badge',
        heroTitleLine1: 'Line 1',
        heroTitleLine2: 'Line 2',
        heroDescription: 'Description',
        heroPrimaryCtaLabel: 'CTA 1',
        heroSecondaryCtaLabel: 'CTA 2',
        aboutBadge: 'About',
        aboutTitle: 'Title',
        aboutParagraphOne: 'P1',
        aboutParagraphTwo: 'P2',
        aboutImage: 'media:media-home',
        servicesIntroTitle: 'Services',
        servicesIntroSubtitle: 'Subtitle',
      },
    });
    expect(accepted.ok).toBe(true);
    expect(service.getPageContent().home.aboutImage).toBe('media:media-home');
  });

  it('rejects invalid homepage CTA links and keeps normalized defaults for missing new fields', () => {
    const service = new ContentService({ contentRepository: new MemoryContentRepository() });
    const legacyPayload = {
      heroBadge: 'Legacy Badge',
      heroTitleLine1: 'Legacy line 1',
      heroTitleLine2: 'Legacy line 2',
      heroDescription: 'Legacy description',
      heroPrimaryCtaLabel: 'Legacy CTA 1',
      heroSecondaryCtaLabel: 'Legacy CTA 2',
      aboutBadge: 'Legacy About',
      aboutTitle: 'Legacy title',
      aboutParagraphOne: 'Legacy paragraph one',
      aboutParagraphTwo: 'Legacy paragraph two',
      aboutImage: '',
      servicesIntroTitle: 'Legacy services',
      servicesIntroSubtitle: 'Legacy subtitle',
    };

    const savedLegacy = service.savePageContent({ home: legacyPayload });
    expect(savedLegacy.ok).toBe(true);
    expect(savedLegacy.pageContent.home.heroPrimaryCtaHref).toBe('#services');
    expect(savedLegacy.pageContent.home.portfolioTitle).toBe('Nos derniers projets');
    expect(savedLegacy.pageContent.home.heroBackgroundItems).toEqual([]);
    expect(savedLegacy.pageContent.home.heroBackgroundIntervalMs).toBe(6000);

    const invalidHref = service.savePageContent({
      home: {
        ...savedLegacy.pageContent.home,
        heroPrimaryCtaHref: 'ftp://bad-link',
      },
    });
    expect(invalidHref.ok).toBe(false);
    expect(invalidHref.error.code).toBe('PAGE_CONTENT_VALIDATION_ERROR');
  });

  it('persists hero background media collection and rejects invalid slideshow config', () => {
    const service = new ContentService({ contentRepository: new MemoryContentRepository() });
    service.saveMediaFile({
      id: 'hero-bg-1',
      name: 'hero-bg-1.jpg',
      type: 'image',
      url: 'https://example.com/hero-bg-1.jpg',
      thumbnailUrl: 'https://example.com/hero-bg-1.jpg',
      size: 120,
      uploadedDate: new Date().toISOString(),
      uploadedBy: 'admin',
      alt: 'hero',
      tags: [],
    });

    const base = service.getPageContent().home;
    const rejected = service.savePageContent({
      home: {
        ...base,
        heroBackgroundItems: [
          { id: 'slide-1', label: 'Slide 1', media: 'media:missing', alt: 'Alt', overlayOpacity: 0.4, focalPoint: 'center' },
        ],
      },
    });
    expect(rejected.ok).toBe(false);
    expect(rejected.error.code).toBe('PAGE_CONTENT_VALIDATION_ERROR');

    const accepted = service.savePageContent({
      home: {
        ...base,
        heroBackgroundItems: [
          { id: 'slide-1', sortOrder: 2, label: 'Slide 1', title: 'Slide headline', description: 'Slide body', ctaLabel: 'Voir le projet', ctaHref: '/projects', media: 'media:hero-bg-1', alt: 'Alt', overlayOpacity: 0.4, focalPoint: 'center' },
        ],
        heroBackgroundRotationEnabled: true,
        heroBackgroundAutoplay: true,
        heroBackgroundIntervalMs: 5000,
        heroBackgroundTransitionStyle: 'fade',
        heroBackgroundOverlayOpacity: 0.35,
      },
    });
    expect(accepted.ok).toBe(true);
    expect(service.getPageContent().home.heroBackgroundItems).toHaveLength(1);
    expect(service.getPageContent().home.heroBackgroundItems[0].ctaHref).toBe('/projects');
    expect(service.getPageContent().home.heroBackgroundItems[0].sortOrder).toBe(2);
    expect(service.findMediaReferences('hero-bg-1').some((entry) => entry.field.includes('heroBackgroundItems'))).toBe(true);
  });

  it('rejects hero slide CTA links with invalid protocols', () => {
    const service = new ContentService({ contentRepository: new MemoryContentRepository() });
    service.saveMediaFile({
      id: 'hero-bg-cta',
      name: 'hero-bg-cta.jpg',
      type: 'image',
      url: 'https://example.com/hero-bg-cta.jpg',
      thumbnailUrl: 'https://example.com/hero-bg-cta.jpg',
      size: 120,
      uploadedDate: new Date().toISOString(),
      uploadedBy: 'admin',
      alt: 'hero',
      tags: [],
    });

    const base = service.getPageContent().home;
    const result = service.savePageContent({
      home: {
        ...base,
        heroBackgroundItems: [
          { id: 'slide-cta', label: 'Slide CTA', media: 'media:hero-bg-cta', ctaHref: 'ftp://invalid-link' },
        ],
      },
    });

    expect(result.ok).toBe(false);
    expect(result.error.code).toBe('PAGE_CONTENT_VALIDATION_ERROR');
  });

  it('persists video-only hero slides and reloads them as valid entries', () => {
    const service = new ContentService({ contentRepository: new MemoryContentRepository() });
    service.saveMediaFile({
      id: 'hero-bg-video',
      name: 'hero-bg-video.mp4',
      type: 'video',
      url: 'https://example.com/hero-bg-video.mp4',
      thumbnailUrl: 'https://example.com/hero-bg-video.jpg',
      size: 120,
      uploadedDate: new Date().toISOString(),
      uploadedBy: 'admin',
      alt: 'hero video',
      tags: [],
    });

    const base = service.getPageContent().home;
    const result = service.savePageContent({
      home: {
        ...base,
        heroBackgroundItems: [
          { id: 'slide-video', sortOrder: 0, label: 'Video slide', type: 'video', media: '', videoMedia: 'media:hero-bg-video', alt: 'Video alt' },
        ],
      },
    });

    expect(result.ok).toBe(true);
    const saved = service.getPageContent().home.heroBackgroundItems;
    expect(saved).toHaveLength(1);
    expect(saved[0].type).toBe('video');
    expect(saved[0].videoMedia).toBe('media:hero-bg-video');
  });

  it('returns media usage references to support safe delete guardrails', () => {
    const service = new ContentService({
      contentRepository: new MemoryContentRepository({
        mediaFiles: [
          {
            id: 'asset-1',
            name: 'asset.jpg',
            type: 'image',
            url: 'https://example.com/asset.jpg',
            thumbnailUrl: 'https://example.com/asset.jpg',
            size: 10,
            uploadedDate: '2024-01-01T00:00:00.000Z',
            uploadedBy: 'admin',
            tags: [],
          },
        ],
        blogPosts: [
          {
            id: 'post-1',
            title: 'Post',
            slug: 'post',
            excerpt: 'Excerpt',
            content: 'Content',
            author: 'Author',
            authorRole: 'Role',
            category: 'Cat',
            tags: [],
            publishedDate: '2024-01-01T00:00:00.000Z',
            readTime: '5 min',
            featuredImage: 'media:asset-1',
            images: [],
            status: 'draft',
            seo: { socialImage: 'media:asset-1' },
          },
        ],
      }),
    });

    const refs = service.findMediaReferences('asset-1');
    expect(refs.length).toBeGreaterThan(0);
    expect(refs.some((ref) => ref.domain === 'blog')).toBe(true);
  });

  it('archives media instead of hard deleting and excludes archived media from active listings', () => {
    const service = new ContentService({
      contentRepository: new MemoryContentRepository({
        mediaFiles: [
          {
            id: 'asset-archive-1',
            name: 'asset.jpg',
            type: 'image',
            url: 'https://example.com/asset.jpg',
            thumbnailUrl: 'https://example.com/asset.jpg',
            size: 10,
            uploadedDate: '2024-01-01T00:00:00.000Z',
            uploadedBy: 'admin',
            tags: [],
          },
        ],
      }),
    });

    const archived = service.archiveMediaFile('asset-archive-1');
    expect(archived.ok).toBe(true);
    expect(archived.mediaFile.archivedAt).toBeTruthy();
    expect(service.listMediaFiles().some((entry) => entry.id === 'asset-archive-1')).toBe(false);
    expect(service.listMediaFiles({ includeArchived: true }).some((entry) => entry.id === 'asset-archive-1')).toBe(true);
  });

  it('blocks media archive when used by published critical content and allows archive for draft-only references', () => {
    const service = new ContentService({
      contentRepository: new MemoryContentRepository({
        mediaFiles: [
          {
            id: 'asset-governance-1',
            name: 'asset.jpg',
            type: 'image',
            url: 'https://example.com/asset.jpg',
            thumbnailUrl: 'https://example.com/asset.jpg',
            size: 10,
            uploadedDate: '2024-01-01T00:00:00.000Z',
            uploadedBy: 'admin',
            tags: [],
          },
        ],
        blogPosts: [
          {
            id: 'post-published',
            title: 'Post Published',
            slug: 'post-published',
            excerpt: 'Excerpt',
            content: 'Content',
            author: 'Author',
            authorRole: 'Role',
            category: 'Cat',
            tags: [],
            publishedDate: '2024-01-01T00:00:00.000Z',
            readTime: '5 min',
            featuredImage: 'media:asset-governance-1',
            images: [],
            status: 'published',
          },
          {
            id: 'post-draft',
            title: 'Post Draft',
            slug: 'post-draft',
            excerpt: 'Excerpt',
            content: 'Content',
            author: 'Author',
            authorRole: 'Role',
            category: 'Cat',
            tags: [],
            publishedDate: '2024-01-01T00:00:00.000Z',
            readTime: '5 min',
            featuredImage: 'media:asset-governance-1',
            images: [],
            status: 'draft',
          },
        ],
      }),
    });

    const impact = service.getMediaUsageImpact('asset-governance-1');
    expect(impact.okToArchive).toBe(false);
    expect(impact.summary.published).toBeGreaterThan(0);
    expect(service.archiveMediaFile('asset-governance-1').ok).toBe(false);

    const publishToDraft = service.transitionBlogStatus('post-published', 'draft');
    expect(publishToDraft.ok).toBe(true);
    const archived = service.archiveMediaFile('asset-governance-1');
    expect(archived.ok).toBe(true);
  });

  it('restores archived media to active state', () => {
    const service = new ContentService({
      contentRepository: new MemoryContentRepository({
        mediaFiles: [
          {
            id: 'asset-restore-1',
            name: 'asset.jpg',
            type: 'image',
            url: 'https://example.com/asset.jpg',
            thumbnailUrl: 'https://example.com/asset.jpg',
            size: 10,
            uploadedDate: '2024-01-01T00:00:00.000Z',
            uploadedBy: 'admin',
            tags: [],
            archivedAt: '2024-01-02T00:00:00.000Z',
          },
        ],
      }),
    });

    const restored = service.restoreMediaFile('asset-restore-1');
    expect(restored.ok).toBe(true);
    expect(restored.restored).toBe(true);
    expect(restored.mediaFile.archivedAt).toBeNull();
  });

  it('tracks references across services and settings brand media fields', () => {
    const service = new ContentService({
      contentRepository: new MemoryContentRepository({
        mediaFiles: [
          {
            id: 'asset-settings-1',
            name: 'asset.jpg',
            type: 'image',
            url: 'https://example.com/asset.jpg',
            thumbnailUrl: 'https://example.com/asset.jpg',
            size: 10,
            uploadedDate: '2024-01-01T00:00:00.000Z',
            uploadedBy: 'admin',
            tags: [],
          },
        ],
        services: [
          {
            id: 'service-1',
            title: 'Service',
            slug: 'service',
            routeSlug: 'service',
            description: 'Description',
            icon: 'palette',
            iconLikeAsset: 'media:asset-settings-1',
            color: 'from-[#00b3e8] to-[#00c0e8]',
            features: ['Feature'],
            status: 'published',
            featured: false,
          },
        ],
        settings: {
          siteSettings: {
            siteTitle: 'SMOVE',
            supportEmail: 'contact@smove.africa',
            brandMedia: {
              logo: 'media:asset-settings-1',
            },
          },
          operationalSettings: {
            instantPublishing: true,
          },
        },
      }),
    });

    const refs = service.findMediaReferences('asset-settings-1');
    expect(refs.some((ref) => ref.domain === 'service')).toBe(true);
    expect(refs.some((ref) => ref.domain === 'settings')).toBe(true);
  });

  it('normalizes legacy flat settings into canonical nested settings while preserving compatibility aliases', () => {
    const service = new ContentService({ contentRepository: new MemoryContentRepository() });

    const saved = service.saveSettings({
      siteTitle: 'SMOVE Pro',
      supportEmail: 'ops@smove.africa',
      instantPublishing: false,
      taxonomy: {
        blog: {
          managedCategories: ['Branding', 'branding', ' Web '],
          managedTags: ['React', 'react', 'CMS'],
          enforceManagedTags: true,
        },
      },
    });

    expect(saved.ok).toBe(true);
    expect(saved.settings.siteSettings.siteTitle).toBe('SMOVE Pro');
    expect(saved.settings.siteSettings.supportEmail).toBe('ops@smove.africa');
    expect(saved.settings.operationalSettings.instantPublishing).toBe(false);
    expect(saved.settings.taxonomySettings.blog.managedCategories).toEqual(['Branding', 'Web']);
    expect(saved.settings.taxonomySettings.blog.managedTags).toEqual(['React', 'CMS']);
    expect(saved.settings.siteTitle).toBe('SMOVE Pro');
    expect(saved.settings.supportEmail).toBe('ops@smove.africa');
    expect(saved.settings.instantPublishing).toBe(false);
    expect(saved.settings.taxonomy.blog.managedCategories).toEqual(['Branding', 'Web']);
  });

  it('reports invalid media references in synchronization diagnostics', () => {
    const service = new ContentService({
      contentRepository: new MemoryContentRepository({
        services: [
          {
            id: 'service-invalid-media',
            title: 'Service',
            slug: 'service-invalid-media',
            routeSlug: 'service-invalid-media',
            description: 'Description',
            icon: 'palette',
            iconLikeAsset: 'media:missing-media',
            color: 'from-[#00b3e8] to-[#00c0e8]',
            features: ['Feature'],
            status: 'published',
            featured: false,
          },
        ],
      }),
    });

    const diagnostics = service.getSyncDiagnostics();
    expect(diagnostics.summary.invalidMediaReferenceCount).toBeGreaterThan(0);
    expect(diagnostics.invalidMediaReferences.some((entry) => entry.mediaId === 'missing-media')).toBe(true);
  });

  it('normalizes blog taxonomy values against managed categories and tags', () => {
    const service = new ContentService({ contentRepository: new MemoryContentRepository() });

    const saved = service.saveBlogPost({
      id: 'taxonomy-post-1',
      title: 'Taxonomie',
      slug: 'taxonomie',
      excerpt: 'Résumé',
      content: 'Contenu',
      author: 'Auteur',
      authorRole: 'Role',
      category: 'branding',
      tags: ['react', 'unknown-tag', 'React'],
      publishedDate: '2024-01-01',
      readTime: '2 min',
      featuredImage: 'image',
      images: [],
      status: 'draft',
    });

    expect(saved.ok).toBe(true);
    expect(saved.post.category).toBe('Branding');
    expect(saved.post.tags).toEqual(['React']);
  });

  it('tracks settings history and supports rollback baseline', () => {
    const service = new ContentService({ contentRepository: new MemoryContentRepository() });
    const first = service.saveSettings({
      siteSettings: { siteTitle: 'SMOVE A', supportEmail: 'a@smove.africa' },
      operationalSettings: { instantPublishing: true },
    }, { changedBy: 'user-1' });
    const second = service.saveSettings({
      siteSettings: { siteTitle: 'SMOVE B', supportEmail: 'b@smove.africa' },
      operationalSettings: { instantPublishing: false },
    }, { changedBy: 'user-2' });

    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);

    const history = service.listSettingsHistory(10);
    expect(history.length).toBeGreaterThanOrEqual(2);
    expect(history[0].changedBy).toBe('user-2');

    const rollback = service.rollbackSettings(history[1].versionId, { changedBy: 'admin-1' });
    expect(rollback.ok).toBe(true);
    expect(rollback.settings.siteSettings.siteTitle).toBe('SMOVE A');
    expect(rollback.settings.siteTitle).toBe('SMOVE A');
    expect(rollback.settings.operationalSettings.instantPublishing).toBe(true);
  });

  it('accepts service process fields in CMS service payload', () => {
    const service = new ContentService({ contentRepository: new MemoryContentRepository() });
    const saved = service.saveService({
      id: 'service-process-1',
      title: 'Service Process',
      slug: 'service-process',
      routeSlug: 'service-process',
      description: 'Description',
      icon: 'palette',
      color: 'from-[#00b3e8] to-[#00c0e8]',
      features: ['Feature'],
      processTitle: 'Notre Process',
      processSteps: ['Découverte', 'Livraison'],
      status: 'published',
      featured: false,
    });

    expect(saved.ok).toBe(true);
    expect(saved.service.processTitle).toBe('Notre Process');
    expect(saved.service.processSteps).toEqual(['Découverte', 'Livraison']);
    expect(saved.service.seo.canonicalSlug).toBe('service-process');
  });

  it('blocks publishing a service when route or CTA contract is invalid', () => {
    const service = new ContentService({ contentRepository: new MemoryContentRepository() });
    const saved = service.saveService({
      id: 'service-invalid-publish',
      title: 'Service invalide',
      slug: 'service-invalide',
      routeSlug: 'service-invalide',
      description: 'Description suffisante pour un service publié.',
      icon: 'palette',
      color: 'from-[#00b3e8] to-[#00c0e8]',
      features: ['Feature'],
      ctaPrimaryHref: 'mailto:contact@smove.africa',
      status: 'published',
      featured: false,
    });

    expect(saved.ok).toBe(false);
    expect(saved.error.code).toBe('SERVICE_NOT_PUBLISHABLE');
  });

  it('builds a content health summary for operator dashboards and launch readiness', () => {
    const service = new ContentService({
      contentRepository: new MemoryContentRepository({
        mediaFiles: [
          {
            id: 'asset-health-1',
            name: 'asset.jpg',
            type: 'image',
            url: 'https://example.com/asset.jpg',
            thumbnailUrl: 'https://example.com/asset.jpg',
            size: 10,
            uploadedDate: '2024-01-01T00:00:00.000Z',
            uploadedBy: 'admin',
            alt: '',
            tags: [],
          },
        ],
        blogPosts: [
          {
            id: 'post-health-1',
            title: 'Post',
            slug: 'post-health-1',
            excerpt: 'Excerpt',
            content: 'Content',
            author: 'Author',
            authorRole: 'Role',
            category: 'Cat',
            tags: [],
            publishedDate: '2024-01-01T00:00:00.000Z',
            readTime: '5 min',
            featuredImage: 'media:asset-health-1',
            images: [],
            status: 'published',
          },
        ],
      }),
    });

    const summary = service.getContentHealthSummary();
    expect(summary.publication.blog.published).toBeGreaterThan(0);
    expect(summary.quality.mediaMissingAlt).toBeGreaterThan(0);
    expect(summary.quality.unresolvedMediaReferences).toBeGreaterThanOrEqual(0);
    expect(summary.quality.unresolvedPublishedCriticalMedia.blogCard).toBeGreaterThanOrEqual(0);
    expect(summary.quality.unresolvedPublishedCriticalMedia.projectCard).toBeGreaterThanOrEqual(0);
    expect(summary.quality.unresolvedPublishedCriticalMedia.projectHero).toBeGreaterThanOrEqual(0);
    expect(summary.quality.unresolvedPublishedCriticalMedia.projectGallery).toBeGreaterThanOrEqual(0);
    expect(summary.mediaRolePresets).toContain('heroImage');
    expect(summary.launchReadiness.blockers.length).toBeGreaterThan(0);
    expect(summary.launchReadiness.summary.blockerCount).toBeGreaterThanOrEqual(0);
    expect((summary.releaseReadinessChecks || []).length).toBeGreaterThan(0);
  });

  it('flags unresolved published blog/project critical media with archived-vs-missing diagnostics', () => {
    const service = new ContentService({
      contentRepository: new MemoryContentRepository({
        mediaFiles: [
          {
            id: 'asset-active-1',
            name: 'active.jpg',
            type: 'image',
            url: 'https://example.com/active.jpg',
            thumbnailUrl: 'https://example.com/active.jpg',
            size: 10,
            uploadedDate: '2024-01-01T00:00:00.000Z',
            uploadedBy: 'admin',
            alt: 'active',
            tags: [],
          },
          {
            id: 'asset-archived-1',
            name: 'archived.jpg',
            type: 'image',
            url: 'https://example.com/archived.jpg',
            thumbnailUrl: 'https://example.com/archived.jpg',
            size: 10,
            uploadedDate: '2024-01-01T00:00:00.000Z',
            uploadedBy: 'admin',
            alt: 'archived',
            tags: [],
            archivedAt: '2025-01-01T00:00:00.000Z',
          },
        ],
        blogPosts: [
          {
            id: 'blog-published-1',
            title: 'Blog broken card',
            slug: 'blog-broken-card',
            excerpt: 'Excerpt',
            content: 'Content',
            author: 'Author',
            authorRole: 'Role',
            category: 'Cat',
            tags: [],
            publishedDate: '2024-01-01T00:00:00.000Z',
            readTime: '5 min',
            featuredImage: 'media:asset-missing-1',
            images: [],
            status: 'published',
          },
        ],
        projects: [
          {
            id: 'project-published-1',
            title: 'Project broken media',
            slug: 'project-broken-media',
            summary: 'Résumé suffisamment long pour publication valide.',
            client: 'Client',
            category: 'Web',
            year: '2026',
            description: 'Description suffisamment longue pour être valide côté publication.',
            challenge: 'Challenge',
            solution: 'Solution',
            results: [],
            tags: [],
            featuredImage: 'media:asset-archived-1',
            mainImage: 'media:asset-missing-hero',
            images: ['media:asset-missing-gallery'],
            mediaRoles: {
              cardImage: 'media:asset-archived-1',
              heroImage: 'media:asset-missing-hero',
              galleryImages: ['media:asset-missing-gallery'],
            },
            status: 'published',
          },
        ],
      }),
    });

    const summary = service.getContentHealthSummary();
    expect(summary.quality.unresolvedPublishedCriticalMedia.blogCard).toBeGreaterThan(0);
    expect(summary.quality.unresolvedPublishedCriticalMedia.projectCard).toBeGreaterThan(0);
    expect(summary.quality.unresolvedPublishedCriticalMedia.projectHero).toBeGreaterThan(0);
    expect(summary.quality.unresolvedPublishedCriticalMedia.projectGallery).toBeGreaterThan(0);
    expect(summary.quality.unresolvedPublishedCriticalMedia.archivedReferencedByPublished).toBeGreaterThan(0);
  });

  it('reports route collisions and actionable top issues in readiness summary', () => {
    const service = new ContentService({
      contentRepository: new MemoryContentRepository({
        services: [
          {
            id: 'service-a',
            title: 'Service A',
            slug: 'service-a',
            routeSlug: 'collision-route',
            description: 'Description complète.',
            icon: 'palette',
            color: 'from-[#00b3e8] to-[#00c0e8]',
            features: ['Feature A'],
            status: 'published',
            featured: false,
          },
          {
            id: 'service-b',
            title: 'Service B',
            slug: 'service-b',
            routeSlug: 'collision-route',
            description: 'Description complète.',
            icon: 'code',
            color: 'from-[#00b3e8] to-[#00c0e8]',
            features: ['Feature B'],
            status: 'published',
            featured: false,
          },
        ],
      }),
    });

    const summary = service.getContentHealthSummary();
    expect(summary.quality.routeCollisions).toBeGreaterThan(0);
    expect(summary.launchReadiness.blockers).toContain('service_route_collisions');
    expect((summary.launchReadiness.topIssues || []).length).toBeGreaterThan(0);
  });
});

describe('ContentService analytics tracking', () => {
  it('records normalized analytics events and exposes conversion summary', () => {
    const service = new ContentService({ contentRepository: new MemoryContentRepository() });

    service.recordAnalyticsEvent({ name: 'cta_clicked', route: 'home', ctaId: 'hero_primary', targetRoute: '#/services' }, { source: 'public' });
    service.recordAnalyticsEvent({ name: 'cta_clicked', route: 'service-detail', ctaId: 'service_contact', targetRoute: '#/contact' }, { source: 'public' });
    service.recordAnalyticsEvent({ name: 'contact_form_submitted', route: 'home', success: true }, { source: 'public' });

    const summary = service.getPublicAnalyticsSummary();

    expect(summary.eventsLast1000).toBe(3);
    expect(summary.byName.cta_clicked).toBe(2);
    expect(summary.conversionPath.homeToDiscovery).toBeGreaterThan(0);
    expect(summary.conversionPath.discoveryToContact).toBeGreaterThan(0);
    expect(summary.conversionPath.contactFormSubmissions).toBe(1);
    expect(summary.topRoutes.length).toBeGreaterThan(0);
  });

  it('rejects analytics events without names', () => {
    const service = new ContentService({ contentRepository: new MemoryContentRepository() });
    const result = service.recordAnalyticsEvent({ route: 'home' });
    expect(result.ok).toBe(false);
    expect(result.error.code).toBe('ANALYTICS_EVENT_INVALID');
  });
});

describe('ContentService ownership and tenant scoping', () => {
  it('scopes content by organization and stamps ownership metadata', () => {
    const service = new ContentService({ contentRepository: new MemoryContentRepository() });

    const created = service.saveService(
      {
        id: 'svc-owned',
        title: 'Owned Service',
        slug: 'owned-service',
        description: 'Description',
        icon: 'palette',
        color: 'from-[#00b3e8] to-[#00c0e8]',
        features: ['Feature'],
        status: 'draft',
      },
      { userId: 'author-1', role: 'author', organizationId: 'org_alpha' },
    );

    expect(created.ok).toBe(true);
    expect(created.service.ownerUserId).toBe('author-1');
    expect(created.service.organizationId).toBe('org_alpha');
    expect(service.listServices({ organizationId: 'org_alpha' }).some((entry) => entry.id === 'svc-owned')).toBe(true);
    expect(service.listServices({ organizationId: 'org_beta' }).some((entry) => entry.id === 'svc-owned')).toBe(false);
  });

  it('prevents authors from editing content they do not own', () => {
    const service = new ContentService({ contentRepository: new MemoryContentRepository() });

    service.saveProject(
      {
        id: 'project-owned',
        title: 'Project Owned',
        slug: 'project-owned',
        client: 'Client',
        category: 'Web',
        year: '2026',
        description: 'Description',
        challenge: 'Challenge',
        solution: 'Solution',
        results: ['Result'],
        tags: ['Tag'],
        mainImage: 'cover',
        featuredImage: 'cover',
        images: ['cover'],
        status: 'draft',
      },
      { userId: 'author-1', role: 'author', organizationId: 'org_alpha' },
    );

    const denied = service.saveProject(
      {
        id: 'project-owned',
        title: 'Project Hijacked',
        slug: 'project-owned',
        client: 'Client',
        category: 'Web',
        year: '2026',
        description: 'Description',
        challenge: 'Challenge',
        solution: 'Solution',
        results: ['Result'],
        tags: ['Tag'],
        mainImage: 'cover',
        featuredImage: 'cover',
        images: ['cover'],
        status: 'draft',
      },
      { userId: 'author-2', role: 'author', organizationId: 'org_alpha' },
    );

    expect(denied.ok).toBe(false);
    expect(denied.error.code).toBe('FORBIDDEN_OWNERSHIP');
  });
});

describe('ContentService canonical media registration', () => {
  it('auto-registers blog featured media URLs into media library and stores media references', () => {
    const service = new ContentService({ contentRepository: new MemoryContentRepository({ blogPosts: [] }) });

    const created = service.saveBlogPost({
      id: 'blog-media-auto-1',
      title: 'Blog Auto Media',
      slug: 'blog-auto-media',
      excerpt: 'Excerpt',
      content: 'Content',
      author: 'Author',
      authorRole: 'Role',
      category: 'Communication',
      tags: ['media'],
      publishedDate: '2026-01-02T00:00:00.000Z',
      readTime: '4 min',
      featuredImage: 'https://cdn.example.com/blog/featured.jpg',
      images: [],
      status: 'draft',
    }, { userId: 'editor-1', role: 'editor', organizationId: 'org_default' });

    expect(created.ok).toBe(true);
    expect(created.post.featuredImage.startsWith('media:')).toBe(true);
    expect(created.post.mediaRoles.cardImage.startsWith('media:')).toBe(true);
    expect(service.listMediaFiles().length).toBe(1);
    expect(service.listMediaFiles()[0].metadata.autoRegisteredByFlow).toBe('blog:featuredImage');
  });

  it('auto-registers project card/hero/gallery images and avoids duplicate media assets for same source', () => {
    const service = new ContentService({ contentRepository: new MemoryContentRepository({ projects: [], mediaFiles: [] }) });

    const payload = {
      id: 'project-media-auto-1',
      title: 'Project Auto Media',
      slug: 'project-auto-media',
      client: 'Client',
      category: 'Web',
      year: '2026',
      description: 'Description',
      challenge: 'Challenge',
      solution: 'Solution',
      results: ['Result'],
      tags: ['Tag'],
      featuredImage: 'https://cdn.example.com/project/card.jpg',
      mainImage: 'https://cdn.example.com/project/hero.jpg',
      images: ['https://cdn.example.com/project/gallery-1.jpg', 'https://cdn.example.com/project/gallery-1.jpg'],
      status: 'draft',
    };
    const first = service.saveProject(payload, { userId: 'editor-1', role: 'editor', organizationId: 'org_default' });
    const second = service.saveProject({ ...payload, title: 'Project Auto Media v2' }, { userId: 'editor-1', role: 'editor', organizationId: 'org_default' });

    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
    expect(first.project.mediaRoles.cardImage.startsWith('media:')).toBe(true);
    expect(first.project.mediaRoles.heroImage.startsWith('media:')).toBe(true);
    expect(first.project.mediaRoles.galleryImages.every((entry) => entry.startsWith('media:'))).toBe(true);

    const files = service.listMediaFiles();
    expect(files.length).toBe(3);
    expect(files[0].variants?.card?.url).toBeTruthy();
    expect(files[0].variants?.hero?.url).toBeTruthy();
    expect(files[0].variants?.social?.url).toBeTruthy();
  });
});
