import type { ConfigMode, RequiredConfig, S3ConfigInput } from '../src/config-builder/types';
import { nonEmpty } from '../src/config-builder/utils';
import { hierarchy } from './hierarchy-config';

// Re-export for external consumers
export { roles, hierarchy } from './hierarchy-config';

export const config = {

  // Entity data model, derived from the hierarchy: the builder in hierarchy-config.ts is the
  // single declaration of the entity taxonomy.

  /** All entity types in the app. */
  entityTypes: nonEmpty(hierarchy.allTypes),

  /** Channel entities with memberships. */
  channelEntityTypes: nonEmpty(hierarchy.channelTypes),

  /** Product/content entities. */
  productEntityTypes: nonEmpty(hierarchy.productTypes),

  /**
   * Product entity types tracked for seen/unseen counts.
   * Unseen counts are grouped by the parent channel entity of each tracked type.
   */
  seenTrackedProductTypes: ['attachment'] as const,

  /** Maps entity types to their ID column names, derived from the hierarchy (`${type}Id`). */
  entityIdColumnKeys: hierarchy.idColumnKeys,

  /** Available CRUD actions for permission checks */
  entityActions: ['create', 'read', 'update', 'delete'] as const,

  /** Resource types that are not entities but have activities logged */
  resourceTypes: ['request', 'membership', 'inactive_membership', 'tenant'] as const,

  /**
   * Product embeddings: declares which product entities are embedded as ID arrays inside
   * other product entities. Forks extend when adding new embedding relationships.
   */
  productEmbeddings: [] as readonly {
    readonly embeddedProduct: (typeof hierarchy.productTypes)[number];
    readonly hostProduct: (typeof hierarchy.productTypes)[number];
    readonly hostColumn: string;
  }[],

  /**
   * User menu structure of channel entities with optional nested subentities.
   * If subentityType is set, the table must include `${entity}Id` foreign key.
   */
  menuStructure: [
    { entityType: 'organization', subentityType: null } as const,
  ],

  /** Default restrictions for tenants (entity quotas and rate limits) */
  defaultRestrictions: {
    quotas: {
      organization: 5,
      user: 1000,
      attachment: 100,
    },
    rateLimits: {
      apiPointsPerHour: 1000,
    },
  } as const,

  // System roles

  systemRoles: ['admin'] as const,

  // App identity

  /** App display name shown in UI and emails */
  name: '__project_name__',
  /** URL-safe identifier used in paths and storage */
  slug: '__project_slug__',
  /** Primary domain for the app */
  domain: '__project_slug__.example.com',
  /** App description for SEO and meta tags */
  description: '__project_name__ — powered by Cella.',
  /** SEO keywords for search engines */
  keywords:
    'starter kit, fullstack, monorepo, typescript, hono, honojs, drizzle, baseui, react, postgres, pwa, offline, instant updates, realtime data, sync engine',

  // URLs & endpoints

  /** Frontend SPA base URL (the app origin: every service is a path under it) */
  frontendUrl: 'https://__project_slug__.example.com',
  /** Backend API base URL */
  backendUrl: 'https://__project_slug__.example.com/api',
  /** OAuth callback base URL */
  backendAuthUrl: 'https://__project_slug__.example.com/api/auth',
  /** Yjs realtime relay URL */
  yjsUrl: 'wss://__project_slug__.example.com/yjs',
  /** AI service base URL */
  mcpUrl: 'https://__project_slug__.example.com/mcp',
  /**
   * Per-service toggles and public URLs. `enabled` controls whether the service
   * is wired up; `publicUrl` is the externally reachable endpoint.
   */
  services: {
    frontend: { enabled: true as boolean, publicUrl: 'https://__project_slug__.example.com' },
    backend: { enabled: true as boolean, publicUrl: 'https://__project_slug__.example.com/api' },
    cdc: { enabled: true as boolean },
    yjs: { enabled: false as boolean, publicUrl: 'wss://__project_slug__.example.com/yjs' },
    ai: { enabled: false as boolean, publicUrl: 'https://__project_slug__.example.com/mcp' },
  },

  // Cost escape hatch: when true the backend (MODE=api) also boots every enabled
  // service in-process: one VM for previews/small forks. Default false keeps the
  // split (one service per process). cdc co-hosting forfeits API blue-green.
  singleVM: false as boolean,

  /** About page URL */
  aboutUrl: '/about',
  /** Status page URL for uptime monitoring */
  statusUrl: 'https://status.__project_slug__.example.com',
  /** Canonical production URL */
  productionUrl: 'https://__project_slug__.example.com',

  /** Default redirect path after login */
  defaultRedirectPath: '/home',
  /** Redirect path for first-time users */
  welcomeRedirectPath: '/welcome',

  // Email

  /** From address for system notifications */
  senderEmail: 'notifications@__project_slug__.example.com',
  /** Email address for user support inquiries */
  supportEmail: 'support@__project_slug__.example.com',
  /** Receive security warnings */
  securityEmail: 'security@__project_slug__.example.com',

  // Mode & flags

  /** Runtime mode - overridden per environment file */
  mode: 'development' as ConfigMode,
  /** Enable maintenance mode (blocks all requests) */
  maintenance: false,
  /** Cookie version - increment when changing cookie structure to invalidate old cookies */
  cookieVersion: 'v1',
  /** Persisted client query-cache shape - bump on a breaking change to a cached entity so clients wipe stale cache */
  clientCacheVersion: 'v1',

  // Feature flags

  /**
   * Feature toggles for app capabilities.
   * Use to enable/disable major features without code changes.
   */
  has: {
    /** Progressive Web App support for preloading static assets and offline support */
    pwa: true as boolean,
    /** Allow users to sign up. If false, the app is by invitation only */
    selfRegistration: false as boolean,
    /** Suggest a waitlist for unknown emails when sign up is disabled */
    waitlist: false as boolean,
    /** S3 fully configured - if false, files will be stored in local browser (IndexedDB) */
    uploadEnabled: false as boolean,
    /** Customer support chat widget (Gleap). Unrelated to the AI module. */
    chatSupport: false as boolean,
  },

  // Authentication

  /**
   * Enabled authentication strategies.
   * TOTP can only be used as MFA fallback with passkey as primary.
   */
  enabledAuthStrategies: ['passkey', 'oauth', 'totp', 'magic'] as const,

  /** Enabled OAuth providers - currently supports: github, google, microsoft */
  enabledOAuthProviders: ['github'] as const,

  /** Token types used for verification flows */
  tokenTypes: ['email-verification', 'oauth-verification', 'invitation', 'confirm-mfa', 'magic'] as const,

  /** Max concurrent regular sessions per user; oldest beyond it are evicted on sign-in (bloat/abuse guard). */
  maxSessionsPerUser: 10,

  /** TOTP configuration for MFA */
  totp: {
    intervalInSeconds: 30,
    gracePeriodInSeconds: 60,
    digits: 6,
  },

  // API configuration

  /** API version prefix for endpoints */
  apiVersion: 'v1',
  /** API documentation description */
  apiDescription: `⚠️ ATTENTION: PRERELEASE!
                  This API is organized into modules based on logical domains.`,

  // Request limits

  /**
   * Default page sizes for list endpoints. Backend enforces max 1000.
   * Must include 'default' key as fallback.
   */
  requestLimits: {
    default: 40,
    users: 100,
    members: 40,
    organizations: 40,
    requests: 40,
    attachments: 40,
    pendingMemberships: 20,
  },

  /** Max JSON body size in bytes */
  jsonBodyLimit: 1 * 1024 * 1024,
  /** Max file upload size in bytes */
  fileUploadLimit: 20 * 1024 * 1024,
  /** Default body size limit in bytes */
  defaultBodyLimit: 1 * 1024 * 1024,

  // Storage & uploads (S3)

  /** S3-compatible storage configuration. Only region and host are required; the rest is derived from the slug. */
  s3: {
    region: '',
    host: '',
  } as S3ConfigInput,

  /** Upload template IDs for Transloadit processing pipelines */
  uploadTemplateIds: ['avatar', 'cover', 'attachment'] as const,

  /** Uppy upload widget default restrictions */
  uppy: {
    defaultRestrictions: {
      maxFileSize: 10 * 1024 * 1024,
      maxNumberOfFiles: 1,
      allowedFileTypes: ['.jpg', '.jpeg', '.png'],
      maxTotalFileSize: 100 * 1024 * 1024,
      minFileSize: null,
      minNumberOfFiles: null,
      requiredMetaFields: [],
    },
  },

  /**
   * Local blob storage restrictions (IndexedDB/Dexie).
   * Controls which attachments are cached locally for offline access.
   */
  localBlobStorage: {
    enabled: true,
    maxFileSize: 10 * 1024 * 1024,
    maxTotalSize: 100 * 1024 * 1024,
    allowedContentTypes: [] as string[],
    excludedContentTypes: ['video/*'] as string[],
    downloadConcurrency: 2,
    downloadRetryAttempts: 3,
    uploadRetryAttempts: 3,
    uploadRetryDelays: [60000, 300000, 900000] as const,
  },

  // Third-party services

  /** Gleap token for customer support widget */
  gleapToken: '',
  /** Google Maps API key */
  googleMapsKey: '',
  /** Matrix homeserver URL for chat integration */
  matrixURL: 'https://matrix-client.matrix.org',
  /** Maple.dev public ingest key, safe to embed in the frontend bundle (empty disables frontend export) */
  maplePublicIngestKey: '',

  // Theming & UI

  /** Primary theme color for PWA manifest and browser chrome */
  themeColor: '#26262b',
  /** Theme configuration for UI components */
  theme: {
    navigation: {
      hasSidebarTextLabels: false,
      sidebarWidthExpanded: '16rem',
      sidebarWidthCollapsed: '4rem',
      sheetPanelWidth: '20rem',
    },
    colors: {},
    strokeWidth: 1.5,
    screenSizes: {
      xs: '420px',
      sm: '640px',
      md: '768px',
      lg: '1024px',
      xl: '1280px',
      '2xl': '1400px',
    },
  } as const,
  /** Placeholder background colors for avatars without images */
  placeholderColors: [
    'bg-blue-300',
    'bg-lime-300',
    'bg-orange-300',
    'bg-yellow-300',
    'bg-green-300',
    'bg-teal-300',
    'bg-indigo-300',
    'bg-purple-300',
    'bg-pink-300',
    'bg-red-300',
  ],

  // Localization

  /** Default language code */
  defaultLanguage: 'en' as const,
  /** Available language codes - first is fallback */
  languages: ['en', 'nl'] as const,
  /** Common reference data */
  c: {
    countries: ['fr', 'de', 'nl', 'ua', 'us', 'gb'],
    timezones: [],
  },

  // Company details

  /** Company/organization details for footer, legal pages, and contact info */
  company: {
    name: '__project_name__',
    shortName: '__project_name__',
    email: 'info@__project_slug__.example.com',
    supportEmail: 'support@__project_slug__.example.com',
    tel: '',
    streetAddress: '',
    postcode: '',
    city: '',
    country: '',
    registration: '',
    bankAccount: '',
    googleMapsUrl: '',
    scheduleCallUrl: '',
    socialUrl: '',
    blueskyHandle: '',
    element: '',
    githubUrl: '',
    mapZoom: 4,
    coordinates: {
      lat: 0,
      lng: 0,
    },
  },

  // User defaults

  /** Default user flags applied to new users */
  defaultUserFlags: {
    finishedOnboarding: false,
  },

  // Organization defaults

  /** Per-organization feature flags with their default values. Cella ships none; forks declare
   *  theirs here (e.g. `coursesEnabled: true`) and read them from `organization.organizationFlags`. */
  defaultOrganizationFlags: {},
} satisfies RequiredConfig;
