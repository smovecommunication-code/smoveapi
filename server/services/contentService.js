const {
  SLUG_PATTERN,
  MEDIA_REFERENCE_PREFIX,
  normalizeSlug: normalizeSharedSlug,
  isValidSlug,
  isHttpUrl,
  isValidOptionalHttpUrl,
  isValidContentHref: isValidContentHrefContract,
  isMediaReference: isMediaReferenceContract,
  mediaIdFromReference: mediaIdFromReferenceContract,
  isValidMediaFieldValue,
  requiredTrimmed,
  hasMinTrimmedLength,
  normalizeStringArray,
} = require('../utils/contentContracts');
const { API_ORIGIN } = require('../config/env');
const crypto = require('crypto');

const BLOG_STATUSES = new Set(['draft', 'in_review', 'published', 'archived']);
const MEDIA_TYPES = new Set(['image', 'video', 'document', 'file']);
const PROJECT_STATUSES = new Set(['draft', 'in_review', 'published', 'archived']);
const SERVICE_STATUSES = new Set(['draft', 'published', 'archived']);
const TEAM_STATUSES = new Set(['draft', 'published', 'archived']);
const SERVICE_ICONS = new Set(['palette', 'code', 'megaphone', 'video', 'box']);
const COLOR_GRADIENT_PATTERN = /^from-\[#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})\]\s+to-\[#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})\]$/;
const MEDIA_ROLE_PRESETS = new Set(['cardImage', 'heroImage', 'coverImage', 'socialImage', 'galleryImage', 'iconLikeAsset', 'brandLogo', 'favicon']);
const MANAGED_BLOG_CATEGORIES = ['Développement Web', 'Communication', 'Branding', 'Marketing Digital', 'Innovation', 'Études de cas', 'Non classé'];
const MANAGED_BLOG_TAGS = ['React', 'Web Design', 'Performance', 'Innovation', 'Vidéo', 'Branding', 'Corporate', 'BTP', 'Logo Design', 'Identité Visuelle', 'Food', 'SEO', 'Social Media', 'CMS'];
const DEFAULT_ORGANIZATION_ID = 'org_default';
const MEDIA_VARIANT_KEYS = ['thumbnail', 'card', 'hero', 'social', 'original'];
const HTTP_SCHEME_PATTERN = /^[a-zA-Z][a-zA-Z\d+.-]*:/;
const TEAM_MEMBER_STATE_KEYS = ['teamMembers', 'members', 'team', 'teams', 'staff', 'personnel'];

const defaultHomePageContent = {
  heroBadge: 'Agence de communication',
  heroTitleLine1: 'Donnez du relief',
  heroTitleLine2: 'à votre communication',
  heroDescription:
    'Un hero premium avec animation 3D légère, pour valoriser votre image de marque et présenter vos services avec impact.',
  heroPrimaryCtaLabel: 'Découvrir nos services',
  heroPrimaryCtaHref: '#services',
  heroSecondaryCtaLabel: 'Lancer un projet',
  heroSecondaryCtaHref: '#/contact',
  heroBackgroundItems: [],
  heroBackgroundRotationEnabled: false,
  heroBackgroundAutoplay: true,
  heroBackgroundIntervalMs: 6000,
  heroBackgroundTransitionStyle: 'fade',
  heroBackgroundOverlayOpacity: 0.45,
  heroBackgroundEnable3DEffects: true,
  heroBackgroundEnableParallax: true,
  aboutBadge: 'À PROPOS DE NOUS',
  aboutTitle: 'Innovation & Excellence Digitale',
  aboutParagraphOne:
    "SMOVE Communication est une agence digitale basée en Côte d'Ivoire, spécialisée dans la création de solutions digitales innovantes. Nous accompagnons les entreprises dans leur transformation digitale avec passion et expertise.",
  aboutParagraphTwo:
    'Notre équipe de professionnels talentueux combine créativité, technologie et stratégie pour créer des expériences digitales qui marquent les esprits et génèrent des résultats mesurables.',
  aboutCtaLabel: 'Découvrir notre équipe',
  aboutCtaHref: '#portfolio',
  aboutImage: '',
  servicesIntroTitle: 'Ce que nous faisons',
  servicesIntroSubtitle: 'Des solutions digitales complètes pour propulser votre entreprise vers le succès',
  portfolioBadge: 'PORTFOLIO',
  portfolioTitle: 'Nos derniers projets',
  portfolioSubtitle: 'Découvrez comment nous avons aidé nos clients à atteindre leurs objectifs',
  portfolioCtaLabel: 'Voir tous nos projets',
  portfolioCtaHref: '#projects',
  blogBadge: 'BLOG',
  blogTitle: 'Derniers articles',
  blogSubtitle: 'Actualités, conseils et insights sur le digital',
  blogCtaLabel: 'Voir tous les articles',
  blogCtaHref: '#blog',
  contactTitle: 'Travaillons ensemble',
  contactSubtitle:
    'Vous avez un projet en tête ? Contactez-nous et discutons de la manière dont nous pouvons vous aider à le réaliser.',
  contactSubmitLabel: 'Envoyer le message',
  footer: {
    title: 'SMOVE',
    description: 'Agence de communication digitale spécialisée dans la création de contenu, le développement web et la stratégie digitale.',
    copyright: '© {year} SMOVE Communication. Tous droits réservés.',
    address: "Abidjan, Côte d'Ivoire",
    phone: '+225 XX XX XX XX XX',
    email: 'contact@smove-communication.com',
    quickLinks: [
      { label: 'Accueil', url: '#/' },
      { label: 'À Propos', url: '#about' },
      { label: 'Portfolio', url: '#portfolio' },
      { label: 'Blog', url: '#/blog' },
      { label: 'Contact', url: '#/contact' },
    ],
    cta: {
      title: 'Prêt à lancer votre projet ?',
      text: 'Parlons de vos besoins et construisons une communication qui convertit.',
      buttonLabel: 'Nous contacter',
      buttonUrl: '#/contact',
    },
    newsletter: {
      title: 'Abonnez-vous à la Newsletter',
      text: 'Ne manquez rien de nos offres et informations',
    },
  },
};


const defaultBlogPosts = [
  {
    id: '1',
    title: 'Création de site web pour SMOVE',
    slug: 'creation-site-web-smove',
    excerpt: "SMOVE propose une vision moderne du web africain, tournée vers l'innovation et l'excellence digitale.",
    content:
      "## Introduction\n\nSMOVE Communication révolutionne le paysage digital africain avec sa nouvelle plateforme web. Ce projet ambitieux combine design moderne, performance technique et expérience utilisateur exceptionnelle.",
    author: 'Spencer Tarring',
    authorRole: 'Lead Developer',
    category: 'Développement Web',
    tags: ['React', 'Web Design', 'Performance', 'Innovation'],
    publishedDate: '2024-02-01',
    readTime: '5 min',
    featuredImage: 'modern website design smove platform',
    images: ['web development coding modern'],
    status: 'published',
  },
  {
    id: '2',
    title: "Communication d'entreprise pour ECLA BTP",
    slug: 'communication-entreprise-ecla-btp',
    excerpt: 'Création de vidéo et affiche publicitaire pour se démarquer dans le secteur du BTP.',
    content:
      "## Le Projet\n\nECLA BTP souhaitait moderniser sa communication pour mieux refléter son positionnement premium dans le secteur de la construction.",
    author: 'James Rodd',
    authorRole: 'Creative Director',
    category: 'Communication',
    tags: ['Vidéo', 'Branding', 'Corporate', 'BTP'],
    publishedDate: '2024-01-28',
    readTime: '4 min',
    featuredImage: 'corporate video production professional',
    images: ['video production studio'],
    status: 'published',
  },
  {
    id: '3',
    title: 'Création de logo et visuels pour Gobon Sarl',
    slug: 'logo-visuels-gobon-sarl',
    excerpt: 'Logo et visuels pour une identité commerciale remarquée dans le secteur alimentaire.',
    content:
      "## Contexte\n\nGobon Sarl, entreprise de distribution alimentaire, avait besoin d'une identité visuelle forte pour se démarquer sur un marché concurrentiel.",
    author: 'David Silvester',
    authorRole: 'Brand Designer',
    category: 'Branding',
    tags: ['Logo Design', 'Identité Visuelle', 'Branding', 'Food'],
    publishedDate: '2024-01-25',
    readTime: '6 min',
    featuredImage: 'logo design creative professional',
    images: ['brand identity design mockup'],
    status: 'published',
  },
];


const defaultServices = [
  {
    id: 'design-branding',
    title: 'Design & Branding',
    slug: 'design-branding',
    description: "Création d'interfaces immersives, animations 3D et expériences interactives, de logo et d'identité visuels.",
    shortDescription: 'Identité visuelle, branding et design d’expériences.',
    color: 'from-[#00b3e8] to-[#00c0e8]',
    icon: 'palette',
    features: ['Logo & Identité', 'UI/UX Design', 'Charte Graphique', 'Motion Design'],
    status: 'published',
    featured: true,
  },
  {
    id: 'web-development',
    title: 'Développement Web & Mobile',
    slug: 'web-development',
    description: 'Applications web modernes, rapides et sécurisées, adaptées à vos besoins métiers.',
    shortDescription: 'Sites, apps et plateformes métiers.',
    color: 'from-[#34c759] to-[#2da84a]',
    icon: 'code',
    features: ['Sites Web', 'Applications Mobile', 'E-commerce', 'Web Apps'],
    status: 'published',
    featured: true,
  },
  {
    id: 'digital-communication',
    title: 'Communication Digitale',
    slug: 'digital-communication',
    description: 'Stratégie de contenu, visibilité en ligne, branding et storytelling digital.',
    shortDescription: 'Acquisition, contenu et notoriété digitale.',
    color: 'from-[#ffc247] to-[#ff9f47]',
    icon: 'megaphone',
    features: ['Stratégie Social Media', 'Content Marketing', 'SEO/SEA', 'Email Marketing'],
    status: 'published',
    featured: false,
  },
  {
    id: 'video-production',
    title: 'Production Vidéo',
    slug: 'video-production',
    description: 'Création de vidéos professionnelles pour vos campagnes marketing et événements.',
    shortDescription: 'Formats vidéo impactants et motion.',
    color: 'from-[#ff6b6b] to-[#ee5a6f]',
    icon: 'video',
    features: ['Vidéos Publicitaires', 'Motion Graphics', 'Montage Vidéo', 'Live Streaming'],
    status: 'published',
    featured: false,
  },
  {
    id: '3d-creation',
    title: 'Création 3D',
    slug: '3d-creation',
    description: 'Modélisation 3D, animations et expériences immersives pour vos projets.',
    shortDescription: '3D, AR/VR et visualisation immersive.',
    color: 'from-[#a855f7] to-[#9333ea]',
    icon: 'box',
    features: ['Modélisation 3D', 'Animation 3D', 'Rendering', 'VR/AR'],
    status: 'published',
    featured: false,
  },
];

const defaultLegacyProjects = [
  {
    id: 'smove-platform',
    title: 'Plateforme SMOVE Digital',
    slug: 'plateforme-smove-digital',
    client: 'SMOVE Communication',
    category: 'Développement Web',
    year: '2024',
    summary: "Création d'une plateforme web moderne pour la gestion de projets digitaux et la communication client.",
    description: "Création d'une plateforme web moderne pour la gestion de projets digitaux et la communication client.",
    challenge: 'Développer une solution complète permettant de gérer tous les aspects de la communication digitale en un seul endroit.',
    solution: 'Architecture web progressive avec React, système de gestion de contenu intégré, dashboard analytique et interface client intuitive.',
    results: [
      'Réduction de 60% du temps de gestion de projet',
      'Augmentation de 45% de la satisfaction client',
      'Interface utilisateur primée pour son design',
      '100% responsive sur tous les appareils',
    ],
    tags: ['React', 'Node.js', 'MongoDB', 'UI/UX', 'Dashboard'],
    featuredImage: 'modern web platform dashboard interface',
    mainImage: 'modern web platform dashboard interface',
    images: ['web dashboard analytics colorful', 'project management interface modern', 'client portal design clean'],
    status: 'published',
    featured: true,
    testimonial: {
      text: 'SMOVE a transformé notre façon de travailler. La plateforme est intuitive, rapide et répond parfaitement à nos besoins.',
      author: 'Jean-Marc Kouassi',
      position: 'Directeur Général',
    },
  },
  {
    id: 'ecla-btp-branding',
    title: 'Identité Visuelle ECLA BTP',
    slug: 'identite-visuelle-ecla-btp',
    client: 'ECLA BTP',
    category: 'Branding',
    year: '2024',
    summary: "Refonte complète de l'identité visuelle d'une entreprise de construction leader en Côte d'Ivoire.",
    description: "Refonte complète de l'identité visuelle d'une entreprise de construction leader en Côte d'Ivoire.",
    challenge: "Moderniser l'image de marque tout en conservant la crédibilité et l'héritage de l'entreprise.",
    solution: 'Nouveau logo symbolisant la solidité et l’innovation, charte graphique professionnelle, supports de communication print et digital.',
    results: [
      'Augmentation de 80% de la reconnaissance de marque',
      'Nouveau positionnement premium sur le marché',
      'Cohérence visuelle sur tous les supports',
      'Impact immédiat sur les réseaux sociaux',
    ],
    tags: ['Logo Design', 'Branding', 'Print', 'Digital', 'Charte Graphique'],
    featuredImage: 'construction company branding modern',
    mainImage: 'construction company branding modern',
    images: ['logo design construction professional', 'brand identity mockup business cards', 'corporate branding materials'],
    status: 'published',
    testimonial: {
      text: 'Notre nouvelle identité visuelle nous a donné une image beaucoup plus moderne et professionnelle. Les retours sont excellents!',
      author: 'Marie Koné',
      position: 'Directrice Marketing, ECLA BTP',
    },
  },
  {
    id: 'gobon-sarl-ecommerce',
    title: 'Boutique en Ligne Gobon Sarl',
    slug: 'boutique-en-ligne-gobon-sarl',
    client: 'Gobon Sarl',
    category: 'E-commerce',
    year: '2023',
    summary: 'Développement d’une boutique en ligne complète pour la vente de produits alimentaires avec système de livraison.',
    description: 'Développement d’une boutique en ligne complète pour la vente de produits alimentaires avec système de livraison.',
    challenge: 'Créer une expérience d’achat fluide adaptée au marché local avec paiement mobile intégré.',
    solution: 'Plateforme e-commerce sur mesure avec paiement mobile money, gestion des stocks, tracking de livraison et interface administrateur.',
    results: [
      'Lancement réussi avec 1000+ commandes le premier mois',
      'Taux de conversion de 3.8% (supérieur à la moyenne)',
      'Intégration parfaite des paiements mobiles',
      'Système de livraison optimisé pour Abidjan',
    ],
    tags: ['E-commerce', 'Next.js', 'Payment Integration', 'Mobile', 'Logistics'],
    featuredImage: 'ecommerce website african products',
    mainImage: 'ecommerce website african products',
    images: ['online store modern clean design', 'shopping cart checkout process', 'mobile ecommerce app interface'],
    status: 'published',
    testimonial: {
      text: 'Grâce à SMOVE, nous avons pu digitaliser notre commerce en un temps record. Les ventes en ligne dépassent nos attentes!',
      author: 'Ibrahim Traoré',
      position: 'PDG, Gobon Sarl',
    },
  },
  {
    id: 'restaurant-afrik-taste',
    title: 'Application Mobile Afrik Taste',
    slug: 'application-mobile-afrik-taste',
    client: 'Afrik Taste Restaurant',
    category: 'Application Mobile',
    year: '2023',
    summary: 'Application mobile de commande et livraison pour une chaîne de restaurants ivoiriens.',
    description: 'Application mobile de commande et livraison pour une chaîne de restaurants ivoiriens.',
    challenge: 'Offrir une expérience de commande simple et rapide avec suivi en temps réel de la livraison.',
    solution: 'Application native iOS/Android avec menu interactif, personnalisation des plats, paiement intégré et suivi GPS de livraison.',
    results: [
      '50,000+ téléchargements en 3 mois',
      'Note moyenne de 4.8/5 sur les stores',
      'Augmentation de 120% des commandes',
      'Fidélisation client améliorée de 65%',
    ],
    tags: ['React Native', 'Mobile App', 'GPS', 'Payment', 'Real-time'],
    featuredImage: 'restaurant mobile app food delivery',
    mainImage: 'restaurant mobile app food delivery',
    images: ['food delivery app interface colorful', 'restaurant menu app design', 'order tracking map mobile'],
    status: 'published',
    testimonial: {
      text: "L'application a révolutionné notre business. Nos clients adorent la simplicité et la rapidité du service.",
      author: 'Fatou Diallo',
      position: 'Directrice, Afrik Taste',
    },
  },
  {
    id: 'ministry-campaign',
    title: 'Campagne Digitale Ministère',
    slug: 'campagne-digitale-ministere',
    client: 'Ministère de la Jeunesse',
    category: 'Communication Digitale',
    year: '2023',
    summary: "Campagne de communication digitale pour promouvoir l'entrepreneuriat jeune en Côte d'Ivoire.",
    description: "Campagne de communication digitale pour promouvoir l'entrepreneuriat jeune en Côte d'Ivoire.",
    challenge: 'Atteindre et engager les jeunes sur les réseaux sociaux avec un message impactant.',
    solution: 'Stratégie multicanal, vidéos virales, motion design, community management et influenceurs.',
    results: [
      '5 millions de vues sur les réseaux sociaux',
      '200,000+ interactions (likes, partages, commentaires)',
      'Augmentation de 300% des inscriptions au programme',
      "Tendance #1 sur Twitter Côte d'Ivoire pendant 3 jours",
    ],
    tags: ['Social Media', 'Video', 'Motion Design', 'Strategy', 'Influencers'],
    featuredImage: 'social media campaign colorful youth',
    mainImage: 'social media campaign colorful youth',
    images: ['social media graphics modern vibrant', 'video production studio creative', 'digital campaign analytics dashboard'],
    status: 'published',
  },
  {
    id: 'bank-mobile-app',
    title: 'Application Bancaire Mobile',
    slug: 'application-bancaire-mobile',
    client: 'Banque Atlantique CI',
    category: 'FinTech',
    year: '2024',
    summary: 'Application mobile bancaire nouvelle génération avec fonctionnalités avancées.',
    description: 'Application mobile bancaire nouvelle génération avec fonctionnalités avancées.',
    challenge: 'Créer une expérience bancaire mobile sécurisée, rapide et intuitive pour tous les âges.',
    solution: 'Architecture sécurisée, biométrie, virements instantanés, gestion de budget AI, notifications intelligentes.',
    results: [
      '200,000+ utilisateurs actifs',
      'Réduction de 70% des visites en agence',
      'Transactions 5x plus rapides',
      'Sécurité renforcée avec authentification biométrique',
    ],
    tags: ['FinTech', 'Mobile', 'Security', 'AI', 'Banking'],
    featuredImage: 'mobile banking app modern secure',
    mainImage: 'mobile banking app modern secure',
    images: ['banking app interface clean professional', 'payment transfer mobile design', 'financial dashboard mobile analytics'],
    status: 'published',
  },
  {
    id: 'fashion-brand-3d',
    title: 'Expérience 3D Marque de Mode',
    slug: 'experience-3d-marque-de-mode',
    client: 'Ivoire Fashion House',
    category: 'Création 3D',
    year: '2024',
    summary: "Création d'une expérience 3D immersive pour le lancement d'une collection de mode.",
    description: "Création d'une expérience 3D immersive pour le lancement d'une collection de mode.",
    challenge: 'Se démarquer lors du lancement avec une expérience digitale innovante et mémorable.',
    solution: 'Showroom virtuel 3D, essayage virtuel AR, vidéo 3D de défilé et configurateur de produits interactif.',
    results: [
      'Expérience partagée 100,000+ fois',
      "Temps d'engagement moyen de 8 minutes",
      'Conversion augmentée de 150%',
      'Couverture médiatique nationale et internationale',
    ],
    tags: ['3D Modeling', 'AR', 'Virtual Showroom', 'Interactive', 'Fashion'],
    featuredImage: '3d fashion virtual showroom',
    mainImage: '3d fashion virtual showroom',
    images: ['3d modeling fashion design', 'augmented reality clothing app', 'virtual reality shopping experience'],
    status: 'published',
  },
  {
    id: 'education-platform',
    title: 'Plateforme E-Learning',
    slug: 'plateforme-e-learning',
    client: 'Université Virtuelle CI',
    category: 'EdTech',
    year: '2023',
    summary: "Plateforme complète d'apprentissage en ligne avec cours interactifs et certifications.",
    description: "Plateforme complète d'apprentissage en ligne avec cours interactifs et certifications.",
    challenge: "Rendre l'éducation accessible et engageante pour des milliers d'étudiants à distance.",
    solution: 'LMS complet avec vidéos HD, quizz interactifs, forums, suivi de progression et certifications automatiques.',
    results: [
      '15,000+ étudiants inscrits',
      '500+ cours disponibles',
      'Taux de complétion de 78%',
      "Certification reconnue par l'État",
    ],
    tags: ['EdTech', 'LMS', 'Video Streaming', 'Gamification', 'Certificates'],
    featuredImage: 'online learning platform modern',
    mainImage: 'online learning platform modern',
    images: ['elearning dashboard student interface', 'video course player interactive', 'certification system online education'],
    status: 'published',
  },
];

const defaultSettings = {
  siteSettings: {
    siteTitle: 'SMOVE',
    supportEmail: 'contact@smove.africa',
    brandMedia: {
      logo: '',
      logoDark: '',
      favicon: '',
      defaultSocialImage: '',
    },
  },
  branding: {
    logoSize: { desktop: 120, tablet: 100, mobile: 80 },
  },
  footer: {
    socialLinks: [],
  },
  operationalSettings: {
    instantPublishing: true,
  },
  taxonomySettings: {
    blog: {
      managedCategories: MANAGED_BLOG_CATEGORIES,
      managedTags: MANAGED_BLOG_TAGS,
      enforceManagedTags: true,
    },
  },
};

class ContentService {
  canonicalTeamMembersFromState(state = {}) {
    const key = TEAM_MEMBER_STATE_KEYS.find((entry) => Array.isArray(state[entry]) && state[entry].length > 0);
    return key ? state[key] : (Array.isArray(state.teamMembers) ? state.teamMembers : []);
  }

  setCanonicalTeamMembersState(state, members) {
    for (const key of TEAM_MEMBER_STATE_KEYS) {
      if (key !== 'teamMembers') delete state[key];
    }
    state.teamMembers = Array.isArray(members) ? members : [];
  }

  constructor({ contentRepository }) {
    this.contentRepository = contentRepository;
    this.seedProjectsFromLegacy();
  }

  readState() {
    return this.contentRepository.getState
      ? this.contentRepository.getState()
      : {
          blogPosts: this.contentRepository.getBlogPosts(),
          projects: [],
          mediaFiles: [],
          services: [],
          teamMembers: [],
          pageContent: null,
          settings: null,
          analyticsEvents: [],
        };
  }

  writeState(state) {
    if (this.contentRepository.saveState) {
      return this.contentRepository.saveState(state);
    }
    this.contentRepository.saveBlogPosts(state.blogPosts || []);
    return undefined;
  }

  async flushWrites() {
    if (typeof this.contentRepository.flushWrites === 'function') {
      await this.contentRepository.flushWrites();
    }
  }

  normalizeActorContext(actor = {}) {
    const userId = typeof actor?.userId === 'string' && actor.userId.trim() ? actor.userId.trim() : 'system';
    return {
      userId,
      role: typeof actor?.role === 'string' ? actor.role : 'system',
      organizationId:
        typeof actor?.organizationId === 'string' && actor.organizationId.trim()
          ? actor.organizationId.trim().toLowerCase()
          : DEFAULT_ORGANIZATION_ID,
    };
  }

  canMutateEntity(actor, entity, action = 'write') {
    if (!entity) return false;
    if (actor.role === 'admin' || actor.role === 'editor') return true;
    if (actor.role === 'author') {
      if (entity.ownerUserId !== actor.userId) return false;
      return action === 'write' || action === 'delete';
    }
    return false;
  }

  scopeByOrganization(entries, organizationId) {
    const normalizedOrganizationId =
      typeof organizationId === 'string' && organizationId.trim()
        ? organizationId.trim().toLowerCase()
        : null;
    if (!normalizedOrganizationId) return entries;
    return entries.filter((entry) => (entry.organizationId || DEFAULT_ORGANIZATION_ID) === normalizedOrganizationId);
  }

  seedBlogPostsFromLegacy() {
    const state = this.readState();
    const existingPosts = Array.isArray(state.blogPosts) ? state.blogPosts.map((post) => this.normalizePost(post)).filter((post) => post.id && post.title) : [];

    if (existingPosts.length === 0) {
      state.blogPosts = defaultBlogPosts.map((post) => this.normalizePost(post));
      this.writeState(state);
      return state.blogPosts;
    }

    const knownSlugs = new Set(existingPosts.map((post) => post.slug));
    const missingSeedPosts = defaultBlogPosts
      .map((post) => this.normalizePost(post))
      .filter((post) => !knownSlugs.has(post.slug));

    if (missingSeedPosts.length > 0) {
      state.blogPosts = [...existingPosts, ...missingSeedPosts];
      this.writeState(state);
      return state.blogPosts;
    }

    return existingPosts;
  }

  listBlogPosts(options = {}) {
    const entries = this.seedBlogPostsFromLegacy().map((post) => this.normalizePost(post));
    return this.scopeByOrganization(entries, options.organizationId);
  }

  findBlogPostById(id, options = {}) {
    return this.listBlogPosts(options).find((entry) => entry.id === id) || null;
  }

  saveBlogPost(post, actor = {}) {
    const actorContext = this.normalizeActorContext(actor);
    const state = this.readState();
    const normalized = this.registerBlogPostMediaReferences(this.normalizePost(post, actorContext), { state, actor: actorContext });
    if (!this.validateBlogPost(normalized)) {
      return { ok: false, error: { code: 'BLOG_VALIDATION_ERROR', message: 'Invalid blog payload.' } };
    }

    const posts = this.listBlogPosts({ organizationId: actorContext.organizationId });
    const duplicateSlug = posts.find((entry) => entry.slug === normalized.slug && entry.id !== normalized.id);

    const existing = posts.find((entry) => entry.id === normalized.id);
    if (existing && !this.canMutateEntity(actorContext, existing, 'write')) {
      return { ok: false, error: { code: 'FORBIDDEN_OWNERSHIP', message: 'Cannot modify content owned by another user.' } };
    }
    if (duplicateSlug) {
      return { ok: false, error: { code: 'BLOG_SLUG_CONFLICT', message: 'Slug already exists.' } };
    }

    const index = posts.findIndex((entry) => entry.id === normalized.id);
    if (index >= 0) {
      posts[index] = normalized;
    } else {
      posts.push(normalized);
    }

    const globalPosts = this.listBlogPosts().filter((entry) => (entry.organizationId || DEFAULT_ORGANIZATION_ID) !== actorContext.organizationId);
    state.blogPosts = [...globalPosts, ...posts];
    this.writeState(state);
    return { ok: true, post: normalized };
  }

  deleteBlogPost(id) {
    const state = this.readState();
    const next = this.listBlogPosts().filter((post) => post.id !== id);
    state.blogPosts = next;
    this.writeState(state);
    return { ok: true };
  }

  transitionBlogStatus(id, targetStatus, actor = {}) {
    const actorContext = this.normalizeActorContext(actor);
    if (!BLOG_STATUSES.has(targetStatus)) {
      return { ok: false, error: { code: 'BLOG_INVALID_STATUS_TRANSITION', message: 'Invalid target status.' } };
    }

    const posts = this.listBlogPosts({ organizationId: actorContext.organizationId });
    const index = posts.findIndex((post) => post.id === id);
    if (index < 0) {
      return { ok: false, error: { code: 'BLOG_NOT_FOUND', message: 'Post not found.' } };
    }

    const current = posts[index];
    if (!this.canMutateEntity(actorContext, current, 'write')) {
      return { ok: false, error: { code: 'FORBIDDEN_OWNERSHIP', message: 'Cannot transition content owned by another user.' } };
    }
    const isAllowed = this.isAllowedTransition(current.status, targetStatus);
    if (!isAllowed) {
      return { ok: false, error: { code: 'BLOG_INVALID_STATUS_TRANSITION', message: 'Transition not allowed.' } };
    }

    const next = { ...current, status: targetStatus };
    if (targetStatus === 'published' && !this.getSettings().operationalSettings.instantPublishing) {
      return {
        ok: false,
        error: {
          code: 'BLOG_INSTANT_PUBLISHING_DISABLED',
          message: 'Instant publishing is disabled. Keep content in review until publishing is enabled.',
        },
      };
    }
    if (targetStatus === 'published') {
      const publishability = this.evaluatePublishability(next);
      if (!publishability.ok) {
        return { ok: false, error: { code: 'BLOG_NOT_PUBLISHABLE', message: publishability.message } };
      }
    }

    posts[index] = next;
    const state = this.readState();
    const globalPosts = this.listBlogPosts().filter((entry) => (entry.organizationId || DEFAULT_ORGANIZATION_ID) !== actorContext.organizationId);
    state.blogPosts = [...globalPosts, ...posts];
    this.writeState(state);
    return { ok: true, post: next };
  }


  recordAnalyticsEvent(event = {}, context = {}) {
    const state = this.readState();
    const events = Array.isArray(state.analyticsEvents) ? state.analyticsEvents : [];
    const name = `${event.name || ''}`.trim().toLowerCase();

    if (!name) {
      return { ok: false, error: { code: 'ANALYTICS_EVENT_INVALID', message: 'Event name is required.' } };
    }

    const now = new Date().toISOString();
    const normalized = {
      id: `evt_${Date.now()}_${Math.random().toString(16).slice(2)}`,
      name,
      route: `${event.route || ''}`.trim() || 'unknown',
      source: `${context.source || event.source || 'public'}`.trim(),
      entityType: typeof event.entityType === 'string' ? event.entityType : null,
      entityId: typeof event.entityId === 'string' ? event.entityId : null,
      ctaId: typeof event.ctaId === 'string' ? event.ctaId : null,
      targetRoute: typeof event.targetRoute === 'string' ? event.targetRoute : null,
      success: typeof event.success === 'boolean' ? event.success : null,
      happenedAt: typeof event.happenedAt === 'string' ? event.happenedAt : now,
      requestId: context.requestId || null,
      metadata: event.metadata && typeof event.metadata === 'object' ? event.metadata : {},
    };

    state.analyticsEvents = [normalized, ...events].slice(0, 1000);
    this.writeState(state);
    return { ok: true, event: normalized };
  }

  listAnalyticsEvents(limit = 100) {
    const state = this.readState();
    const events = Array.isArray(state.analyticsEvents) ? state.analyticsEvents : [];
    const parsedLimit = Number(limit);
    const safeLimit = Number.isFinite(parsedLimit) && parsedLimit > 0 ? Math.min(Math.floor(parsedLimit), 500) : 100;
    return events.slice(0, safeLimit);
  }

  getPublicAnalyticsSummary() {
    const events = this.listAnalyticsEvents(1000);
    const byName = events.reduce((acc, event) => {
      acc[event.name] = (acc[event.name] || 0) + 1;
      return acc;
    }, {});

    const conversionPath = {
      homeToDiscovery: events.filter((entry) => entry.name === 'cta_clicked' && entry.route === 'home').length,
      discoveryToContact: events.filter((entry) => entry.name === 'cta_clicked' && /contact/.test(`${entry.targetRoute || ''}`)).length,
      contactFormSubmissions: events.filter((entry) => entry.name === 'contact_form_submitted').length,
    };

    const topRoutes = Array.from(events.reduce((acc, entry) => {
      const key = entry.route || 'unknown';
      acc.set(key, (acc.get(key) || 0) + 1);
      return acc;
    }, new Map()).entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([route, hits]) => ({ route, hits }));

    return {
      eventsLast1000: events.length,
      byName,
      conversionPath,
      topRoutes,
      recent: events.slice(0, 25),
    };
  }

  getAnalytics() {
    const posts = this.listBlogPosts();
    return {
      drafts: posts.filter((post) => post.status === 'draft').length,
      inReview: posts.filter((post) => post.status === 'in_review').length,
      published: posts.filter((post) => post.status === 'published').length,
      archived: posts.filter((post) => post.status === 'archived').length,
      recentlyUpdated: posts
        .slice()
        .sort((a, b) => Date.parse(b.publishedDate) - Date.parse(a.publishedDate))
        .slice(0, 5)
        .map((post) => ({ id: post.id, title: post.title, status: post.status, publishedDate: post.publishedDate })),
    };
  }

  listProjects(options = {}) {
    const entries = this.seedProjectsFromLegacy()
      .map((project) => this.normalizeProject(project))
      .filter((project) => this.validateProject(project))
      .sort((a, b) => Number(Boolean(b.featured)) - Number(Boolean(a.featured)) || Number.parseInt(b.year, 10) - Number.parseInt(a.year, 10));
    return this.scopeByOrganization(entries, options.organizationId);
  }

  seedProjectsFromLegacy() {
    const state = this.readState();
    const existingProjects = Array.isArray(state.projects)
      ? state.projects.map((project) => this.normalizeProject(project)).filter((project) => this.validateProject(project))
      : [];

    const existingBySlug = new Set(existingProjects.map((project) => project.slug));
    const existingById = new Set(existingProjects.map((project) => project.id));
    const normalizedLegacyProjects = defaultLegacyProjects.map((project) => this.normalizeProject(project));
    const legacyProjects = normalizedLegacyProjects.filter((project) => this.validateProject(project));
    const invalidLegacyProjectsCount = normalizedLegacyProjects.length - legacyProjects.length;
    const missingProjects = legacyProjects.filter((project) => !existingBySlug.has(project.slug) && !existingById.has(project.id));

    if (missingProjects.length === 0 && invalidLegacyProjectsCount === 0) {
      return existingProjects;
    }

    if (missingProjects.length > 0) {
      state.projects = [...existingProjects, ...missingProjects];
    }

    if (missingProjects.length > 0 || invalidLegacyProjectsCount > 0) {
      state.migrationHistory = [
        {
          migrationId: `projects-legacy-import-${Date.now()}`,
          migratedAt: new Date().toISOString(),
          importedCount: missingProjects.length,
          skippedExistingCount: legacyProjects.length - missingProjects.length,
          invalidLegacyProjectsCount,
          source: 'site-legacy-projects',
          strategy: 'slug_then_id',
        },
        ...(Array.isArray(state.migrationHistory) ? state.migrationHistory : []),
      ].slice(0, 100);
      this.writeState(state);
    }

    return Array.isArray(state.projects) ? state.projects : existingProjects;
  }

  findProjectById(id, options = {}) {
    return this.listProjects(options).find((entry) => entry.id === id) || null;
  }

  saveProject(project, actor = {}) {
    const actorContext = this.normalizeActorContext(actor);
    const state = this.readState();
    const normalized = this.registerProjectMediaReferences(this.normalizeProject(project, actorContext), { state, actor: actorContext });
    if (!this.validateProject(normalized)) {
      return { ok: false, error: { code: 'PROJECT_VALIDATION_ERROR', message: 'Invalid project payload.' } };
    }

    const projects = this.listProjects({ organizationId: actorContext.organizationId });
    const duplicateSlug = projects.find((entry) => entry.slug === normalized.slug && entry.id !== normalized.id);
    if (duplicateSlug) {
      return { ok: false, error: { code: 'PROJECT_SLUG_CONFLICT', message: 'Project slug already exists.' } };
    }

    const existing = projects.find((entry) => entry.id === normalized.id);
    if (existing && !this.canMutateEntity(actorContext, existing, 'write')) {
      return { ok: false, error: { code: 'FORBIDDEN_OWNERSHIP', message: 'Cannot modify project owned by another user.' } };
    }
    if (normalized.status === 'published') {
      const publishability = this.evaluateProjectPublishability(normalized);
      if (!publishability.ok) {
        return { ok: false, error: { code: 'PROJECT_NOT_PUBLISHABLE', message: publishability.message } };
      }
      if (existing && !['in_review', 'published'].includes(existing.status)) {
        return { ok: false, error: { code: 'PROJECT_INVALID_STATUS_TRANSITION', message: 'Project must be in review before publishing.' } };
      }
    }

    const index = projects.findIndex((entry) => entry.id === normalized.id);
    if (index >= 0) projects[index] = normalized;
    else projects.push(normalized);
    const globalProjects = this.listProjects().filter((entry) => (entry.organizationId || DEFAULT_ORGANIZATION_ID) !== actorContext.organizationId);
    state.projects = [...globalProjects, ...projects];
    this.writeState(state);
    return { ok: true, project: normalized };
  }


  transitionProjectStatus(id, targetStatus, actor = {}) {
    const actorContext = this.normalizeActorContext(actor);
    if (!PROJECT_STATUSES.has(targetStatus)) {
      return { ok: false, error: { code: 'PROJECT_INVALID_STATUS_TRANSITION', message: 'Invalid target status.' } };
    }

    const projects = this.listProjects({ organizationId: actorContext.organizationId });
    const index = projects.findIndex((project) => project.id === id);
    if (index < 0) {
      return { ok: false, error: { code: 'PROJECT_NOT_FOUND', message: 'Project not found.' } };
    }

    const current = projects[index];
    if (!this.canMutateEntity(actorContext, current, 'write')) {
      return { ok: false, error: { code: 'FORBIDDEN_OWNERSHIP', message: 'Cannot transition project owned by another user.' } };
    }
    const isAllowed = this.isAllowedTransition(current.status || 'draft', targetStatus);
    if (!isAllowed) {
      return { ok: false, error: { code: 'PROJECT_INVALID_STATUS_TRANSITION', message: 'Transition not allowed.' } };
    }

    const reviewedBy = typeof actor?.reviewedBy === 'string' ? actor.reviewedBy.trim() : actorContext.userId;
    const next = { ...current, status: targetStatus };

    if (targetStatus === 'published') {
      const publishability = this.evaluateProjectPublishability(next);
      if (!publishability.ok) {
        return { ok: false, error: { code: 'PROJECT_NOT_PUBLISHABLE', message: publishability.message } };
      }
      next.reviewedAt = new Date().toISOString();
      if (reviewedBy) next.reviewedBy = reviewedBy;
    }

    if (targetStatus === 'in_review') {
      next.reviewedAt = new Date().toISOString();
      if (reviewedBy) next.reviewedBy = reviewedBy;
    }

    projects[index] = this.normalizeProject(next);
    const state = this.readState();
    const globalProjects = this.listProjects().filter((entry) => (entry.organizationId || DEFAULT_ORGANIZATION_ID) !== actorContext.organizationId);
    state.projects = [...globalProjects, ...projects];
    this.writeState(state);
    return { ok: true, project: projects[index] };
  }

  deleteProject(id) {
    const state = this.readState();
    state.projects = this.listProjects().filter((entry) => entry.id !== id);
    this.writeState(state);
    return { ok: true };
  }


  listTeamMembers(options = {}) {
    const state = this.readState();
    const entries = this.canonicalTeamMembersFromState(state)
      .map((member) => this.normalizeTeamMember(member))
      .filter((member) => this.validateTeamMember(member));
    return this.scopeByOrganization(entries, options.organizationId)
      .sort((a, b) => Number(a.order || 0) - Number(b.order || 0) || a.name.localeCompare(b.name, 'fr'));
  }

  findTeamMemberById(id, options = {}) {
    return this.listTeamMembers(options).find((entry) => entry.id === id) || null;
  }

  saveTeamMember(member, actor = {}) {
    const actorContext = this.normalizeActorContext(actor);
    const state = this.readState();
    const normalized = this.normalizeTeamMember(member, actorContext);
    if (!this.validateTeamMember(normalized)) {
      return { ok: false, error: { code: 'TEAM_VALIDATION_ERROR', message: 'Invalid team member payload.' } };
    }
    const allMembers = this.canonicalTeamMembersFromState(state)
      .map((entry) => this.normalizeTeamMember(entry))
      .filter((entry) => this.validateTeamMember(entry));
    const members = this.scopeByOrganization(allMembers, actorContext.organizationId);
    const existing = members.find((entry) => entry.id === normalized.id);
    if (existing && !this.canMutateEntity(actorContext, existing, 'write')) {
      return { ok: false, error: { code: 'FORBIDDEN_OWNERSHIP', message: 'Cannot modify team member owned by another user.' } };
    }
    const index = allMembers.findIndex((entry) => entry.id === normalized.id);
    if (index >= 0) allMembers[index] = normalized;
    else allMembers.push(normalized);
    this.setCanonicalTeamMembersState(state, allMembers);
    this.writeState(state);
    return { ok: true, member: normalized };
  }

  deleteTeamMember(id) {
    const state = this.readState();
    const remainingMembers = this.canonicalTeamMembersFromState(state)
      .map((entry) => this.normalizeTeamMember(entry))
      .filter((entry) => this.validateTeamMember(entry) && entry.id !== id);
    this.setCanonicalTeamMembersState(state, remainingMembers);
    this.writeState(state);
    return { ok: true };
  }


  seedServicesFromLegacy() {
    const state = this.readState();
    const existingServices = Array.isArray(state.services)
      ? state.services.map((service) => this.normalizeService(service)).filter((service) => this.validateService(service))
      : [];

    if (existingServices.length === 0) {
      state.services = defaultServices.map((service) => this.normalizeService(service));
      this.writeState(state);
      return state.services;
    }

    const knownSlugs = new Set(existingServices.map((service) => service.slug));
    const missingSeedServices = defaultServices
      .map((service) => this.normalizeService(service))
      .filter((service) => !knownSlugs.has(service.slug));

    if (missingSeedServices.length > 0) {
      state.services = [...existingServices, ...missingSeedServices];
      this.writeState(state);
      return state.services;
    }

    return existingServices;
  }

  listServices(options = {}) {
    const entries = this.seedServicesFromLegacy()
      .map((service) => this.normalizeService(service))
      .filter((service) => this.validateService(service))
      .sort((a, b) => Number(Boolean(b.featured)) - Number(Boolean(a.featured)) || a.title.localeCompare(b.title, 'fr'));
    return this.scopeByOrganization(entries, options.organizationId);
  }

  findServiceById(id, options = {}) {
    return this.listServices(options).find((entry) => entry.id === id) || null;
  }

  saveService(service, actor = {}) {
    const actorContext = this.normalizeActorContext(actor);
    const state = this.readState();
    const services = this.scopeByOrganization(
      (Array.isArray(state.services) ? state.services : []).map((entry) => this.normalizeService(entry, actorContext)),
      actorContext.organizationId,
    );
    const existing = services.find((entry) => entry.id === `${service?.id || ''}`.trim());
    const mode = existing ? 'update' : 'create';
    const mergedPayload = mode === 'update' ? this.mergeServiceForUpdate(existing, service) : service;
    const normalized = this.registerServiceMediaReferences(this.normalizeService(mergedPayload, actorContext), { state, actor: actorContext });
    const validation = this.validateServiceForMode(normalized, mode, {
      providedFields: this.extractProvidedServiceFields(service),
      previousService: existing,
      allowLegacyOptionals: Boolean(existing),
    });
    if (!validation.ok) {
      return {
        ok: false,
        error: {
          code: 'SERVICE_VALIDATION_ERROR',
          message: `Service ${mode} rejected: ${validation.message}`,
          details: validation,
        },
      };
    }

    const slugConflict = services.find((entry) => entry.slug === normalized.slug && entry.id !== normalized.id);
    if (slugConflict) {
      return { ok: false, error: { code: 'SERVICE_SLUG_CONFLICT', message: 'Service slug already exists.' } };
    }
    const routeSlugConflict = services.find((entry) => entry.routeSlug === normalized.routeSlug && entry.id !== normalized.id);
    if (routeSlugConflict) {
      return { ok: false, error: { code: 'SERVICE_ROUTE_SLUG_CONFLICT', message: 'Service route slug already exists.' } };
    }
    if (existing && !this.canMutateEntity(actorContext, existing, 'write')) {
      return { ok: false, error: { code: 'FORBIDDEN_OWNERSHIP', message: 'Cannot modify service owned by another user.' } };
    }
    const shouldValidatePublishability =
      normalized.status === 'published' &&
      (!existing || existing.status !== 'published');
    if (shouldValidatePublishability) {
      const publishability = this.evaluateServicePublishability(normalized);
      if (!publishability.ok) {
        return { ok: false, error: { code: 'SERVICE_NOT_PUBLISHABLE', message: publishability.message } };
      }
    }

    const index = services.findIndex((entry) => entry.id === normalized.id);
    if (index >= 0) services[index] = normalized;
    else services.push(normalized);

    const globalServices = this.listServices().filter((entry) => (entry.organizationId || DEFAULT_ORGANIZATION_ID) !== actorContext.organizationId);
    state.services = [...globalServices, ...services];
    this.writeState(state);
    return { ok: true, service: normalized };
  }

  mergeServiceForUpdate(existing, incoming) {
    const source = incoming && typeof incoming === 'object' ? incoming : {};
    const current = existing && typeof existing === 'object' ? existing : {};
    const has = (key) => Object.prototype.hasOwnProperty.call(source, key);
    const hasSeo = has('seo') && source.seo && typeof source.seo === 'object';
    const preferExistingWhenBlank = (key) => {
      if (!has(key)) return current[key];
      const nextValue = source[key];
      if (typeof nextValue === 'string' && !nextValue.trim()) return current[key];
      if (Array.isArray(nextValue) && nextValue.length === 0) return current[key];
      return nextValue;
    };

    return {
      ...current,
      ...source,
      id: has('id') ? source.id : current.id,
      title: preferExistingWhenBlank('title'),
      slug: preferExistingWhenBlank('slug'),
      routeSlug: preferExistingWhenBlank('routeSlug'),
      description: preferExistingWhenBlank('description'),
      shortDescription: preferExistingWhenBlank('shortDescription'),
      icon: preferExistingWhenBlank('icon'),
      iconLikeAsset: preferExistingWhenBlank('iconLikeAsset'),
      detailImage: preferExistingWhenBlank('detailImage'),
      representativeImage: preferExistingWhenBlank('representativeImage'),
      illustrationCards: preferExistingWhenBlank('illustrationCards'),
      visualMedia: preferExistingWhenBlank('visualMedia'),
      image: preferExistingWhenBlank('image'),
      media: preferExistingWhenBlank('media'),
      color: preferExistingWhenBlank('color'),
      features: preferExistingWhenBlank('features'),
      status: has('status') ? source.status : current.status,
      featured: has('featured') ? source.featured : current.featured,
      overviewTitle: preferExistingWhenBlank('overviewTitle'),
      overviewDescription: preferExistingWhenBlank('overviewDescription'),
      ctaTitle: preferExistingWhenBlank('ctaTitle'),
      ctaDescription: preferExistingWhenBlank('ctaDescription'),
      ctaPrimaryLabel: preferExistingWhenBlank('ctaPrimaryLabel'),
      ctaPrimaryHref: preferExistingWhenBlank('ctaPrimaryHref'),
      processTitle: preferExistingWhenBlank('processTitle'),
      processSteps: preferExistingWhenBlank('processSteps'),
      seo: {
        ...(current.seo || {}),
        ...(hasSeo ? source.seo : {}),
      },
      createdAt: current.createdAt,
      ownerUserId: current.ownerUserId,
      organizationId: current.organizationId,
    };
  }

  deleteService(id) {
    const state = this.readState();
    state.services = this.listServices().filter((entry) => entry.id !== id);
    this.writeState(state);
    return { ok: true };
  }

  listMediaFiles(options = {}) {
    const includeArchived = Boolean(options.includeArchived);
    return this.readState().mediaFiles
      .map((file) => this.normalizeMediaFile(file))
      .filter((file) => this.validateMediaFile(file))
      .filter((file) => includeArchived || !file.archivedAt);
  }

  saveMediaFile(file) {
    const normalized = this.normalizeMediaFile(file);
    if (!this.validateMediaFile(normalized)) {
      return { ok: false, error: { code: 'MEDIA_VALIDATION_ERROR', message: 'Invalid media payload.' } };
    }

    const state = this.readState();
    const files = this.listMediaFiles({ includeArchived: true });
    const index = files.findIndex((entry) => entry.id === normalized.id);
    if (index >= 0) files[index] = normalized;
    else files.push(normalized);
    state.mediaFiles = files;
    this.writeState(state);
    return { ok: true, mediaFile: normalized };
  }

  archiveMediaFile(id) {
    const usageImpact = this.getMediaUsageImpact(id);
    if (!usageImpact.okToArchive) {
      return {
        ok: false,
        error: {
          code: 'MEDIA_IN_USE',
          message: 'Media file is still referenced by published or protected content.',
          references: usageImpact.references,
          impact: usageImpact,
        },
      };
    }

    const files = this.listMediaFiles({ includeArchived: true });
    const index = files.findIndex((entry) => entry.id === id);
    if (index < 0) {
      return { ok: false, error: { code: 'MEDIA_NOT_FOUND', message: 'Media file not found.' } };
    }

    files[index] = {
      ...files[index],
      archivedAt: files[index].archivedAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const state = this.readState();
    state.mediaFiles = files;
    this.writeState(state);
    return { ok: true, mediaFile: files[index] };
  }

  restoreMediaFile(id) {
    const files = this.listMediaFiles({ includeArchived: true });
    const index = files.findIndex((entry) => entry.id === id);
    if (index < 0) {
      return { ok: false, error: { code: 'MEDIA_NOT_FOUND', message: 'Media file not found.' } };
    }

    if (!files[index].archivedAt) {
      return { ok: true, mediaFile: files[index], restored: false };
    }

    files[index] = {
      ...files[index],
      archivedAt: null,
      restoredAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const state = this.readState();
    state.mediaFiles = files;
    this.writeState(state);
    return { ok: true, mediaFile: files[index], restored: true };
  }

  replaceMediaFile(id, nextPayload = {}) {
    const files = this.listMediaFiles({ includeArchived: true });
    const index = files.findIndex((entry) => entry.id === id);
    if (index < 0) {
      return { ok: false, error: { code: 'MEDIA_NOT_FOUND', message: 'Media file not found.' } };
    }

    const merged = this.normalizeMediaFile({
      ...files[index],
      ...nextPayload,
      id,
      archivedAt: null,
      replacedAt: new Date().toISOString(),
    });
    if (!this.validateMediaFile(merged)) {
      return { ok: false, error: { code: 'MEDIA_VALIDATION_ERROR', message: 'Invalid media payload.' } };
    }

    files[index] = merged;
    const state = this.readState();
    state.mediaFiles = files;
    this.writeState(state);
    return { ok: true, mediaFile: merged };
  }

  deleteMediaFile(id) {
    const state = this.readState();
    state.mediaFiles = this.listMediaFiles({ includeArchived: true }).filter((entry) => entry.id !== id);
    this.writeState(state);
    return { ok: true };
  }

  getPageContent() {
    const candidate = this.readState().pageContent;
    if (!candidate || typeof candidate !== 'object') {
      return { home: { ...defaultHomePageContent } };
    }
    return { home: this.normalizeHomePageContent(candidate.home || {}) };
  }

  savePageContent(payload) {
    const state = this.readState();
    const normalized = { home: this.registerHomePageMediaReferences(this.normalizeHomePageContent(payload?.home || {}), { state }) };
    if (!this.validateHomePageContent(normalized.home)) {
      return { ok: false, error: { code: 'PAGE_CONTENT_VALIDATION_ERROR', message: 'Invalid page content payload.' } };
    }

    state.pageContent = normalized;
    this.writeState(state);
    return { ok: true, pageContent: normalized };
  }

  getSettings() {
    const candidate = this.readState().settings;
    return this.normalizeSettings(candidate || {});
  }

  getPublicSettings() {
    const settings = this.getSettings();
    const mediaById = new Map(this.listMediaFiles({ includeArchived: true }).map((entry) => [entry.id, entry]));
    const resolve = (value) => this.resolvePublicMediaValue(value, mediaById);
    return {
      ...settings.siteSettings,
      brandMedia: {
        ...settings.siteSettings.brandMedia,
        logo: resolve(settings.siteSettings.brandMedia.logo),
        logoDark: resolve(settings.siteSettings.brandMedia.logoDark),
        favicon: resolve(settings.siteSettings.brandMedia.favicon),
        defaultSocialImage: resolve(settings.siteSettings.brandMedia.defaultSocialImage),
      },
      branding: settings.branding,
      footer: {
        socialLinks: settings.footer.socialLinks.map((link) => ({ ...link, icon: resolve(link.icon) })),
      },
    };
  }

  getPublicPageContent() {
    const page = this.getPageContent();
    const mediaById = new Map(this.listMediaFiles({ includeArchived: true }).map((entry) => [entry.id, entry]));
    const resolve = (value) => this.resolvePublicMediaValue(value, mediaById);
    return {
      home: {
        ...page.home,
        aboutImage: resolve(page.home.aboutImage),
        heroBackgroundItems: (Array.isArray(page.home.heroBackgroundItems) ? page.home.heroBackgroundItems : []).map((item) => ({
          ...item,
          media: resolve(item.media),
          desktopMedia: resolve(item.desktopMedia),
          tabletMedia: resolve(item.tabletMedia),
          mobileMedia: resolve(item.mobileMedia),
          videoMedia: resolve(item.videoMedia),
        })),
      },
    };
  }

  getBlogTaxonomy() {
    return this.getSettings().taxonomySettings.blog;
  }

  listSettingsHistory(limit = 20) {
    const history = Array.isArray(this.readState().settingsHistory) ? this.readState().settingsHistory : [];
    const parsed = Number.parseInt(`${limit}`, 10);
    const safeLimit = Number.isFinite(parsed) && parsed > 0 ? parsed : 20;
    return history.slice(0, safeLimit);
  }

  rollbackSettings(versionId, actor = {}) {
    const state = this.readState();
    const history = Array.isArray(state.settingsHistory) ? state.settingsHistory : [];
    const version = history.find((entry) => entry.versionId === versionId);
    if (!version) {
      return { ok: false, error: { code: 'SETTINGS_ROLLBACK_NOT_FOUND', message: 'Requested settings version was not found.' } };
    }

    const restoredSettings = this.normalizeSettings(version.snapshot || {});
    const currentSettings = this.getSettings();
    const diff = this.buildSettingsDiff(currentSettings, restoredSettings);

    state.settings = restoredSettings;
    state.settingsHistory = [
      {
        versionId: `settings-${Date.now()}`,
        changedAt: new Date().toISOString(),
        changedBy: typeof actor?.changedBy === 'string' && actor.changedBy.trim() ? actor.changedBy.trim() : 'unknown',
        changedFields: diff.changedFields,
        changeSummary: diff.changeSummary,
        rollbackOf: versionId,
        snapshot: restoredSettings,
      },
      ...history,
    ].slice(0, 100);
    this.writeState(state);
    return { ok: true, settings: restoredSettings, rollbackOf: versionId };
  }

  saveSettings(payload, actor = {}) {
    const state = this.readState();
    if (Array.isArray(payload?.footer?.socialLinks) && payload.footer.socialLinks.some((entry) => !entry || typeof entry !== 'object' || !`${entry.platform || ''}`.trim() || !`${entry.label || ''}`.trim() || !this.isValidSocialUrl(`${entry.url || ''}`.trim(), `${entry.platform || ''}`.trim().toLowerCase()))) {
      return { ok: false, error: { code: 'SETTINGS_VALIDATION_ERROR', message: 'Invalid social link URL.' } };
    }
    const normalized = this.registerSettingsMediaReferences(this.normalizeSettings(payload || {}), { state });
    if (!normalized.siteSettings.siteTitle.trim() || !normalized.siteSettings.supportEmail.includes('@')) {
      return { ok: false, error: { code: 'SETTINGS_VALIDATION_ERROR', message: 'Invalid settings payload.' } };
    }

    const brandMedia = normalized.siteSettings.brandMedia;
    if (brandMedia.logo && !this.isValidMediaLink(brandMedia.logo)) {
      return { ok: false, error: { code: 'SETTINGS_VALIDATION_ERROR', message: 'Invalid logo media reference.' } };
    }
    if (brandMedia.logoDark && !this.isValidMediaLink(brandMedia.logoDark)) {
      return { ok: false, error: { code: 'SETTINGS_VALIDATION_ERROR', message: 'Invalid dark logo media reference.' } };
    }
    if (brandMedia.favicon && !this.isValidMediaLink(brandMedia.favicon)) {
      return { ok: false, error: { code: 'SETTINGS_VALIDATION_ERROR', message: 'Invalid favicon media reference.' } };
    }
    if (brandMedia.defaultSocialImage && !this.isValidMediaLink(brandMedia.defaultSocialImage)) {
      return { ok: false, error: { code: 'SETTINGS_VALIDATION_ERROR', message: 'Invalid default social image media reference.' } };
    }

    const previous = this.getSettings();
    const diff = this.buildSettingsDiff(previous, normalized);
    state.settings = normalized;
    state.settingsHistory = [
      {
        versionId: `settings-${Date.now()}`,
        changedAt: new Date().toISOString(),
        changedBy: typeof actor?.changedBy === 'string' && actor.changedBy.trim() ? actor.changedBy.trim() : 'unknown',
        changedFields: diff.changedFields,
        changeSummary: diff.changeSummary,
        snapshot: normalized,
      },
      ...(Array.isArray(state.settingsHistory) ? state.settingsHistory : []),
    ].slice(0, 100);
    this.writeState(state);
    return { ok: true, settings: normalized, audit: diff };
  }

  getSyncDiagnostics() {
    const invalidMediaReferences = this.collectAllMediaReferences().filter((entry) => !entry.isValid);
    const criticalUnresolvedMediaReferences = invalidMediaReferences.filter((entry) => this.isCriticalMediaReference(entry));
    const publishedCriticalUnresolvedMediaReferences = criticalUnresolvedMediaReferences.filter((entry) => entry.status === 'published');
    const settings = this.getSettings();

    return {
      mode: 'authoritative_remote',
      instantPublishingEnabled: settings.operationalSettings.instantPublishing,
      invalidMediaReferences,
      summary: {
        invalidMediaReferenceCount: invalidMediaReferences.length,
        criticalUnresolvedMediaReferenceCount: criticalUnresolvedMediaReferences.length,
        publishedCriticalUnresolvedMediaReferenceCount: publishedCriticalUnresolvedMediaReferences.length,
        blogCount: this.listBlogPosts().length,
        projectCount: this.listProjects().length,
        serviceCount: this.listServices().length,
        mediaCount: this.listMediaFiles().length,
      },
    };
  }

  getContentHealthSummary() {
    const blogPosts = this.listBlogPosts();
    const projects = this.listProjects();
    const services = this.listServices();
    const mediaFiles = this.listMediaFiles();
    const settings = this.getSettings();

    const seoIncompleteBlog = blogPosts.filter((post) => post.status === 'published' && (!post.seo?.title || !post.seo?.description || !post.seo?.canonicalSlug)).length;
    const seoIncompleteProjects = projects.filter((project) => project.status === 'published' && (!project.seo?.title || !project.seo?.description || !project.seo?.canonicalSlug)).length;
    const seoIncompleteServices = services.filter((service) => service.status === 'published' && (!service.seo?.title || !service.seo?.description || !service.seo?.canonicalSlug)).length;

    const missingPublishedMedia = {
      blog: blogPosts.filter((post) => post.status === 'published' && !this.getCanonicalBlogFeaturedReference(post)).length,
      projects: projects.filter((project) => {
        if (project.status !== 'published') return false;
        const refs = this.getCanonicalProjectCriticalReferences(project);
        return !refs.cardImage || !refs.heroImage;
      }).length,
      services: services.filter((service) => service.status === 'published' && !service.iconLikeAsset).length,
    };

    const invalidServiceRoutes = services.filter((service) => !SLUG_PATTERN.test(service.routeSlug || '')).length;
    const mediaMissingAlt = mediaFiles.filter((asset) => !asset.alt || !asset.alt.trim()).length;
    const missingBrandAssets = ['logo', 'logoDark', 'favicon', 'defaultSocialImage'].filter((field) => !settings.siteSettings.brandMedia?.[field]).length;
    const routeCollisions = this.collectRouteCollisions(services);
    const unresolvedMediaReferences = this.collectAllMediaReferences().filter((entry) => !entry.isValid);
    const unresolvedPublishedBlogCardMedia = unresolvedMediaReferences.filter((entry) =>
      entry.status === 'published' &&
      entry.domain === 'blog' &&
      ['featuredImage', 'mediaRoles.featuredImage', 'mediaRoles.coverImage', 'mediaRoles.cardImage'].includes(entry.field),
    );
    const unresolvedPublishedProjectCardMedia = unresolvedMediaReferences.filter((entry) =>
      entry.status === 'published' &&
      entry.domain === 'project' &&
      ['featuredImage', 'mediaRoles.cardImage', 'mediaRoles.coverImage'].includes(entry.field),
    );
    const unresolvedPublishedProjectHeroMedia = unresolvedMediaReferences.filter((entry) =>
      entry.status === 'published' &&
      entry.domain === 'project' &&
      ['mainImage', 'mediaRoles.heroImage', 'mediaRoles.coverImage'].includes(entry.field),
    );
    const unresolvedPublishedProjectGalleryMedia = unresolvedMediaReferences.filter((entry) =>
      entry.status === 'published' &&
      entry.domain === 'project' &&
      (entry.field.startsWith('images[') || entry.field.startsWith('mediaRoles.galleryImages[')),
    );
    const archivedMediaReferencedByPublished = unresolvedMediaReferences.filter((entry) => entry.status === 'published' && entry.resolution === 'archived');
    const legacyFieldUsage = {
      blog: blogPosts.filter((post) => post.featuredImage && !post.mediaRoles?.coverImage).length,
      projects: projects.filter((project) => (project.featuredImage || project.mainImage) && !project.mediaRoles?.cardImage).length,
      services: services.filter((service) => !service.routeSlug || service.routeSlug === service.slug).length,
    };

    const readinessDiagnostics = {
      blog: blogPosts.map((post) => ({
        id: post.id,
        label: post.title,
        status: post.status,
        issues: this.getBlogReadinessIssues(post),
      })),
      projects: projects.map((project) => ({
        id: project.id,
        label: project.title,
        status: project.status,
        issues: this.getProjectReadinessIssues(project),
      })),
      services: services.map((service) => ({
        id: service.id,
        label: service.title,
        status: service.status,
        issues: this.getServiceReadinessIssues(service),
      })),
    };

    const blockerDiagnostics = [...readinessDiagnostics.blog, ...readinessDiagnostics.projects, ...readinessDiagnostics.services]
      .filter((entry) => entry.issues.some((issue) => issue.severity === 'blocker'));
    const warningDiagnostics = [...readinessDiagnostics.blog, ...readinessDiagnostics.projects, ...readinessDiagnostics.services]
      .filter((entry) => entry.issues.some((issue) => issue.severity === 'warning'));

    return {
      publication: {
        blog: this.countByStatus(blogPosts),
        projects: this.countByStatus(projects),
        services: this.countByStatus(services),
      },
      quality: {
        missingPublishedMedia,
        seoIncomplete: {
          blog: seoIncompleteBlog,
          projects: seoIncompleteProjects,
          services: seoIncompleteServices,
        },
        invalidServiceRoutes,
        routeCollisions: routeCollisions.length,
        unresolvedMediaReferences: unresolvedMediaReferences.length,
        unresolvedPublishedCriticalMedia: {
          blogCard: unresolvedPublishedBlogCardMedia.length,
          projectCard: unresolvedPublishedProjectCardMedia.length,
          projectHero: unresolvedPublishedProjectHeroMedia.length,
          projectGallery: unresolvedPublishedProjectGalleryMedia.length,
          archivedReferencedByPublished: archivedMediaReferencedByPublished.length,
        },
        legacyFieldUsage,
        mediaMissingAlt,
        missingBrandAssets,
        unresolvedMediaByStatus: {
          published: unresolvedMediaReferences.filter((entry) => entry.status === 'published').length,
          draft: unresolvedMediaReferences.filter((entry) => entry.status === 'draft').length,
          inReview: unresolvedMediaReferences.filter((entry) => entry.status === 'in_review').length,
          archived: unresolvedMediaReferences.filter((entry) => entry.status === 'archived').length,
          system: unresolvedMediaReferences.filter((entry) => entry.status === 'system').length,
        },
      },
      launchReadiness: {
        blockers: [
          missingPublishedMedia.blog + missingPublishedMedia.projects + missingPublishedMedia.services > 0 ? 'published_content_missing_media' : null,
          seoIncompleteBlog + seoIncompleteProjects + seoIncompleteServices > 0 ? 'published_content_missing_seo' : null,
          invalidServiceRoutes > 0 ? 'invalid_service_routes' : null,
          routeCollisions.length > 0 ? 'service_route_collisions' : null,
          unresolvedMediaReferences.length > 0 ? 'unresolved_media_references' : null,
          missingBrandAssets > 0 ? 'missing_brand_assets' : null,
        ].filter(Boolean),
        summary: {
          blockerCount: blockerDiagnostics.length,
          warningCount: warningDiagnostics.length,
          publishReadyCount:
            readinessDiagnostics.blog.filter((entry) => entry.status === 'published' && entry.issues.every((issue) => issue.severity !== 'blocker')).length +
            readinessDiagnostics.projects.filter((entry) => entry.status === 'published' && entry.issues.every((issue) => issue.severity !== 'blocker')).length +
            readinessDiagnostics.services.filter((entry) => entry.status === 'published' && entry.issues.every((issue) => issue.severity !== 'blocker')).length,
          publishedCount:
            readinessDiagnostics.blog.filter((entry) => entry.status === 'published').length +
            readinessDiagnostics.projects.filter((entry) => entry.status === 'published').length +
            readinessDiagnostics.services.filter((entry) => entry.status === 'published').length,
        },
        topIssues: blockerDiagnostics.concat(warningDiagnostics).slice(0, 8).map((entry) => ({
          id: entry.id,
          label: entry.label,
          status: entry.status,
          issues: entry.issues.slice(0, 3),
        })),
      },
      mediaRolePresets: Array.from(MEDIA_ROLE_PRESETS),
      releaseReadinessChecks: this.getReleaseReadinessChecks({
        unresolvedMediaReferences,
        unresolvedPublishedBlogCardMedia,
        unresolvedPublishedProjectCardMedia,
        unresolvedPublishedProjectHeroMedia,
        unresolvedPublishedProjectGalleryMedia,
        missingPublishedMedia,
        seoIncompleteBlog,
        seoIncompleteProjects,
        seoIncompleteServices,
        invalidServiceRoutes,
        routeCollisions,
      }),
    };
  }

  countByStatus(entries) {
    return entries.reduce((acc, entry) => {
      const status = entry.status || 'draft';
      acc[status] = (acc[status] || 0) + 1;
      return acc;
    }, { draft: 0, in_review: 0, published: 0, archived: 0 });
  }

  evaluatePublishability(post) {
    if (!post.title?.trim() || !post.slug?.trim()) {
      return { ok: false, message: 'Missing required publish fields.' };
    }
    if (!this.isValidDate(post.publishedDate)) {
      return { ok: false, message: 'Published date must be a valid ISO date.' };
    }
    const featuredReference = this.getCanonicalBlogFeaturedReference(post);
    if (featuredReference && !this.isValidMediaLink(featuredReference)) {
      return { ok: false, message: 'Featured image must be a valid URL or media reference.' };
    }
    return { ok: true };
  }


  evaluateProjectPublishability(project) {
    if (!project.title?.trim() || !project.slug?.trim()) {
      return { ok: false, message: 'Missing required publish fields.' };
    }
    return { ok: true };
  }

  evaluateServicePublishability(service) {
    const blockers = this.getServiceReadinessIssues(service).filter((issue) => issue.severity === 'blocker');
    if (blockers.length > 0) {
      return { ok: false, message: blockers[0].message };
    }
    return { ok: true };
  }

  getBlogReadinessIssues(post) {
    const issues = [];
    if (post.status !== 'published') return issues;
    if (!post.title?.trim() || !post.slug?.trim()) {
      issues.push({ severity: 'blocker', code: 'blog_missing_required_publish_fields', message: 'Article publié sans titre ou slug.' });
    }
    if (!this.getCanonicalBlogFeaturedReference(post)) {
      issues.push({ severity: 'warning', code: 'blog_missing_featured_media', message: 'Article publié sans image vedette; le site utilisera son visuel de repli.' });
    }
    if (!this.isValidDate(post.publishedDate)) {
      issues.push({ severity: 'blocker', code: 'blog_invalid_publish_date', message: 'Date de publication blog invalide.' });
    }
    const featuredReference = this.getCanonicalBlogFeaturedReference(post);
    if (featuredReference && !this.isValidMediaLink(featuredReference)) {
      issues.push({ severity: 'blocker', code: 'blog_invalid_featured_media', message: 'Image vedette blog invalide (URL ou media:asset-id attendu).' });
    }
    if (!post.seo?.title || !post.seo?.description || !post.seo?.canonicalSlug) {
      issues.push({ severity: 'warning', code: 'blog_seo_incomplete', message: 'SEO blog incomplet (title/description/canonicalSlug).' });
    }
    if (!post.seo?.socialImage && !post.mediaRoles?.socialImage) {
      issues.push({ severity: 'warning', code: 'blog_missing_social_image', message: 'Aucune image sociale explicite pour le blog.' });
    }
    if (post.featuredImage && !post.mediaRoles?.coverImage) {
      issues.push({ severity: 'warning', code: 'blog_legacy_media_field', message: 'Article blog reposant sur featuredImage legacy sans mediaRoles.coverImage.' });
    }
    return issues;
  }

  getProjectReadinessIssues(project) {
    const issues = [];
    if (project.status !== 'published') return issues;
    if (!project.title?.trim() || !project.slug?.trim() || !project.featuredImage?.trim()) {
      issues.push({ severity: 'blocker', code: 'project_missing_required_publish_fields', message: 'Projet publié sans titre/slug/image carte complète.' });
    }
    const refs = this.getCanonicalProjectCriticalReferences(project);
    if (!this.isValidMediaLink(refs.cardImage)) {
      issues.push({ severity: 'blocker', code: 'project_invalid_featured_media', message: 'Image carte projet invalide.' });
    }
    if (!this.isValidMediaLink(refs.heroImage)) {
      issues.push({ severity: 'blocker', code: 'project_invalid_hero_media', message: 'Image hero projet invalide.' });
    }
    if (refs.galleryImages.some((image) => !this.isValidMediaLink(image))) {
      issues.push({ severity: 'warning', code: 'project_invalid_gallery_media', message: 'Galerie projet avec média non résolu (fallback utilisé en public).' });
    }
    const summarySource = typeof project.summary === 'string' && project.summary.trim()
      ? project.summary.trim()
      : `${project.description || ''}`.trim();
    if (!hasMinTrimmedLength(summarySource, 24)) {
      issues.push({ severity: 'blocker', code: 'project_summary_too_short', message: 'Résumé/description projet insuffisant pour la publication.' });
    }
    if (!project.mediaRoles?.cardImage || !project.mediaRoles?.heroImage) {
      issues.push({ severity: 'warning', code: 'project_missing_media_roles', message: 'Projet sans mediaRoles cardImage/heroImage complets.' });
    }
    if (!project.seo?.title || !project.seo?.description || !project.seo?.canonicalSlug) {
      issues.push({ severity: 'warning', code: 'project_seo_incomplete', message: 'SEO projet incomplet (title/description/canonicalSlug).' });
    }
    if ((project.featuredImage || project.mainImage) && !project.mediaRoles?.cardImage) {
      issues.push({ severity: 'warning', code: 'project_legacy_media_field', message: 'Projet s’appuie sur featuredImage/mainImage legacy.' });
    }
    return issues;
  }

  getCanonicalBlogFeaturedReference(post) {
    return requiredTrimmed(post?.mediaRoles?.featuredImage) ||
      requiredTrimmed(post?.mediaRoles?.coverImage) ||
      requiredTrimmed(post?.mediaRoles?.cardImage) ||
      requiredTrimmed(post?.featuredImage);
  }

  getCanonicalProjectCriticalReferences(project) {
    const cardImage = requiredTrimmed(project?.mediaRoles?.cardImage) ||
      requiredTrimmed(project?.mediaRoles?.heroImage) ||
      requiredTrimmed(project?.mediaRoles?.coverImage) ||
      requiredTrimmed(project?.featuredImage) ||
      requiredTrimmed(project?.mainImage);
    const heroImage = requiredTrimmed(project?.mediaRoles?.heroImage) ||
      requiredTrimmed(project?.mediaRoles?.coverImage) ||
      requiredTrimmed(project?.mediaRoles?.cardImage) ||
      requiredTrimmed(project?.mainImage) ||
      requiredTrimmed(project?.featuredImage) ||
      cardImage;
    const galleryImages =
      Array.isArray(project?.mediaRoles?.galleryImages) && project.mediaRoles.galleryImages.length > 0
        ? normalizeStringArray(project.mediaRoles.galleryImages)
        : Array.isArray(project?.images) && project.images.length > 0
          ? normalizeStringArray(project.images)
          : heroImage
            ? [heroImage]
            : [];

    return { cardImage, heroImage, galleryImages };
  }

  getServiceReadinessIssues(service) {
    const issues = [];
    if (service.status !== 'published') return issues;
    if (!service.routeSlug || !isValidSlug(service.routeSlug)) {
      issues.push({ severity: 'blocker', code: 'service_invalid_route_slug', message: 'Service publié avec routeSlug invalide.' });
    }
    if (!service.description?.trim() || !Array.isArray(service.features) || service.features.length === 0) {
      issues.push({ severity: 'blocker', code: 'service_missing_core_fields', message: 'Service publié sans description/fonctionnalités complètes.' });
    }
    if (service.ctaPrimaryHref && !isValidContentHrefContract(service.ctaPrimaryHref)) {
      issues.push({ severity: 'blocker', code: 'service_invalid_cta_href', message: 'CTA principal service invalide (ancre, route ou URL https).' });
    }
    if (!service.iconLikeAsset) {
      issues.push({ severity: 'warning', code: 'service_missing_icon_asset', message: 'Service sans iconLikeAsset explicite pour les surfaces CMS.' });
    }
    if (!service.seo?.title || !service.seo?.description || !service.seo?.canonicalSlug) {
      issues.push({ severity: 'warning', code: 'service_seo_incomplete', message: 'SEO service incomplet (title/description/canonicalSlug).' });
    }
    if (service.ctaPrimaryLabel && !service.ctaPrimaryHref) {
      issues.push({ severity: 'warning', code: 'service_partial_cta', message: 'Service avec label CTA sans lien correspondant.' });
    }
    return issues;
  }

  getReleaseReadinessChecks(context) {
    const checks = [
      {
        id: 'published-critical-media-resolved',
        level: 'blocker',
        status: context.unresolvedPublishedBlogCardMedia.length + context.unresolvedPublishedProjectCardMedia.length + context.unresolvedPublishedProjectHeroMedia.length > 0 ? 'failed' : 'passed',
        message: 'Published blog/project critical card & hero media references must resolve.',
      },
      {
        id: 'published-gallery-media-resolved',
        level: 'warning',
        status: context.unresolvedPublishedProjectGalleryMedia.length > 0 ? 'failed' : 'passed',
        message: 'Published project gallery references should resolve to active media.',
      },
      {
        id: 'published-essential-media-present',
        level: 'blocker',
        status: context.missingPublishedMedia.blog + context.missingPublishedMedia.projects + context.missingPublishedMedia.services > 0 ? 'failed' : 'passed',
        message: 'Published entities must include required essential media.',
      },
      {
        id: 'published-seo-required',
        level: 'warning',
        status: context.seoIncompleteBlog + context.seoIncompleteProjects + context.seoIncompleteServices > 0 ? 'failed' : 'passed',
        message: 'Published entities should include complete SEO title/description/canonical slug.',
      },
      {
        id: 'service-routing-consistency',
        level: 'blocker',
        status: context.invalidServiceRoutes + context.routeCollisions.length > 0 ? 'failed' : 'passed',
        message: 'Service route slugs must be valid and collision-free.',
      },
      {
        id: 'global-media-reference-resolve-rate',
        level: 'warning',
        status: context.unresolvedMediaReferences.length > 0 ? 'failed' : 'passed',
        message: 'All media: references should resolve or be explicitly remediated before release.',
      },
    ];

    return checks.map((check) => ({ ...check, checkedAt: new Date().toISOString() }));
  }

  collectRouteCollisions(services) {
    const bySlug = new Map();
    services.forEach((service) => {
      const slug = `${service.routeSlug || ''}`.trim();
      if (!slug) return;
      const entries = bySlug.get(slug) || [];
      entries.push(service.id);
      bySlug.set(slug, entries);
    });
    return Array.from(bySlug.entries()).filter(([, ids]) => ids.length > 1).map(([slug, ids]) => ({ slug, ids }));
  }

  isAllowedTransition(current, target) {
    const map = {
      draft: new Set(['in_review', 'archived']),
      in_review: new Set(['draft', 'published', 'archived']),
      published: new Set(['draft', 'archived']),
      archived: new Set(['draft']),
    };

    return Boolean(map[current] && map[current].has(target));
  }

  normalizePost(raw, actor = {}) {
    const nowIso = new Date().toISOString();
    const createdAt = this.isValidDate(raw?.createdAt)
      ? new Date(raw.createdAt).toISOString()
      : this.isValidDate(raw?.publishedDate)
        ? new Date(raw.publishedDate).toISOString()
        : nowIso;
    const isMutation = Boolean(actor.userId || actor.organizationId);
    const status = BLOG_STATUSES.has(raw?.status) ? raw.status : 'published';
    const title = typeof raw?.title === 'string' ? raw.title.trim() : '';
    const slug = this.normalizeSlug(typeof raw?.slug === 'string' ? raw.slug : title || raw?.id || 'article');
    const excerpt = typeof raw?.excerpt === 'string' ? raw.excerpt.trim() : typeof raw?.summary === 'string' ? raw.summary.trim() : '';
    const content = typeof raw?.content === 'string' ? raw.content.trim() : typeof raw?.body === 'string' ? raw.body.trim() : '';
    const directImage = [raw?.mediaRoles?.featuredImage, raw?.featuredImage, raw?.coverImage, raw?.image, raw?.imageUrl, raw?.socialImage]
      .find((value) => typeof value === 'string' && value.trim());
    const featuredImage = typeof directImage === 'string' ? directImage.trim() : '';
    const canonicalSlug = this.normalizeSlug((raw?.seo && raw.seo.canonicalSlug) || slug || title || 'article');
    const socialImage =
      (raw?.mediaRoles && typeof raw.mediaRoles.socialImage === 'string' && raw.mediaRoles.socialImage.trim()) ||
      (raw?.seo && typeof raw.seo.socialImage === 'string' && raw.seo.socialImage.trim()) ||
      (typeof raw?.socialImage === 'string' && raw.socialImage.trim()) ||
      featuredImage;

    return {
      ...raw,
      id: typeof raw?.id === 'string' && raw.id.trim() ? raw.id.trim() : `post-${crypto.randomUUID()}`,
      status,
      title,
      slug,
      excerpt,
      summary: typeof raw?.summary === 'string' ? raw.summary.trim() : excerpt,
      content,
      contentBlocks: Array.isArray(raw?.contentBlocks) ? raw.contentBlocks.filter((block) => block && typeof block === 'object').map((block, index) => ({
        id: typeof block.id === 'string' && block.id.trim() ? block.id.trim() : `block-${index + 1}`,
        type: ['paragraph', 'heading', 'image'].includes(block.type) ? block.type : 'paragraph',
        text: typeof block.text === 'string' ? block.text.trim() : '',
        media: typeof block.media === 'string' ? block.media.trim() : '',
        title: typeof block.title === 'string' ? block.title.trim() : '',
        caption: typeof block.caption === 'string' ? block.caption.trim() : '',
        layout: ['full', 'left', 'right'].includes(block.layout) ? block.layout : 'full',
      })) : [],
      body: typeof raw?.body === 'string' ? raw.body.trim() : content,
      author: typeof raw?.author === 'string' ? raw.author.trim() : '',
      authorRole: typeof raw?.authorRole === 'string' ? raw.authorRole.trim() : '',
      category: typeof raw?.category === 'string' ? this.normalizeBlogCategory(raw.category) : '',
      tags: this.normalizeBlogTags(raw?.tags),
      publishedDate: this.isValidDate(raw?.publishedDate) ? new Date(raw.publishedDate).toISOString() : nowIso,
      readTime: typeof raw?.readTime === 'string' ? raw.readTime.trim() : '',
      featuredImage,
      images: Array.isArray(raw?.images) ? raw.images.map((entry) => `${entry}`.trim()).filter(Boolean) : [],
      seo: {
        ...(raw?.seo || {}),
        title: typeof raw?.seo?.title === 'string' ? raw.seo.title.trim() : '',
        description: typeof raw?.seo?.description === 'string' ? raw.seo.description.trim() : '',
        canonicalSlug,
        socialImage,
        noIndex: Boolean(raw?.seo?.noIndex),
        canonicalUrl: typeof raw?.seo?.canonicalUrl === 'string' ? raw.seo.canonicalUrl.trim() : '',
      },
      mediaRoles: {
        ...(raw?.mediaRoles || {}),
        featuredImage,
        coverImage: (raw?.mediaRoles?.coverImage || featuredImage || '').trim(),
        cardImage: (raw?.mediaRoles?.cardImage || featuredImage || '').trim(),
        socialImage,
      },
      createdAt,
      updatedAt: isMutation ? nowIso : (this.isValidDate(raw?.updatedAt) ? new Date(raw.updatedAt).toISOString() : createdAt),
      ownerUserId: typeof raw?.ownerUserId === 'string' && raw.ownerUserId.trim() ? raw.ownerUserId.trim() : actor.userId || 'system',
      organizationId:
        typeof raw?.organizationId === 'string' && raw.organizationId.trim()
          ? raw.organizationId.trim().toLowerCase()
          : actor.organizationId || DEFAULT_ORGANIZATION_ID,
      updatedBy: actor.userId || (typeof raw?.updatedBy === 'string' ? raw.updatedBy : 'system'),
    };
  }

  isValidDate(value) {
    if (typeof value !== 'string' || !value.trim()) return false;
    return !Number.isNaN(Date.parse(value));
  }

  isValidHttpUrl(value) {
    return isHttpUrl(value);
  }

  isValidContentHref(value) {
    return isValidContentHrefContract(value);
  }

  isMediaReference(value) {
    return isMediaReferenceContract(value);
  }

  mediaIdFromReference(value) {
    return mediaIdFromReferenceContract(value);
  }

  doesMediaReferenceExist(value) {
    if (!this.isMediaReference(value)) return false;
    const mediaId = this.mediaIdFromReference(value);
    if (!mediaId) return false;
    return this.listMediaFiles().some((entry) => entry.id === mediaId);
  }

  isValidMediaLink(value) {
    return isValidMediaFieldValue(value, {
      allowInlineText: false,
      hasMediaById: (mediaId) => this.listMediaFiles().some((entry) => entry.id === mediaId),
    });
  }

  validateBlogPost(post) {
    const featuredReference = this.getCanonicalBlogFeaturedReference(post);
    return Boolean(
      post &&
      typeof post.id === 'string' && post.id.trim() &&
      typeof post.title === 'string' && post.title.trim() &&
      typeof post.slug === 'string' && isValidSlug(post.slug) &&
      (!featuredReference || this.isValidMediaLink(featuredReference)) &&
      BLOG_STATUSES.has(post.status)
    );
  }

  normalizeProject(project, actor = {}) {
    const asTrimmedString = requiredTrimmed;
    const title = asTrimmedString(project?.title);
    const slug = this.normalizeSlug(asTrimmedString(project?.slug) || title || asTrimmedString(project?.id));
    const status = PROJECT_STATUSES.has(project?.status) ? project.status : 'published';
    const nowIso = new Date().toISOString();

    const roleCardImage = asTrimmedString(project?.mediaRoles?.cardImage);
    const roleHeroImage = asTrimmedString(project?.mediaRoles?.heroImage);
    const roleCoverImage = asTrimmedString(project?.mediaRoles?.coverImage);
    const roleSocialImage = asTrimmedString(project?.mediaRoles?.socialImage);
    const seoSocialImage = asTrimmedString(project?.seo?.socialImage);
    const roleGalleryImages = Array.isArray(project?.mediaRoles?.galleryImages) ? normalizeStringArray(project.mediaRoles.galleryImages) : [];
    const directMedia = asTrimmedString(project?.media) || asTrimmedString(project?.image) || asTrimmedString(project?.imageUrl) || asTrimmedString(project?.cardImage) || asTrimmedString(project?.heroImage);
    const featuredImage =
      roleCardImage ||
      roleHeroImage ||
      roleCoverImage ||
      asTrimmedString(project?.featuredImage) ||
      asTrimmedString(project?.cardImage) ||
      asTrimmedString(project?.mainImage) ||
      asTrimmedString(project?.heroImage) ||
      directMedia ||
      ''; 
    const heroImage =
      roleHeroImage ||
      roleCoverImage ||
      roleCardImage ||
      asTrimmedString(project?.mainImage) ||
      asTrimmedString(project?.featuredImage) ||
      featuredImage;
    const galleryImages = roleGalleryImages.length > 0
      ? roleGalleryImages
      : Array.isArray(project?.images)
        ? normalizeStringArray(project.images)
        : heroImage
          ? [heroImage]
          : [];
    const liveLink =
      asTrimmedString(project?.links?.live) ||
      asTrimmedString(project?.link) ||
      asTrimmedString(project?.externalLink);
    const caseStudyLink =
      asTrimmedString(project?.links?.caseStudy) ||
      asTrimmedString(project?.caseStudyLink);

    const canonicalSlug = this.normalizeSlug(asTrimmedString(project?.seo?.canonicalSlug) || slug || title);

    return {
      ...project,
      id: asTrimmedString(project?.id) || `project-${Date.now()}`,
      title,
      slug,
      summary: asTrimmedString(project?.summary) || asTrimmedString(project?.description).slice(0, 180) || '',
      client: asTrimmedString(project?.client),
      category: asTrimmedString(project?.category),
      year: asTrimmedString(project?.year) || new Date().getFullYear().toString(),
      description: asTrimmedString(project?.description) || asTrimmedString(project?.summary) || '',
      challenge: asTrimmedString(project?.challenge) || '',
      solution: asTrimmedString(project?.solution) || '',
      results: normalizeStringArray(project?.results),
      tags: normalizeStringArray(project?.tags),
      mainImage: heroImage,
      featuredImage,
      imageAlt: asTrimmedString(project?.imageAlt) || title || 'Projet SMOVE',
      images: galleryImages,
      mediaRoles: {
        cardImage: featuredImage,
        heroImage,
        coverImage: roleCoverImage || heroImage || featuredImage,
        socialImage: roleSocialImage || seoSocialImage || roleCardImage || roleHeroImage || featuredImage,
        galleryImages,
      },
      seo: {
        title: asTrimmedString(project?.seo?.title) || title || 'Projet SMOVE',
        description: asTrimmedString(project?.seo?.description) || asTrimmedString(project?.summary) || asTrimmedString(project?.description) || 'Projet SMOVE',
        canonicalSlug,
        socialImage: roleSocialImage || seoSocialImage || roleCardImage || roleHeroImage || featuredImage,
      },
      featured: Boolean(project?.featured),
      status,
      archived: typeof project?.archived === 'boolean' ? project.archived : false,
      deleted: typeof project?.deleted === 'boolean' ? project.deleted : false,
      reviewedAt: typeof project?.reviewedAt === 'string' ? project.reviewedAt : undefined,
      reviewedBy: typeof project?.reviewedBy === 'string' ? project.reviewedBy.trim() || undefined : undefined,
      createdAt: project?.createdAt || nowIso,
      updatedAt: nowIso,
      link: liveLink || undefined,
      links: liveLink || caseStudyLink
        ? {
            live: liveLink || undefined,
            caseStudy: caseStudyLink || undefined,
          }
        : undefined,
      testimonial:
        project?.testimonial &&
        typeof project.testimonial === 'object' &&
        typeof project.testimonial.text === 'string' &&
        typeof project.testimonial.author === 'string' &&
        typeof project.testimonial.position === 'string' &&
        project.testimonial.text.trim() &&
        project.testimonial.author.trim() &&
        project.testimonial.position.trim()
          ? {
              text: project.testimonial.text.trim(),
              author: project.testimonial.author.trim(),
              position: project.testimonial.position.trim(),
            }
          : undefined,
      ownerUserId: typeof project?.ownerUserId === 'string' && project.ownerUserId.trim() ? project.ownerUserId.trim() : actor.userId || 'system',
      organizationId:
        typeof project?.organizationId === 'string' && project.organizationId.trim()
          ? project.organizationId.trim().toLowerCase()
          : actor.organizationId || DEFAULT_ORGANIZATION_ID,
      updatedBy: actor.userId || (typeof project?.updatedBy === 'string' ? project.updatedBy : 'system'),
    };
  }

  normalizeTeamContactFields(member = {}) {
    const email = requiredTrimmed(member.email) || requiredTrimmed(member.emailAddress);
    const phone =
      requiredTrimmed(member.phone) ||
      requiredTrimmed(member.contact) ||
      requiredTrimmed(member.contactPhone) ||
      requiredTrimmed(member.telephone);
    const contact = requiredTrimmed(member.contact) || phone;
    const whatsapp = requiredTrimmed(member.whatsapp);

    return { email, phone, contact, whatsapp };
  }

  normalizeTeamMember(member, actor = {}) {
    const nowIso = new Date().toISOString();
    const id = requiredTrimmed(member?.id) || `team_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`;
    const contactFields = this.normalizeTeamContactFields(member);
    const socialLinks = Array.isArray(member?.socialLinks)
      ? member.socialLinks
          .map((link) => ({
            platform: requiredTrimmed(link?.platform).toLowerCase(),
            label: requiredTrimmed(link?.label) || requiredTrimmed(link?.platform),
            url: requiredTrimmed(link?.url),
          }))
          .filter((link) => link.platform && link.label && isValidOptionalHttpUrl(link.url))
      : [];

    return {
      ...member,
      id,
      name: requiredTrimmed(member?.name),
      role: requiredTrimmed(member?.role),
      bio: requiredTrimmed(member?.bio),
      photo: requiredTrimmed(member?.photo),
      email: contactFields.email,
      phone: contactFields.phone,
      contact: contactFields.contact,
      whatsapp: contactFields.whatsapp,
      socialLinks,
      order: Number.isFinite(Number(member?.order)) ? Number(member.order) : 0,
      status: TEAM_STATUSES.has(member?.status) ? member.status : 'published',
      featured: Boolean(member?.featured),
      createdAt: member?.createdAt || nowIso,
      updatedAt: nowIso,
      ownerUserId: requiredTrimmed(member?.ownerUserId) || actor.userId || 'system',
      organizationId: requiredTrimmed(member?.organizationId).toLowerCase() || actor.organizationId || DEFAULT_ORGANIZATION_ID,
      updatedBy: actor.userId || requiredTrimmed(member?.updatedBy) || 'system',
    };
  }

  validateTeamMember(member) {
    const photo = requiredTrimmed(member?.photo);
    return Boolean(
      member &&
        requiredTrimmed(member.id) &&
        requiredTrimmed(member.name) &&
        requiredTrimmed(member.role) &&
        typeof member.bio === 'string' &&
        (!photo || this.isValidMediaLink(photo)) &&
        (member.email === '' || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(member.email)) &&
        Array.isArray(member.socialLinks) &&
        member.socialLinks.every((link) => requiredTrimmed(link.platform) && requiredTrimmed(link.label) && isValidOptionalHttpUrl(link.url)) &&
        Number.isFinite(Number(member.order)) &&
        TEAM_STATUSES.has(member.status) &&
        requiredTrimmed(member.ownerUserId) &&
        requiredTrimmed(member.organizationId)
    );
  }


  validateProject(project) {
    const isOptionalMediaLink = (value) => {
      const trimmed = requiredTrimmed(value);
      return !trimmed || this.isValidMediaLink(trimmed);
    };

    return Boolean(
      project &&
        typeof project.id === 'string' &&
        project.id.length > 0 &&
        typeof project.title === 'string' &&
        project.title.trim().length > 0 &&
        typeof project.slug === 'string' &&
        project.slug.length > 0 &&
        isValidSlug(project.slug) &&
        typeof project.client === 'string' &&
        typeof project.category === 'string' &&
        typeof project.year === 'string' &&
        typeof project.description === 'string' &&
        typeof project.challenge === 'string' &&
        typeof project.solution === 'string' &&
        Array.isArray(project.results) &&
        Array.isArray(project.tags) &&
        typeof project.mainImage === 'string' &&
        isOptionalMediaLink(project.mainImage) &&
        typeof project.featuredImage === 'string' &&
        isOptionalMediaLink(project.featuredImage) &&
        isOptionalMediaLink(project.image) &&
        isOptionalMediaLink(project.imageUrl) &&
        isOptionalMediaLink(project.media) &&
        isOptionalMediaLink(project.cardImage) &&
        isOptionalMediaLink(project.heroImage) &&
        isOptionalMediaLink(project.featuredImage) &&
        typeof project.imageAlt === 'string' &&
        (project.mediaRoles === undefined ||
          (typeof project.mediaRoles === 'object' &&
            isOptionalMediaLink(project.mediaRoles.cardImage) &&
            isOptionalMediaLink(project.mediaRoles.heroImage) &&
            isOptionalMediaLink(project.mediaRoles.coverImage) &&
            isOptionalMediaLink(project.mediaRoles.socialImage) &&
            (project.mediaRoles.galleryImages === undefined || (Array.isArray(project.mediaRoles.galleryImages) && project.mediaRoles.galleryImages.every((image) => isOptionalMediaLink(image)))))) &&
        (project.seo === undefined ||
          (typeof project.seo === 'object' &&
            (project.seo.title === undefined || typeof project.seo.title === 'string') &&
            (project.seo.description === undefined || typeof project.seo.description === 'string') &&
            (project.seo.canonicalSlug === undefined || isValidSlug(project.seo.canonicalSlug)) &&
            isOptionalMediaLink(project.seo.socialImage))) &&
        (project.link === undefined || isValidOptionalHttpUrl(project.link)) &&
        (project.links === undefined ||
          (typeof project.links === 'object' &&
            (project.links.live === undefined || isValidOptionalHttpUrl(project.links.live)) &&
            (project.links.caseStudy === undefined || isValidOptionalHttpUrl(project.links.caseStudy)))) &&
        (project.testimonial === undefined ||
          (typeof project.testimonial === 'object' &&
            typeof project.testimonial.text === 'string' &&
            typeof project.testimonial.author === 'string' &&
            typeof project.testimonial.position === 'string')) &&
        Array.isArray(project.images) &&
        project.images.every((image) => isOptionalMediaLink(image)) &&
        typeof project.ownerUserId === 'string' &&
        project.ownerUserId.trim().length > 0 &&
        typeof project.organizationId === 'string' &&
        project.organizationId.trim().length > 0 &&
        PROJECT_STATUSES.has(project.status)
    );
  }



  normalizeService(service, actor = {}) {
    const asTrimmedString = requiredTrimmed;
    const title = asTrimmedString(service?.title);
    const nowIso = new Date().toISOString();
    const routeSlug = this.normalizeSlug(asTrimmedString(service?.routeSlug) || asTrimmedString(service?.slug) || title || asTrimmedString(service?.id));
    const canonicalSlug = this.normalizeSlug(asTrimmedString(service?.seo?.canonicalSlug) || routeSlug || asTrimmedString(service?.slug) || title || asTrimmedString(service?.id));

    return {
      ...service,
      id: asTrimmedString(service?.id),
      title,
      slug: this.normalizeSlug(asTrimmedString(service?.slug) || title || asTrimmedString(service?.id)),
      description: asTrimmedString(service?.description),
      shortDescription: asTrimmedString(service?.shortDescription || service?.summary) || undefined,
      summary: asTrimmedString(service?.summary || service?.shortDescription) || undefined,
      detailImage: this.normalizeIconLikeAssetValue(service?.detailImage || service?.representativeImage || service?.visualMedia || service?.image || service?.media),
      detailCta: {
        title: asTrimmedString(service?.detailCta?.title || service?.ctaTitle) || undefined,
        text: asTrimmedString(service?.detailCta?.text || service?.ctaDescription) || undefined,
        buttonLabel: asTrimmedString(service?.detailCta?.buttonLabel || service?.ctaPrimaryLabel) || undefined,
        buttonUrl: asTrimmedString(service?.detailCta?.buttonUrl || service?.ctaPrimaryHref) || undefined,
      },
      icon: asTrimmedString(service?.icon) || 'palette',
      iconLikeAsset: this.normalizeIconLikeAssetValue(service?.iconLikeAsset || service?.visualMedia || service?.image || service?.media),
      representativeImage: this.normalizeIconLikeAssetValue(service?.representativeImage || service?.visualMedia || service?.iconLikeAsset || service?.image || service?.media),
      visualMedia: this.normalizeIconLikeAssetValue(service?.visualMedia),
      image: this.normalizeIconLikeAssetValue(service?.image),
      media: this.normalizeIconLikeAssetValue(service?.media),
      illustrationCards: (Array.isArray(service?.illustrationCards) ? service.illustrationCards : []).map((card, index) => ({ id: asTrimmedString(card?.id) || `card_${index + 1}`, title: asTrimmedString(card?.title), image: this.normalizeIconLikeAssetValue(card?.image), caption: asTrimmedString(card?.caption || card?.description) || undefined })).filter((card) => card.title && card.image),
      routeSlug,
      overviewTitle: asTrimmedString(service?.overviewTitle) || undefined,
      overviewDescription: asTrimmedString(service?.overviewDescription) || undefined,
      ctaTitle: asTrimmedString(service?.ctaTitle) || undefined,
      ctaDescription: asTrimmedString(service?.ctaDescription) || undefined,
      ctaPrimaryLabel: asTrimmedString(service?.ctaPrimaryLabel) || undefined,
      ctaPrimaryHref: asTrimmedString(service?.ctaPrimaryHref) || undefined,
      processTitle: asTrimmedString(service?.processTitle) || undefined,
      processSteps: normalizeStringArray(service?.processSteps),
      color: asTrimmedString(service?.color) || 'from-[#00b3e8] to-[#00c0e8]',
      features: normalizeStringArray(service?.features),
      status: SERVICE_STATUSES.has(service?.status) ? service.status : 'published',
      featured: Boolean(service?.featured),
      seo: {
        title: asTrimmedString(service?.seo?.title) || title || 'Service SMOVE',
        description: asTrimmedString(service?.seo?.description) || asTrimmedString(service?.shortDescription) || asTrimmedString(service?.description) || 'Service SMOVE',
        canonicalSlug,
        socialImage: asTrimmedString(service?.seo?.socialImage) || asTrimmedString(service?.iconLikeAsset) || undefined,
      },
      createdAt: service?.createdAt || nowIso,
      updatedAt: nowIso,
      ownerUserId: typeof service?.ownerUserId === 'string' && service.ownerUserId.trim() ? service.ownerUserId.trim() : actor.userId || 'system',
      organizationId:
        typeof service?.organizationId === 'string' && service.organizationId.trim()
          ? service.organizationId.trim().toLowerCase()
          : actor.organizationId || DEFAULT_ORGANIZATION_ID,
      updatedBy: actor.userId || (typeof service?.updatedBy === 'string' ? service.updatedBy : 'system'),
    };
  }

  normalizeIconLikeAssetValue(value) {
    const trimmed = requiredTrimmed(value);
    if (!trimmed) return undefined;
    const normalizedRelative = trimmed.replace(/^\.\/+/, '');
    const legacyAliasMatch = normalizedRelative.match(/^(?:asset:|media\/|media:\/\/)(.+)$/i);
    if (legacyAliasMatch) {
      const mediaId = requiredTrimmed(legacyAliasMatch[1]);
      return mediaId ? `${MEDIA_REFERENCE_PREFIX}${mediaId}` : undefined;
    }
    return normalizedRelative;
  }

  validateService(service) {
    return this.validateServiceForMode(service, 'update', { allowLegacyOptionals: true }).ok;
  }

  extractProvidedServiceFields(service) {
    if (!service || typeof service !== 'object') return new Set();
    const fields = new Set(Object.keys(service));
    if (service.seo && typeof service.seo === 'object') {
      Object.keys(service.seo).forEach((key) => fields.add(`seo.${key}`));
    }
    return fields;
  }

  validateServiceForMode(service, mode = 'create', options = {}) {
    const fail = (field, message) => ({ ok: false, field, message, mode });
    const isUpdate = mode === 'update';
    const providedFields = options.providedFields instanceof Set ? options.providedFields : null;
    const allowLegacyOptionals = Boolean(options.allowLegacyOptionals);
    const previousService = options.previousService && typeof options.previousService === 'object' ? options.previousService : null;
    const wasProvided = (field) => !providedFields || providedFields.has(field);
    const readPath = (obj, field) => field.split('.').reduce((acc, part) => (acc && typeof acc === 'object' ? acc[part] : undefined), obj);
    const isLegacyUnchanged = (field) => {
      if (!isUpdate || !allowLegacyOptionals || !previousService || !wasProvided(field)) return false;
      const currentValue = requiredTrimmed(readPath(service, field));
      const previousValue = requiredTrimmed(readPath(previousService, field));
      return currentValue.length > 0 && previousValue.length > 0 && currentValue === previousValue;
    };
    const shouldValidateOptional = (field) => !isUpdate || !allowLegacyOptionals || (wasProvided(field) && !isLegacyUnchanged(field));
    const describeMediaShape = (value) => {
      const trimmed = requiredTrimmed(value);
      if (!trimmed) return 'empty';
      if (this.isMediaReference(trimmed)) return 'media-reference';
      if (this.isValidHttpUrl(trimmed)) return 'url';
      if (!trimmed.includes('://')) return 'text-or-relative-path';
      return 'unknown-scheme';
    };

    if (!service || typeof service !== 'object') return fail('service', 'payload must be an object');
    if (typeof service.id !== 'string' || !service.id.length) return fail('id', 'id is required');
    if (typeof service.title !== 'string' || !service.title.length) return fail('title', 'title is required');
    if (typeof service.slug !== 'string' || !service.slug.length || !isValidSlug(service.slug)) {
      return fail('slug', 'slug is required and must be a valid slug');
    }
    if (typeof service.routeSlug !== 'string' || !service.routeSlug.length || !isValidSlug(service.routeSlug)) {
      return fail('routeSlug', 'routeSlug is required and must be a valid slug');
    }
    if (service.iconLikeAsset !== undefined && shouldValidateOptional('iconLikeAsset') && !this.isValidMediaLink(service.iconLikeAsset)) {
      return fail('iconLikeAsset', `iconLikeAsset must be a valid URL/text/media reference (received ${describeMediaShape(service.iconLikeAsset)})`);
    }
    if (service.seo !== undefined) {
      if (typeof service.seo !== 'object' || service.seo === null) return fail('seo', 'seo must be an object');
      if (service.seo.title !== undefined && typeof service.seo.title !== 'string') return fail('seo.title', 'seo.title must be a string');
      if (service.seo.description !== undefined && typeof service.seo.description !== 'string') return fail('seo.description', 'seo.description must be a string');
      if (service.seo.canonicalSlug !== undefined && !isValidSlug(service.seo.canonicalSlug)) return fail('seo.canonicalSlug', 'seo.canonicalSlug must be a valid slug');
      if (service.seo.socialImage !== undefined && shouldValidateOptional('seo.socialImage') && !this.isValidMediaLink(service.seo.socialImage)) return fail('seo.socialImage', 'seo.socialImage must be a valid media link');
    }

    if (!isUpdate) {
      if (typeof service.description !== 'string' || !service.description.length) return fail('description', 'description is required on create');
      if (!Array.isArray(service.features) || service.features.length === 0) return fail('features', 'at least one feature is required on create');
    } else {
      if (service.description !== undefined && typeof service.description !== 'string') return fail('description', 'description must be a string');
      if (service.features !== undefined && !Array.isArray(service.features)) return fail('features', 'features must be an array when provided');
    }

    if (!isUpdate && (typeof service.icon !== 'string' || !service.icon.length || !SERVICE_ICONS.has(service.icon))) {
      return fail('icon', 'icon is required and must be a supported service icon');
    }
    if (!isUpdate && (typeof service.color !== 'string' || !service.color.length || !COLOR_GRADIENT_PATTERN.test(service.color))) {
      return fail('color', 'color is required and must match the gradient format');
    }
    if (!Array.isArray(service.features)) return fail('features', 'features must be an array');
    if (typeof service.ownerUserId !== 'string' || !service.ownerUserId.trim().length) return fail('ownerUserId', 'ownerUserId is required');
    if (typeof service.organizationId !== 'string' || !service.organizationId.trim().length) return fail('organizationId', 'organizationId is required');
    if (!SERVICE_STATUSES.has(service.status)) return fail('status', 'status must be draft, published, or archived');
    if (service.processTitle !== undefined && typeof service.processTitle !== 'string') return fail('processTitle', 'processTitle must be a string');
    if (service.processSteps !== undefined && shouldValidateOptional('processSteps') && (!Array.isArray(service.processSteps) || service.processSteps.some((step) => typeof step !== 'string' || step.trim().length === 0))) {
      return fail('processSteps', 'processSteps must be a non-empty string array');
    }

    return { ok: true, mode };
  }

  normalizeSlug(input) {
    return normalizeSharedSlug(input);
  }

  normalizeMediaFile(file) {
    const nowIso = new Date().toISOString();
    const safeFile = file && typeof file === 'object' ? file : {};
    const rawType = requiredTrimmed(safeFile.type || safeFile.mediaType).toLowerCase();
    const normalizedType = rawType === 'document' ? 'file' : (MEDIA_TYPES.has(rawType) ? rawType : this.inferMediaTypeFromLink(safeFile.url || safeFile.publicPath || safeFile.filename || safeFile.originalName));

    const extractUploadPath = (value) => {
      const normalized = requiredTrimmed(value).replace(/\\/g, '/');
      if (!normalized) return '';
      const uploadsIndex = normalized.lastIndexOf('/uploads/');
      if (uploadsIndex >= 0) return normalized.slice(uploadsIndex);
      const dataUploadsIndex = normalized.lastIndexOf('data/uploads/');
      if (dataUploadsIndex >= 0) return `/uploads/${normalized.slice(dataUploadsIndex + 'data/uploads/'.length)}`;
      if (normalized.startsWith('uploads/')) return `/${normalized}`;
      return '';
    };

    const explicitFilename = requiredTrimmed(safeFile.filename) || requiredTrimmed(safeFile.originalName);
    const extractedPath = extractUploadPath(safeFile.publicPath || safeFile.url || safeFile.publicUrl || safeFile.thumbnailUrl || safeFile.path || safeFile.storagePath || explicitFilename || safeFile.name);
    const rawFilename = explicitFilename || extractedPath || requiredTrimmed(safeFile.name);
    const normalizedFilename = rawFilename.replace(/^\/?uploads\//, '') || extractedPath.replace(/^\/uploads\//, '');
    const normalizedName = requiredTrimmed(safeFile.name || safeFile.label || safeFile.title || safeFile.originalName || normalizedFilename || safeFile.id) || 'media-file';
    const normalizedAlt = requiredTrimmed(safeFile.alt) || normalizedName;

    const absolutizeMediaUrl = (value) => {
      const normalized = requiredTrimmed(value);
      if (!normalized) return '';
      if (HTTP_SCHEME_PATTERN.test(normalized) || normalized.startsWith('//') || normalized.startsWith('data:')) return normalized;
      const path = extractUploadPath(normalized);
      if (path) return `${API_ORIGIN}${path}`;
      if (normalized.startsWith('/')) return `${API_ORIGIN}${normalized}`;
      if (normalized.startsWith('uploads/') || normalized.startsWith('media/')) return `${API_ORIGIN}/${normalized}`;
      return '';
    };

    const publicPath = requiredTrimmed(safeFile.publicPath) || extractedPath || (normalizedFilename ? `/uploads/${normalizedFilename}` : '');
    const normalizedUrl = absolutizeMediaUrl(safeFile.url || safeFile.publicUrl || publicPath || normalizedFilename);
    const normalizedThumbnailUrl = absolutizeMediaUrl(safeFile.thumbnailUrl || normalizedUrl || publicPath);
    const normalizedVariants = this.normalizeMediaVariants(safeFile.variants, {
      ...safeFile,
      url: normalizedUrl,
      thumbnailUrl: normalizedThumbnailUrl,
    });

    return {
      ...safeFile,
      id: requiredTrimmed(safeFile.id) || `media_${crypto.randomUUID()}`,
      type: normalizedType,
      name: normalizedName,
      filename: normalizedFilename,
      originalName: requiredTrimmed(safeFile.originalName) || normalizedName,
      mimeType: requiredTrimmed(safeFile.mimeType) || requiredTrimmed(safeFile.metadata?.mimeType),
      title: requiredTrimmed(safeFile.title) || normalizedName,
      label: requiredTrimmed(safeFile.label) || requiredTrimmed(safeFile.title) || normalizedName,
      alt: normalizedAlt,
      caption: requiredTrimmed(safeFile.caption) || normalizedAlt,
      width: typeof safeFile.width === 'number' && safeFile.width >= 0 ? safeFile.width : undefined,
      height: typeof safeFile.height === 'number' && safeFile.height >= 0 ? safeFile.height : undefined,
      tags: Array.isArray(safeFile.tags) ? safeFile.tags.map((tag) => `${tag}`.trim()).filter(Boolean) : [],
      source: requiredTrimmed(safeFile.source) || 'content-api',
      metadata: {
        ...(safeFile.metadata && typeof safeFile.metadata === 'object' ? safeFile.metadata : {}),
        license: typeof safeFile.metadata?.license === 'string' ? safeFile.metadata.license.trim() : '',
        focalPoint: typeof safeFile.metadata?.focalPoint === 'string' ? safeFile.metadata.focalPoint.trim() : '',
      },
      url: normalizedUrl,
      variants: normalizedVariants,
      thumbnailUrl: normalizedThumbnailUrl || normalizedUrl,
      publicPath,
      size: Number.isFinite(Number(safeFile.size)) && Number(safeFile.size) >= 0 ? Number(safeFile.size) : 0,
      uploadedDate: safeFile.uploadedDate || safeFile.createdAt || nowIso,
      uploadedBy: requiredTrimmed(safeFile.uploadedBy || safeFile.ownerUserId) || 'system',
      createdAt: safeFile.createdAt || safeFile.uploadedDate || nowIso,
      updatedAt: nowIso,
      archivedAt: typeof safeFile.archivedAt === 'string' ? safeFile.archivedAt : null,
    };
  }

  resolvePublicMediaValue(value, mediaById) {
    const trimmed = requiredTrimmed(value);
    if (!trimmed) return '';
    if (this.isMediaReference(trimmed)) {
      const mediaId = this.mediaIdFromReference(trimmed);
      const media = mediaId ? mediaById.get(mediaId) : null;
      return media?.url || '';
    }
    return trimmed;
  }

  normalizeMediaVariants(rawVariants, file = {}) {
    const normalizeVariant = (candidate) => {
      if (!candidate) return null;
      if (typeof candidate === 'string') {
        const url = candidate.trim();
        return url ? { url } : null;
      }
      if (typeof candidate !== 'object') return null;
      const url = requiredTrimmed(candidate.url);
      if (!url) return null;
      return {
        url,
        width: typeof candidate.width === 'number' && candidate.width > 0 ? candidate.width : undefined,
        height: typeof candidate.height === 'number' && candidate.height > 0 ? candidate.height : undefined,
        mimeType: requiredTrimmed(candidate.mimeType) || undefined,
      };
    };

    const provided = rawVariants && typeof rawVariants === 'object' ? rawVariants : {};
    const fallbackUrl = requiredTrimmed(file?.url);
    const fallbackThumb = requiredTrimmed(file?.thumbnailUrl) || fallbackUrl;
    const normalized = {};

    const thumbnail = normalizeVariant(provided.thumbnail) || (fallbackThumb ? { url: fallbackThumb } : null);
    const card = normalizeVariant(provided.card) || (fallbackUrl ? { url: fallbackUrl } : null);
    const hero = normalizeVariant(provided.hero) || card;
    const social = normalizeVariant(provided.social) || card;
    const original = normalizeVariant(provided.original) || (fallbackUrl ? { url: fallbackUrl } : null);

    if (thumbnail) normalized.thumbnail = thumbnail;
    if (card) normalized.card = card;
    if (hero) normalized.hero = hero;
    if (social) normalized.social = social;
    if (original) normalized.original = original;
    return normalized;
  }

  validateMediaFile(file) {
    return Boolean(
      file &&
        typeof file.id === 'string' &&
        typeof file.name === 'string' &&
        file.name.length > 0 &&
        MEDIA_TYPES.has(file.type) &&
        typeof file.url === 'string' &&
        file.url.length > 0 &&
        (this.isValidHttpUrl(file.url) || file.url.startsWith('data:') || file.url.startsWith('/')) &&
        (file.thumbnailUrl === undefined || this.isValidHttpUrl(file.thumbnailUrl) || file.thumbnailUrl.startsWith('data:') || file.thumbnailUrl.startsWith('/')) &&
        typeof file.size === 'number' &&
        file.size >= 0 &&
        this.isValidDate(file.uploadedDate) &&
        typeof file.uploadedBy === 'string' &&
        (file.variants === undefined ||
          (typeof file.variants === 'object' &&
            file.variants !== null &&
            Object.entries(file.variants).every(([key, variant]) =>
              MEDIA_VARIANT_KEYS.includes(key) &&
              variant &&
              typeof variant === 'object' &&
              typeof variant.url === 'string' &&
              variant.url.length > 0 &&
              (this.isValidHttpUrl(variant.url) || variant.url.startsWith('data:') || variant.url.startsWith('/')),
            ))) &&
        Array.isArray(file.tags)
    );
  }

  shouldAutoRegisterMedia(value) {
    const trimmed = requiredTrimmed(value);
    if (!trimmed || this.isMediaReference(trimmed)) return false;
    if (this.isValidHttpUrl(trimmed)) return true;
    if (trimmed.startsWith('data:')) return true;
    if (trimmed.startsWith('/')) return true;
    return trimmed.startsWith('uploads/');
  }

  inferMediaTypeFromLink(link) {
    const lower = `${link || ''}`.toLowerCase();
    if (lower.startsWith('data:image/')) return 'image';
    if (lower.startsWith('data:video/')) return 'video';
    if (/\.(png|jpe?g|gif|webp|svg|avif)(\?|#|$)/.test(lower)) return 'image';
    if (/\.(mp4|webm|mov|avi)(\?|#|$)/.test(lower)) return 'video';
    return 'file';
  }

  estimateMediaSize(link) {
    if (!`${link || ''}`.startsWith('data:')) return 0;
    const payload = `${link}`.split(',')[1] || '';
    return Buffer.from(payload, 'base64').length;
  }

  toMediaChecksum(link) {
    return crypto.createHash('sha256').update(`${link || ''}`).digest('hex');
  }

  ensureMediaReference(value, context = {}) {
    const trimmed = requiredTrimmed(value);
    if (!trimmed) return trimmed;
    if (this.isMediaReference(trimmed)) return trimmed;
    if (!this.shouldAutoRegisterMedia(trimmed)) return trimmed;

    const state = context.state || this.readState();
    const keyChecksum = this.toMediaChecksum(trimmed);
    const mediaFiles = this.listMediaFiles({ includeArchived: true });
    const existing = mediaFiles.find((file) =>
      file.url === trimmed ||
      file?.metadata?.originalSourceUrl === trimmed ||
      file?.metadata?.autoRegisterChecksum === keyChecksum,
    );
    if (existing) return `${MEDIA_REFERENCE_PREFIX}${existing.id}`;

    const actor = context.actor || {};
    const hint = requiredTrimmed(context.hint) || 'Media auto';
    const id = `media_auto_${keyChecksum.slice(0, 16)}`;
    const now = new Date().toISOString();
    const created = {
      id,
      name: `${hint}-${id}`.slice(0, 120),
      title: hint,
      label: hint,
      type: this.inferMediaTypeFromLink(trimmed),
      url: trimmed,
      thumbnailUrl: trimmed,
      size: this.estimateMediaSize(trimmed),
      uploadedDate: now,
      uploadedBy: actor.userId || 'system',
      alt: requiredTrimmed(context.alt) || hint,
      caption: requiredTrimmed(context.caption) || requiredTrimmed(context.alt) || hint,
      tags: Array.from(new Set([requiredTrimmed(context.domain), requiredTrimmed(context.role), 'auto-registered'].filter(Boolean))),
      source: 'content-canonicalization',
      metadata: {
        originalSourceUrl: trimmed,
        autoRegisterChecksum: keyChecksum,
        autoRegisteredByFlow: `${requiredTrimmed(context.domain) || 'content'}:${requiredTrimmed(context.role) || 'generic'}`,
      },
      variants: {
        thumbnail: { url: trimmed },
        card: { url: trimmed },
        hero: { url: trimmed },
        social: { url: trimmed },
        original: { url: trimmed },
      },
    };
    const saved = this.saveMediaFile(created);
    if (saved.ok) {
      state.mediaFiles = this.listMediaFiles({ includeArchived: true });
      return `${MEDIA_REFERENCE_PREFIX}${id}`;
    }
    return trimmed;
  }

  registerBlogPostMediaReferences(post, context = {}) {
    const title = requiredTrimmed(post?.title) || 'Blog image';
    const register = (value, role) => this.ensureMediaReference(value, { ...context, domain: 'blog', role, hint: title, alt: title });
    const featured = register(post.featuredImage, 'featuredImage');
    return {
      ...post,
      featuredImage: featured,
      images: Array.isArray(post.images) ? post.images.map((image) => register(image, 'galleryImage')) : [],
      contentBlocks: Array.isArray(post.contentBlocks) ? post.contentBlocks.map((block) => block?.type === 'image' ? { ...block, media: register(block.media, 'contentBlockImage') } : block) : [],
      seo: {
        ...(post.seo || {}),
        socialImage: register(post?.seo?.socialImage || featured, 'socialImage'),
      },
      mediaRoles: {
        ...(post.mediaRoles || {}),
        featuredImage: register(post?.mediaRoles?.featuredImage || featured, 'featuredImage'),
        coverImage: register(post?.mediaRoles?.coverImage || featured, 'coverImage'),
        cardImage: register(post?.mediaRoles?.cardImage || featured, 'cardImage'),
        socialImage: register(post?.mediaRoles?.socialImage || post?.seo?.socialImage || featured, 'socialImage'),
      },
    };
  }

  registerProjectMediaReferences(project, context = {}) {
    const title = requiredTrimmed(project?.title) || 'Project image';
    const register = (value, role) => this.ensureMediaReference(value, { ...context, domain: 'project', role, hint: title, alt: project?.imageAlt || title });
    const featured = register(project.featuredImage, 'cardImage');
    const hero = register(project.mainImage, 'heroImage');
    const rawGallery =
      Array.isArray(project?.mediaRoles?.galleryImages) && project.mediaRoles.galleryImages.length > 0
        ? project.mediaRoles.galleryImages
        : project.images;
    const galleryImages = Array.isArray(rawGallery) ? rawGallery.map((image) => register(image, 'galleryImage')) : [];
    return {
      ...project,
      featuredImage: featured,
      mainImage: hero,
      images: galleryImages,
      seo: {
        ...(project.seo || {}),
        socialImage: register(project?.seo?.socialImage || featured, 'socialImage'),
      },
      mediaRoles: {
        ...(project.mediaRoles || {}),
        cardImage: register(project?.mediaRoles?.cardImage || featured, 'cardImage'),
        heroImage: register(project?.mediaRoles?.heroImage || hero, 'heroImage'),
        coverImage: register(project?.mediaRoles?.coverImage || hero || featured, 'coverImage'),
        socialImage: register(project?.mediaRoles?.socialImage || project?.seo?.socialImage || featured, 'socialImage'),
        galleryImages,
      },
    };
  }

  registerServiceMediaReferences(service, context = {}) {
    const register = (value, role) => this.ensureMediaReference(value, { ...context, domain: 'service', role, hint: requiredTrimmed(service?.title) || 'Service image' });
    return {
      ...service,
      iconLikeAsset: register(service.iconLikeAsset, 'iconLikeAsset'),
      detailImage: register(service.detailImage || service.representativeImage || service.visualMedia || service.iconLikeAsset, 'detailImage'),
      representativeImage: register(service.representativeImage || service.detailImage || service.visualMedia || service.iconLikeAsset, 'heroImage'),
      visualMedia: register(service.visualMedia, 'heroImage'),
      image: register(service.image, 'cardImage'),
      media: register(service.media, 'cardImage'),
      illustrationCards: (service.illustrationCards || []).map((card) => ({ ...card, image: register(card.image, 'galleryImage') })),
      seo: {
        ...(service.seo || {}),
        socialImage: register(service?.seo?.socialImage || service?.iconLikeAsset, 'socialImage'),
      },
    };
  }

  registerHomePageMediaReferences(home, context = {}) {
    const register = (value, role) => this.ensureMediaReference(value, { ...context, domain: 'home', role, hint: 'Home page media' });
    return {
      ...home,
      aboutImage: register(home.aboutImage, 'aboutImage'),
      heroBackgroundItems: Array.isArray(home.heroBackgroundItems)
        ? home.heroBackgroundItems.map((item) => ({
          ...item,
          media: register(item?.media, 'heroBackground'),
          desktopMedia: register(item?.desktopMedia, 'heroBackgroundDesktop'),
          tabletMedia: register(item?.tabletMedia, 'heroBackgroundTablet'),
          mobileMedia: register(item?.mobileMedia, 'heroBackgroundMobile'),
          videoMedia: register(item?.videoMedia, 'heroBackgroundVideo'),
        }))
        : [],
    };
  }

  registerSettingsMediaReferences(settings, context = {}) {
    const register = (value, role) => this.ensureMediaReference(value, { ...context, domain: 'settings', role, hint: 'Brand media' });
    return {
      ...settings,
      siteSettings: {
        ...settings.siteSettings,
        brandMedia: {
          ...settings.siteSettings.brandMedia,
          logo: register(settings.siteSettings.brandMedia.logo, 'logo'),
          logoDark: register(settings.siteSettings.brandMedia.logoDark, 'logoDark'),
          favicon: register(settings.siteSettings.brandMedia.favicon, 'favicon'),
          defaultSocialImage: register(settings.siteSettings.brandMedia.defaultSocialImage, 'defaultSocialImage'),
        },
      },
      footer: {
        ...settings.footer,
        socialLinks: settings.footer.socialLinks.map((link) => ({ ...link, icon: register(link.icon, 'socialIcon') })),
      },
    };
  }

  normalizeHomePageContent(value) {
    const home = value && typeof value === 'object' ? value : {};
    const normalized = {};
    for (const [key, fallback] of Object.entries(defaultHomePageContent)) {
      if (key === 'footer') {
        normalized.footer = this.normalizeFooterContent(home.footer);
        continue;
      }
      if (key === 'heroBackgroundItems') {
        const items = Array.isArray(home.heroBackgroundItems) ? home.heroBackgroundItems : [];
        normalized.heroBackgroundItems = items
          .map((item, index) => {
            if (!item || typeof item !== 'object') return null;
            const media = typeof item.media === 'string' ? item.media.trim() : '';
            const desktopMedia = typeof item.desktopMedia === 'string' ? item.desktopMedia.trim() : '';
            const tabletMedia = typeof item.tabletMedia === 'string' ? item.tabletMedia.trim() : '';
            const mobileMedia = typeof item.mobileMedia === 'string' ? item.mobileMedia.trim() : '';
            const videoMedia = typeof item.videoMedia === 'string' ? item.videoMedia.trim() : '';
            const requestedType = item.type === 'video' ? 'video' : 'image';
            const primaryMedia = media || desktopMedia || tabletMedia || mobileMedia || (requestedType === 'video' ? videoMedia : '');
            if (!primaryMedia) return null;
            const overlayOpacity = typeof item.overlayOpacity === 'number' ? item.overlayOpacity : defaultHomePageContent.heroBackgroundOverlayOpacity;
            return {
              id: typeof item.id === 'string' && item.id.trim() ? item.id.trim() : `hero-bg-${index + 1}`,
              sortOrder: typeof item.sortOrder === 'number' && Number.isFinite(item.sortOrder) ? Math.max(0, Math.round(item.sortOrder)) : index,
              label: typeof item.label === 'string' ? item.label.trim() : '',
              title: typeof item.title === 'string' ? item.title.trim() : '',
              description: typeof item.description === 'string' ? item.description.trim() : '',
              ctaLabel: typeof item.ctaLabel === 'string' ? item.ctaLabel.trim() : '',
              ctaHref: typeof item.ctaHref === 'string' ? item.ctaHref.trim() : '',
              type: requestedType,
              media: primaryMedia,
              desktopMedia,
              tabletMedia,
              mobileMedia,
              videoMedia,
              alt: typeof item.alt === 'string' ? item.alt.trim() : '',
              overlayColor: typeof item.overlayColor === 'string' && item.overlayColor.trim() ? item.overlayColor.trim() : '#04111f',
              overlayOpacity: Math.max(0, Math.min(0.9, overlayOpacity)),
              position: typeof item.position === 'string' ? item.position.trim() || 'center' : 'center',
              size: item.size === 'contain' ? 'contain' : 'cover',
              enableParallax: typeof item.enableParallax === 'boolean' ? item.enableParallax : true,
              enable3DEffects: typeof item.enable3DEffects === 'boolean' ? item.enable3DEffects : true,
            };
          })
          .filter(Boolean);
        continue;
      }
      if (key === 'heroBackgroundRotationEnabled' || key === 'heroBackgroundAutoplay') {
        normalized[key] = typeof home[key] === 'boolean' ? home[key] : fallback;
        continue;
      }
      if (key === 'heroBackgroundIntervalMs') {
        const interval = Number.parseInt(`${home[key] ?? fallback}`, 10);
        normalized[key] = Number.isFinite(interval) ? Math.max(2000, Math.min(30000, interval)) : fallback;
        continue;
      }
      if (key === 'heroBackgroundTransitionStyle') {
        normalized[key] = home[key] === 'slide' ? 'slide' : 'fade';
        continue;
      }
      if (key === 'heroBackgroundOverlayOpacity') {
        const opacity = Number.parseFloat(`${home[key] ?? fallback}`);
        normalized[key] = Number.isFinite(opacity) ? Math.max(0.1, Math.min(0.9, opacity)) : fallback;
        continue;
      }
      if (key === 'heroBackgroundEnable3DEffects' || key === 'heroBackgroundEnableParallax') {
        normalized[key] = typeof home[key] === 'boolean' ? home[key] : fallback;
        continue;
      }
      normalized[key] = typeof home[key] === 'string' ? home[key].trim() || fallback : fallback;
    }
    return normalized;
  }

  normalizeFooterContent(value) {
    const footer = value && typeof value === 'object' ? value : {};
    const cta = footer.cta && typeof footer.cta === 'object' ? footer.cta : {};
    const newsletter = footer.newsletter && typeof footer.newsletter === 'object' ? footer.newsletter : {};
    const text = (source, fallback) => (typeof source === 'string' ? source.trim() || fallback : fallback);
    const links = (Array.isArray(footer.quickLinks) ? footer.quickLinks : defaultHomePageContent.footer.quickLinks)
      .map((entry) => {
        if (!entry || typeof entry !== 'object') return null;
        const label = text(entry.label, '');
        const url = text(entry.url, '');
        return label && url ? { label, url } : null;
      })
      .filter(Boolean);
    return {
      title: text(footer.title, defaultHomePageContent.footer.title),
      description: text(footer.description, defaultHomePageContent.footer.description),
      copyright: text(footer.copyright, defaultHomePageContent.footer.copyright),
      address: text(footer.address, defaultHomePageContent.footer.address),
      phone: text(footer.phone, defaultHomePageContent.footer.phone),
      email: text(footer.email, defaultHomePageContent.footer.email),
      quickLinks: links.length ? links : defaultHomePageContent.footer.quickLinks,
      cta: {
        title: text(cta.title, defaultHomePageContent.footer.cta.title),
        text: text(cta.text, defaultHomePageContent.footer.cta.text),
        buttonLabel: text(cta.buttonLabel, defaultHomePageContent.footer.cta.buttonLabel),
        buttonUrl: text(cta.buttonUrl, defaultHomePageContent.footer.cta.buttonUrl),
      },
      newsletter: {
        title: text(newsletter.title, defaultHomePageContent.footer.newsletter.title),
        text: text(newsletter.text, defaultHomePageContent.footer.newsletter.text),
      },
    };
  }

  validateFooterContent(footer) {
    return footer && typeof footer === 'object' &&
      ['title', 'description', 'copyright', 'address', 'phone', 'email'].every((key) => typeof footer[key] === 'string') &&
      Array.isArray(footer.quickLinks) && footer.quickLinks.every((link) => link && typeof link.label === 'string' && typeof link.url === 'string' && this.isValidContentHref(link.url)) &&
      footer.cta && typeof footer.cta === 'object' &&
      ['title', 'text', 'buttonLabel', 'buttonUrl'].every((key) => typeof footer.cta[key] === 'string') &&
      (!footer.cta.buttonUrl || this.isValidContentHref(footer.cta.buttonUrl)) &&
      footer.newsletter && typeof footer.newsletter === 'object' &&
      ['title', 'text'].every((key) => typeof footer.newsletter[key] === 'string');
  }

  validateHomePageContent(home) {
    const hasValidHeroBackgroundItems = Array.isArray(home.heroBackgroundItems) &&
      home.heroBackgroundItems.every((item) =>
        item &&
        typeof item === 'object' &&
        typeof item.id === 'string' &&
        typeof item.sortOrder === 'number' &&
        typeof item.label === 'string' &&
        typeof item.title === 'string' &&
        typeof item.description === 'string' &&
        typeof item.ctaLabel === 'string' &&
        typeof item.ctaHref === 'string' &&
        (item.type === 'image' || item.type === 'video') &&
        typeof item.media === 'string' &&
        (item.media.trim().length > 0 || (item.type === 'video' && typeof item.videoMedia === 'string' && item.videoMedia.trim().length > 0)) &&
        (item.desktopMedia === undefined || typeof item.desktopMedia === 'string') &&
        (item.tabletMedia === undefined || typeof item.tabletMedia === 'string') &&
        (item.mobileMedia === undefined || typeof item.mobileMedia === 'string') &&
        (item.videoMedia === undefined || typeof item.videoMedia === 'string') &&
        typeof item.alt === 'string' &&
        typeof item.overlayColor === 'string' &&
        typeof item.overlayOpacity === 'number' &&
        item.overlayOpacity >= 0 &&
        item.overlayOpacity <= 0.9 &&
        typeof item.position === 'string' &&
        (item.size === 'cover' || item.size === 'contain') &&
        typeof item.enableParallax === 'boolean' &&
        typeof item.enable3DEffects === 'boolean' &&
        (!item.ctaHref || this.isValidContentHref(item.ctaHref)) &&
        this.isValidMediaLink(item.media) &&
        (!item.desktopMedia || this.isValidMediaLink(item.desktopMedia)) &&
        (!item.tabletMedia || this.isValidMediaLink(item.tabletMedia)) &&
        (!item.mobileMedia || this.isValidMediaLink(item.mobileMedia)) &&
        (!item.videoMedia || this.isValidMediaLink(item.videoMedia))
      );

    const hasValidScalarBackgroundConfig =
      typeof home.heroBackgroundRotationEnabled === 'boolean' &&
      typeof home.heroBackgroundAutoplay === 'boolean' &&
      typeof home.heroBackgroundIntervalMs === 'number' &&
      home.heroBackgroundIntervalMs >= 2000 &&
      home.heroBackgroundIntervalMs <= 30000 &&
      (home.heroBackgroundTransitionStyle === 'fade' || home.heroBackgroundTransitionStyle === 'slide') &&
      typeof home.heroBackgroundOverlayOpacity === 'number' &&
      home.heroBackgroundOverlayOpacity >= 0.1 &&
      home.heroBackgroundOverlayOpacity <= 0.9 &&
      typeof home.heroBackgroundEnable3DEffects === 'boolean' &&
      typeof home.heroBackgroundEnableParallax === 'boolean';

    return Object.keys(defaultHomePageContent).filter((key) => ![
      'heroBackgroundItems',
      'heroBackgroundRotationEnabled',
      'heroBackgroundAutoplay',
      'heroBackgroundIntervalMs',
      'heroBackgroundTransitionStyle',
      'heroBackgroundOverlayOpacity',
      'heroBackgroundEnable3DEffects',
      'heroBackgroundEnableParallax',
      'footer',
    ].includes(key)).every((key) => typeof home[key] === 'string') &&
      typeof home.heroTitleLine1 === 'string' &&
      home.heroTitleLine1.trim().length > 0 &&
      typeof home.heroTitleLine2 === 'string' &&
      home.heroTitleLine2.trim().length > 0 &&
      this.isValidContentHref(home.heroPrimaryCtaHref) &&
      this.isValidContentHref(home.heroSecondaryCtaHref) &&
      this.isValidContentHref(home.aboutCtaHref) &&
      this.isValidContentHref(home.portfolioCtaHref) &&
      this.isValidContentHref(home.blogCtaHref) &&
      (!home.aboutImage || this.isValidMediaLink(home.aboutImage)) &&
      this.validateFooterContent(home.footer) &&
      hasValidHeroBackgroundItems &&
      hasValidScalarBackgroundConfig;
  }

  findMediaReferences(mediaId) {
    const mediaRef = `${MEDIA_REFERENCE_PREFIX}${mediaId}`;
    return this.collectAllMediaReferences().filter((entry) => entry.value === mediaRef);
  }

  getMediaUsageImpact(mediaId) {
    const references = this.findMediaReferences(mediaId);
    const publishedReferences = references.filter((entry) => entry.status === 'published');
    const protectedReferences = references.filter((entry) => entry.status === 'system');
    const editableReferences = references.filter((entry) => entry.status === 'draft' || entry.status === 'in_review');
    const criticalReferences = references.filter((entry) => this.isCriticalMediaReference(entry));
    const criticalPublishedReferences = criticalReferences.filter((entry) => entry.status === 'published' || entry.status === 'system');

    const okToArchive = publishedReferences.length === 0 && protectedReferences.length === 0;
    return {
      mediaId,
      okToArchive,
      decision: okToArchive ? 'allow_archive' : 'block_archive',
      references,
      summary: {
        total: references.length,
        published: publishedReferences.length,
        editable: editableReferences.length,
        protected: protectedReferences.length,
        critical: criticalReferences.length,
        criticalPublished: criticalPublishedReferences.length,
      },
    };
  }

  isCriticalMediaReference(reference) {
    const key = `${reference.domain}:${reference.field}`;
    return new Set([
      'blog:featuredImage',
      'blog:mediaRoles.featuredImage',
      'blog:mediaRoles.coverImage',
      'blog:mediaRoles.cardImage',
      'project:featuredImage',
      'project:mainImage',
      'project:mediaRoles.cardImage',
      'project:mediaRoles.heroImage',
      'project:mediaRoles.coverImage',
      'service:iconLikeAsset',
      'settings:siteSettings.brandMedia.logo',
      'settings:siteSettings.brandMedia.logoDark',
      'settings:siteSettings.brandMedia.favicon',
      'settings:siteSettings.brandMedia.defaultSocialImage',
    ]).has(key);
  }

  collectAllMediaReferences() {
    const references = [];
    const mediaFilesById = new Map(this.listMediaFiles({ includeArchived: true }).map((entry) => [entry.id, entry]));

    const register = (value, payload) => {
      if (typeof value !== 'string') return;
      const trimmed = value.trim();
      if (!trimmed.startsWith(MEDIA_REFERENCE_PREFIX)) return;
      const mediaId = this.mediaIdFromReference(trimmed);
      if (!mediaId) return;
      const mediaFile = mediaFilesById.get(mediaId);
      const resolution = !mediaFile ? 'missing' : mediaFile.archivedAt ? 'archived' : 'active';
      references.push({
        ...payload,
        value: trimmed,
        mediaId,
        isValid: resolution === 'active',
        resolution,
      });
    };

    this.listBlogPosts().forEach((post) => {
      register(post.featuredImage, { domain: 'blog', id: post.id, status: post.status, field: 'featuredImage', label: post.title });
      register(post.mediaRoles?.featuredImage, { domain: 'blog', id: post.id, status: post.status, field: 'mediaRoles.featuredImage', label: post.title });
      register(post.seo?.socialImage, { domain: 'blog', id: post.id, status: post.status, field: 'seo.socialImage', label: post.title });
      register(post.mediaRoles?.socialImage, { domain: 'blog', id: post.id, status: post.status, field: 'mediaRoles.socialImage', label: post.title });
      register(post.mediaRoles?.coverImage, { domain: 'blog', id: post.id, status: post.status, field: 'mediaRoles.coverImage', label: post.title });
      register(post.mediaRoles?.cardImage, { domain: 'blog', id: post.id, status: post.status, field: 'mediaRoles.cardImage', label: post.title });
      (Array.isArray(post.images) ? post.images : []).forEach((image, index) => register(image, { domain: 'blog', id: post.id, status: post.status, field: `images[${index}]`, label: post.title }));
    });

    this.listProjects().forEach((project) => {
      register(project.featuredImage, { domain: 'project', id: project.id, status: project.status, field: 'featuredImage', label: project.title });
      register(project.mainImage, { domain: 'project', id: project.id, status: project.status, field: 'mainImage', label: project.title });
      (Array.isArray(project.images) ? project.images : []).forEach((image, index) => register(image, { domain: 'project', id: project.id, status: project.status, field: `images[${index}]`, label: project.title }));
      register(project.mediaRoles?.cardImage, { domain: 'project', id: project.id, status: project.status, field: 'mediaRoles.cardImage', label: project.title });
      register(project.mediaRoles?.heroImage, { domain: 'project', id: project.id, status: project.status, field: 'mediaRoles.heroImage', label: project.title });
      register(project.mediaRoles?.coverImage, { domain: 'project', id: project.id, status: project.status, field: 'mediaRoles.coverImage', label: project.title });
      register(project.mediaRoles?.socialImage, { domain: 'project', id: project.id, status: project.status, field: 'mediaRoles.socialImage', label: project.title });
      (project.mediaRoles?.galleryImages || []).forEach((image, index) => register(image, { domain: 'project', id: project.id, status: project.status, field: `mediaRoles.galleryImages[${index}]`, label: project.title }));
    });

    this.listServices().forEach((service) => {
      register(service.iconLikeAsset, { domain: 'service', id: service.id, status: service.status, field: 'iconLikeAsset', label: service.title });
      register(service.seo?.socialImage, { domain: 'service', id: service.id, status: service.status, field: 'seo.socialImage', label: service.title });
    });

    const home = this.getPageContent().home;
    register(home.aboutImage, { domain: 'home', id: 'home', status: 'system', field: 'aboutImage', label: 'Home page' });
    (Array.isArray(home.heroBackgroundItems) ? home.heroBackgroundItems : []).forEach((item, index) =>
    {
      register(item.media, { domain: 'home', id: 'home', status: 'system', field: `heroBackgroundItems[${index}].media`, label: 'Home page' });
      register(item.desktopMedia, { domain: 'home', id: 'home', status: 'system', field: `heroBackgroundItems[${index}].desktopMedia`, label: 'Home page' });
      register(item.tabletMedia, { domain: 'home', id: 'home', status: 'system', field: `heroBackgroundItems[${index}].tabletMedia`, label: 'Home page' });
      register(item.mobileMedia, { domain: 'home', id: 'home', status: 'system', field: `heroBackgroundItems[${index}].mobileMedia`, label: 'Home page' });
      register(item.videoMedia, { domain: 'home', id: 'home', status: 'system', field: `heroBackgroundItems[${index}].videoMedia`, label: 'Home page' });
    });

    const settings = this.getSettings();
    register(settings.siteSettings.brandMedia.logo, { domain: 'settings', id: 'global', status: 'system', field: 'siteSettings.brandMedia.logo', label: 'Site settings' });
    register(settings.siteSettings.brandMedia.logoDark, { domain: 'settings', id: 'global', status: 'system', field: 'siteSettings.brandMedia.logoDark', label: 'Site settings' });
    register(settings.siteSettings.brandMedia.favicon, { domain: 'settings', id: 'global', status: 'system', field: 'siteSettings.brandMedia.favicon', label: 'Site settings' });
    register(settings.siteSettings.brandMedia.defaultSocialImage, { domain: 'settings', id: 'global', status: 'system', field: 'siteSettings.brandMedia.defaultSocialImage', label: 'Site settings' });
    settings.footer.socialLinks.forEach((link, index) => register(link.icon, { domain: 'settings', id: 'global', status: 'system', field: `footer.socialLinks[${index}].icon`, label: link.label }));

    return references;
  }

  normalizeSettings(settings) {
    const siteSettingsCandidate = settings?.siteSettings && typeof settings.siteSettings === 'object' ? settings.siteSettings : settings;
    const footerCandidate = settings?.footer && typeof settings.footer === 'object' ? settings.footer : {};
    const brandingCandidate = settings?.branding && typeof settings.branding === 'object' ? settings.branding : {};
    const operationalSettingsCandidate = settings?.operationalSettings && typeof settings.operationalSettings === 'object' ? settings.operationalSettings : settings;
    const taxonomySettingsCandidate = settings?.taxonomySettings && typeof settings.taxonomySettings === 'object'
      ? settings.taxonomySettings
      : settings?.taxonomy && typeof settings.taxonomy === 'object'
        ? settings.taxonomy
        : {};

    const normalizedSiteTitle =
      typeof siteSettingsCandidate?.siteTitle === 'string'
        ? siteSettingsCandidate.siteTitle.trim() || defaultSettings.siteSettings.siteTitle
        : defaultSettings.siteSettings.siteTitle;
    const normalizedSupportEmail =
      typeof siteSettingsCandidate?.supportEmail === 'string'
        ? siteSettingsCandidate.supportEmail.trim() || defaultSettings.siteSettings.supportEmail
        : defaultSettings.siteSettings.supportEmail;
    const normalizedInstantPublishing =
      typeof operationalSettingsCandidate?.instantPublishing === 'boolean'
        ? operationalSettingsCandidate.instantPublishing
        : defaultSettings.operationalSettings.instantPublishing;

    const normalized = {
      siteSettings: {
        siteTitle: normalizedSiteTitle,
        supportEmail: normalizedSupportEmail,
        brandMedia: {
          logo: typeof siteSettingsCandidate?.brandMedia?.logo === 'string' ? siteSettingsCandidate.brandMedia.logo.trim() : '',
          logoDark: typeof siteSettingsCandidate?.brandMedia?.logoDark === 'string' ? siteSettingsCandidate.brandMedia.logoDark.trim() : '',
          favicon: typeof siteSettingsCandidate?.brandMedia?.favicon === 'string' ? siteSettingsCandidate.brandMedia.favicon.trim() : '',
          defaultSocialImage:
            typeof siteSettingsCandidate?.brandMedia?.defaultSocialImage === 'string' ? siteSettingsCandidate.brandMedia.defaultSocialImage.trim() : '',
        },
      },
      branding: {
        logoSize: this.normalizeLogoSize(brandingCandidate.logoSize),
      },
      footer: {
        socialLinks: this.normalizeSocialLinks(footerCandidate.socialLinks),
      },
      operationalSettings: {
        instantPublishing: normalizedInstantPublishing,
      },
      taxonomySettings: {
        blog: {
          managedCategories: this.normalizeManagedTaxonomyList(taxonomySettingsCandidate?.blog?.managedCategories, MANAGED_BLOG_CATEGORIES),
          managedTags: this.normalizeManagedTaxonomyList(taxonomySettingsCandidate?.blog?.managedTags, MANAGED_BLOG_TAGS),
          enforceManagedTags: taxonomySettingsCandidate?.blog?.enforceManagedTags !== false,
        },
      },
    };

    return {
      ...normalized,
      // Backward-compat aliases for legacy clients and historical snapshots.
      brandMedia: normalized.siteSettings.brandMedia,
      siteTitle: normalized.siteSettings.siteTitle,
      supportEmail: normalized.siteSettings.supportEmail,
      instantPublishing: normalized.operationalSettings.instantPublishing,
      taxonomy: normalized.taxonomySettings,
    };
  }

  normalizeSocialLinks(candidate) {
    if (!Array.isArray(candidate)) return [];
    return candidate.flatMap((entry, index) => {
      if (!entry || typeof entry !== 'object') return [];
      const platform = `${entry.platform || ''}`.trim().toLowerCase();
      const label = `${entry.label || ''}`.trim();
      const url = this.normalizeSocialUrl(`${entry.url || ''}`, platform);
      if (!platform || !label || !url || !this.isValidSocialUrl(url, platform)) return [];
      const icon = `${entry.icon || ''}`.trim();
      const rawOrder = Number(entry.order);
      const order = Number.isFinite(rawOrder) ? Math.round(rawOrder) : index;
      const id = `${entry.id || ''}`.trim() || `social_${platform}_${index}`;
      return [{ id, platform, label, url, enabled: entry.enabled !== false, icon, order }];
    }).sort((a, b) => a.order - b.order);
  }

  normalizeLogoSize(candidate) {
    const defaults = defaultSettings.branding.logoSize;
    const clamp = (value, fallback) => typeof value === 'number' && Number.isFinite(value) ? Math.min(320, Math.max(40, Math.round(value))) : fallback;
    return { desktop: clamp(candidate?.desktop, defaults.desktop), tablet: clamp(candidate?.tablet, defaults.tablet), mobile: clamp(candidate?.mobile, defaults.mobile) };
  }

  normalizeSocialUrl(value, platform = '') {
    const normalized = `${value || ''}`.trim();
    if (platform === 'email' && /^[^@\s]+@[^@\s]+\.[^@\s]+$/i.test(normalized)) return `mailto:${normalized}`;
    return normalized;
  }

  isValidSocialUrl(value, platform = '') {
    const normalized = this.normalizeSocialUrl(value, platform);
    if (platform === 'email') return /^mailto:[^@\s]+@[^@\s]+\.[^@\s]+$/i.test(normalized);
    if (/^mailto:[^@\s]+@[^@\s]+\.[^@\s]+$/i.test(normalized)) return true;
    try {
      const url = new URL(normalized);
      return url.protocol === 'https:' || url.protocol === 'http:';
    } catch {
      return false;
    }
  }

  normalizeManagedTaxonomyList(candidate, fallback) {
    const source = Array.isArray(candidate) ? candidate : fallback;
    const seen = new Set();
    const normalized = [];

    source.forEach((entry) => {
      const value = `${entry || ''}`.trim();
      if (!value) return;
      const key = value.toLocaleLowerCase('fr');
      if (seen.has(key)) return;
      seen.add(key);
      normalized.push(value);
    });

    return normalized.length > 0 ? normalized : fallback;
  }

  normalizeBlogCategory(rawCategory) {
    const input = typeof rawCategory === 'string' ? rawCategory.trim() : '';
    if (!input) return 'Non classé';

    const taxonomy = this.getBlogTaxonomy();
    const match = taxonomy.managedCategories.find((category) => category.toLocaleLowerCase('fr') === input.toLocaleLowerCase('fr'));
    return match || input;
  }

  normalizeBlogTags(rawTags) {
    const tagList = Array.isArray(rawTags)
      ? rawTags.map((tag) => `${tag}`.trim()).filter(Boolean)
      : typeof rawTags === 'string'
        ? rawTags.split(',').map((tag) => tag.trim()).filter(Boolean)
        : [];
    const taxonomy = this.getBlogTaxonomy();
    const seen = new Set();
    const normalized = [];

    tagList.forEach((tag) => {
      const managed = taxonomy.managedTags.find((entry) => entry.toLocaleLowerCase('fr') === tag.toLocaleLowerCase('fr'));
      const next = managed || (taxonomy.enforceManagedTags ? '' : tag);
      if (!next) return;
      const key = next.toLocaleLowerCase('fr');
      if (seen.has(key)) return;
      seen.add(key);
      normalized.push(next);
    });

    return normalized;
  }

  buildSettingsDiff(previous, next) {
    const changedFields = [];
    const register = (field, before, after) => {
      if ((before || '') !== (after || '')) changedFields.push(field);
    };

    register('siteSettings.siteTitle', previous.siteSettings.siteTitle, next.siteSettings.siteTitle);
    register('siteSettings.supportEmail', previous.siteSettings.supportEmail, next.siteSettings.supportEmail);
    register('siteSettings.brandMedia.logo', previous.siteSettings.brandMedia.logo, next.siteSettings.brandMedia.logo);
    register('siteSettings.brandMedia.logoDark', previous.siteSettings.brandMedia.logoDark, next.siteSettings.brandMedia.logoDark);
    register('siteSettings.brandMedia.favicon', previous.siteSettings.brandMedia.favicon, next.siteSettings.brandMedia.favicon);
    register('siteSettings.brandMedia.defaultSocialImage', previous.siteSettings.brandMedia.defaultSocialImage, next.siteSettings.brandMedia.defaultSocialImage);
    register('branding.logoSize', JSON.stringify(previous.branding.logoSize), JSON.stringify(next.branding.logoSize));
    register('footer.socialLinks', JSON.stringify(previous.footer.socialLinks), JSON.stringify(next.footer.socialLinks));
    if (previous.operationalSettings.instantPublishing !== next.operationalSettings.instantPublishing) {
      changedFields.push('operationalSettings.instantPublishing');
    }

    return {
      changedFields,
      changeSummary: changedFields.length > 0 ? `Updated ${changedFields.length} field(s).` : 'No effective changes detected.',
    };
  }
}

module.exports = { ContentService };
