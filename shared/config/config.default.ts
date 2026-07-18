import type { ConfigMode, RequiredConfig, S3ConfigInput } from '../src/config-builder/types';

// Re-export for external consumers
export { roles, hierarchy } from './hierarchy-config';

// Set these early for reuse
const entityTypes = ['user', 'organization', 'attachment'] as const;
const productEntityTypes = ['attachment'] as const;

export const config = {

  // Entity data model

  /** All entity types in the app - must match hierarchy.allTypes. */
  entityTypes,

  /** Channel entities with memberships - must match hierarchy.channelTypes. */
  channelEntityTypes: ['organization'] as const,

  /** Product/content entities - must match hierarchy.productTypes. */
  productEntityTypes,

  /**
   * Product entity types tracked for seen/unseen counts.
   * Unseen counts are grouped by the parent channel entity of each tracked type.
   */
  seenTrackedEntityTypes: ['attachment'] as const,

  /** Maps entity types to their ID column names - must match entityTypes */
  entityIdColumnKeys: {
    user: 'userId',
    organization: 'organizationId',
    attachment: 'attachmentId',
  } as const,

  /** Available CRUD actions for permission checks */
  entityActions: ['create', 'read', 'update', 'delete'] as const,

  /** Resource types that are not entities but have activities logged */
  resourceTypes: ['request', 'membership', 'inactive_membership', 'tenant', 'system_role'] as const,

  /**
   * Entity embeddings: declares which entities are embedded as ID arrays inside
   * other entities. Forks extend when adding new embedding relationships.
   */
  entityEmbeddings: [] as readonly {
    readonly embeddedEntity: (typeof productEntityTypes)[number];
    readonly hostEntity: (typeof productEntityTypes)[number];
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

  name: 'Cella',
  slug: 'cella',
  domain: 'cellajs.com',
  description: 'A TypeScript template to build collaborative web apps with sync engine. MIT licensed.',
  keywords:
    'starter kit, fullstack, monorepo, typescript, hono, honojs, drizzle, baseui, react, postgres, pwa, offline, instant updates, realtime data, sync engine',

  // URLs & endpoints

  // Same-origin: every service is a path under the app origin, so cookies stay
  // first-party (`__Host-`, SameSite=Strict), CORS disappears and CSP collapses
  // to 'self'. The LB routes /api, /yjs and /mcp by path prefix (matchPathBegin).
  frontendUrl: 'https://www.cellajs.com',
  backendUrl: 'https://www.cellajs.com/api',
  backendAuthUrl: 'https://www.cellajs.com/api/auth',
  yjsUrl: 'wss://www.cellajs.com/yjs',
  mcpUrl: 'https://www.cellajs.com/mcp',
  services: {
    frontend: { enabled: true as boolean, publicUrl: 'https://www.cellajs.com' },
    backend: { enabled: true as boolean, publicUrl: 'https://www.cellajs.com/api' },
    cdc: { enabled: true as boolean },
    yjs: { enabled: false as boolean, publicUrl: 'wss://www.cellajs.com/yjs' },
    mcp: { enabled: false as boolean, publicUrl: 'https://www.cellajs.com/mcp' },
  },

  // Cost escape hatch: when true the backend (MODE=api) also boots every enabled
  // service in-process: one VM for previews/small forks. Default false keeps the
  // split (one service per process). cdc co-hosting forfeits API blue-green.
  singleVM: false as boolean,

  aboutUrl: '/about',
  statusUrl: '',
  productionUrl: 'https://www.cellajs.com',

  defaultRedirectPath: '/home',
  welcomeRedirectPath: '/welcome',

  // Email

  senderEmail: 'notifications@shareworks.nl',
  supportEmail: 'info@cellajs.com',
  securityEmail: 'security@cellajs.com',

  // Mode & flags

  mode: 'development' as ConfigMode,
  maintenance: false,

  has: {
    pwa: true as boolean,
    selfRegistration: false as boolean,
    waitlist: false as boolean,
    uploadEnabled: true as boolean,
    chatSupport: false as boolean,
  },

  // Three independent version tokens. Bump the relevant one in the SAME PR as the change it guards:
  // - apiVersion: API contract / frozen-envelope version (wire structure).
  // - cookieVersion: session cookie name; bump to invalidate all sessions.
  // - clientCacheVersion: persisted client query-cache shape; bump on a breaking change to a cached
  //   entity so clients wipe stale cache (queued mutations survive). CI's schema-bust gate enforces
  //   this when no schema-evolution lens covers the change.

  apiVersion: 'v1',
  // Session cookies use the host-locked __Host- prefix; changing this version invalidates them.
  cookieVersion: 'v2',
  clientCacheVersion: 'v2-sequence',

  // Authentication

  enabledAuthStrategies: ['passkey', 'oauth', 'totp', 'magic'] as const,
  enabledOAuthProviders: ['github'] as const,
  tokenTypes: ['email-verification', 'oauth-verification', 'invitation', 'confirm-mfa', 'magic'] as const,

  /**
   * Maximum concurrent regular sessions per user. On sign-in, the oldest sessions beyond the cap are
   * hard-deleted (Hanko-style eviction). Keep comfortably above a realistic device count. This is
   * bloat/abuse protection (credential-stuffing bursts, unbounded session accumulation), not a UX
   * feature. `mfa` and `impersonation` sessions never count toward or get evicted by the cap.
   */
  maxSessionsPerUser: 10,

  totpConfig: {
    intervalInSeconds: 30,
    gracePeriodInSeconds: 60,
    digits: 6,
  },

  // API configuration

  apiDescription: `⚠️ ATTENTION: PRERELEASE!
                  This API is organized into modules based on logical domains.`,

  // Request limits

  requestLimits: {
    default: 40,
    users: 100,
    members: 40,
    organizations: 40,
    requests: 40,
    attachments: 40,
    pendingMemberships: 20,
  },

  jsonBodyLimit: 1 * 1024 * 1024,
  fileUploadLimit: 20 * 1024 * 1024,
  defaultBodyLimit: 1 * 1024 * 1024,

  // Storage & uploads (S3)

  s3: {
    region: 'nl-ams',
    host: 's3.nl-ams.scw.cloud',
  } as S3ConfigInput,

  uploadTemplateIds: ['avatar', 'cover', 'attachment'] as const,

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

  gleapToken: '1ZoAxCRA83h5pj7qtRSvuz7rNNN9iXDd',
  googleMapsKey: 'AIzaSyBc1KkCJr6TNMeAw9XK4OunGVWDSXJAKEM',
  matrixURL: 'https://matrix-client.matrix.org',
  maplePublicIngestKey: 'maple_pk_LnUSK6-_5j3orVrlZ1Hv6I1pxzDh3SJ5',

  // Theming & UI

  themeColor: '#26262b',
  theme: {
    navigation: {
      hasSidebarTextLabels: false,
      sidebarWidthExpanded: '16rem',
      sidebarWidthCollapsed: '4rem',
      sheetPanelWidth: '20rem',
    },
    colors: {
    },
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

  defaultLanguage: 'en' as const,
  languages: ['en', 'nl'] as const,
  c: {
    countries: ['fr', 'de', 'nl', 'ua', 'us', 'gb'],
    timezones: [],
  },

  // Company details

  company: {
    name: 'CellaJS',
    shortName: 'Cella',
    email: 'info@cellajs.com',
    supportEmail: 'info@cellajs.com',
    tel: '+31 6 12345678',
    streetAddress: 'Drizzle Road 42',
    postcode: '90210 JS',
    city: 'Hono City',
    country: 'TypeScript Rock',
    registration: 'Chamber of Commerce (KvK): 578 25 920',
    bankAccount: 'NL07 RABO 0309 4430 24',
    googleMapsUrl: 'https://goo.gl/maps/SQlrh',
    scheduleCallUrl: 'https://cal.com/flip-van-haaren',
    socialUrl: 'https://bsky.app/profile/flipvh.bsky.social',
    blueskyHandle: '@flipvh.bsky.social',
    element: 'https://matrix.to/#/!fvwljIbZIqzhNvjKvk:matrix.org',
    githubUrl: 'https://github.com/cellajs/cella',
    mapZoom: 4,
    coordinates: {
      lat: 51.92760809717153,
      lng: 4.47421039909924,
    },
  },

  // User defaults

  defaultUserFlags: {
    finishedOnboarding: false,
  },

  // Organization defaults

  defaultOrganizationFlags: {},

} satisfies RequiredConfig;
