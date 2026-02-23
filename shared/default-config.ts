import type { BaseAuthStrategies, BaseOAuthProviders, ConfigMode, RequiredConfig, S3Config } from './src/builder/types';

// Re-export for external consumers
export { roles, hierarchy } from './hierarchy-config';

export const config = {

  /******************************************************************************
   * ENTITY DATA MODEL
   ******************************************************************************/

  /** All entity types in the app - must match hierarchy.allTypes. Explicit tuple for Drizzle compatibility. */
  entityTypes: ['user', 'organization', 'attachment', 'page'] as const,

  /** Context entities with memberships - must match hierarchy.contextTypes. Explicit tuple for Drizzle compatibility. */
  contextEntityTypes: ['organization'] as const,
  
  /** Product/content entities - must match hierarchy.productTypes. Explicit tuple for Drizzle compatibility. */
  productEntityTypes: ['attachment', 'page'] as const,

  /**
   * Parentless product entities (no organization_id) - must match hierarchy.parentlessProductTypes.
   * Explicit tuple required for Drizzle compatibility. Compile-time validated in shared/index.ts.
   */
  parentlessProductEntityTypes: ['page'] as const,

  /** Maps entity types to their ID column names - must match entityTypes */
  entityIdColumnKeys: {
    user: 'userId',
    organization: 'organizationId',
    attachment: 'attachmentId',
    page: 'pageId',
  } as const,

  /** Available CRUD actions for permission checks */
  entityActions: ['create', 'read', 'update', 'delete'] as const,

  /** Resource types that are not entities but have activities logged */
  resourceTypes: ['request', 'membership', 'inactive_membership', 'tenant'] as const,

  /**
   * User menu structure of context entities with optional nested subentities.
   * If subentityType is set, the table must include `${entity}Id` foreign key.
   */
  menuStructure: [
    { entityType: 'organization',subentityType: null} as const,
  ],

  /** Default restrictions for organizations (max entities per org) */
  defaultOrganizationRestrictions: {
    user: 1000,
    attachment: 100,
  } as const,

  /******************************************************************************
   * SYSTEM ROLES
   ******************************************************************************/
  
  /**
   * System-wide roles stored in DB.
   * Must include 'admin' for system administration access.
   */
  systemRoles: ['admin'] as const,

  /******************************************************************************
   * APP IDENTITY
   ******************************************************************************/

  /** App display name shown in UI and emails */
  name: 'Cella',
  /** URL-safe identifier used in paths and storage */
  slug: 'cella',
  /** Primary domain for the app */
  domain: 'cellajs.com',
  /** App description for SEO and meta tags */
  description: 'Cella is a TypeScript template to build collaborative web apps with sync engine. MIT licensed.',
  /** SEO keywords for search engines */
  keywords:
    'starter kit, fullstack, monorepo, typescript, hono, honojs, drizzle, shadcn, react, postgres, pwa, offline, instant§ updates, realtime data, sync engine',

  /******************************************************************************
   * URLS & ENDPOINTS
   ******************************************************************************/

  /** Frontend SPA base URL */
  frontendUrl: 'https://cellajs.com',
  /** Backend API base URL */
  backendUrl: 'https://api.cellajs.com',
  /** OAuth callback base URL */
  backendAuthUrl: 'https://api.cellajs.com/auth',

  /** About page URL */
  aboutUrl: 'https://cellajs.com/about',
  /** Status page URL for uptime monitoring */
  statusUrl: 'https://status.cellajs.com',
  /** Canonical production URL */
  productionUrl: 'https://cellajs.com',

  /** Default redirect path after login */
  defaultRedirectPath: '/home',
  /** Redirect path for first-time users */
  welcomeRedirectPath: '/welcome',

  /******************************************************************************
   * EMAIL
   ******************************************************************************/

  /** Email address for user support inquiries */
  supportEmail: 'support@cellajs.com',
  /** From address for system notifications */
  notificationsEmail: 'notifications@cellajs.com',

  /******************************************************************************
   * MODE & FLAGS
   ******************************************************************************/
  
  /** Runtime mode - overridden per environment file */
  mode: 'development' as ConfigMode,
  /** Enable debug logging and dev tools */
  debug: false,
  /** Enable maintenance mode (blocks all requests) */
  maintenance: false,
  /** Cookie version - increment when changing cookie structure to invalidate old cookies */
  cookieVersion: 'v1',

  /******************************************************************************
   * FEATURE FLAGS
   ******************************************************************************/

  /**
   * Feature toggles for app capabilities.
   * Use to enable/disable major features without code changes.
   */
  has: {
    /** Progressive Web App support for preloading static assets and offline support */
    pwa: true,
    /** Allow users to sign up. If false, the app is by invitation only */
    registrationEnabled: true,
    /** Suggest a waitlist for unknown emails when sign up is disabled */
    waitlist: true,
    /** S3 fully configured - if false, files will be stored in local browser (IndexedDB) */
    uploadEnabled: true,
  },

  /******************************************************************************
   * AUTHENTICATION
   ******************************************************************************/

  /**
   * Enabled authentication strategies.
   * TOTP can only be used as MFA fallback with passkey as primary.
   */
  enabledAuthStrategies: ['password', 'passkey', 'oauth', 'totp'] satisfies BaseAuthStrategies[],

  /** Enabled OAuth providers - currently supports: github, google, microsoft */
  enabledOAuthProviders: ['github'] satisfies BaseOAuthProviders[],

  /** Token types used for verification flows */
  tokenTypes: ['email-verification', 'oauth-verification', 'password-reset', 'invitation', 'confirm-mfa'] as const,

  /** TOTP configuration for MFA */
  totpConfig: {
    intervalInSeconds: 30,
    gracePeriodInSeconds: 60,
    digits: 6,
  },

  /******************************************************************************
   * API CONFIGURATION
   ******************************************************************************/

  /** API version prefix for endpoints */
  apiVersion: 'v1',
  /** API documentation description shown in Scalar */
  apiDescription: `⚠️ ATTENTION: PRERELEASE!  
                  This API is organized into modules based on logical domains (e.g. \`auth\`, \`organizations\`, \`memberships\`).
                  Each module includes a set of endpoints that expose functionality related to a specific resource or cross resource logic.

                  The documentation is generated from source code using \`zod\` schemas, converted into OpenAPI via \`zod-openapi\` and served through the \`hono\` framework.`,


  /******************************************************************************
   * REQUEST LIMITS
   ******************************************************************************/

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
    pages: 40,
    pendingMemberships: 20,
  },

  /** Max JSON body size in bytes */
  jsonBodyLimit: 1 * 1024 * 1024,
  /** Max file upload size in bytes */
  fileUploadLimit: 20 * 1024 * 1024,
  /** Default body size limit in bytes */
  defaultBodyLimit: 1 * 1024 * 1024,

  /******************************************************************************
   * STORAGE & UPLOADS (S3)
   ******************************************************************************/

  /** S3-compatible storage configuration */
  s3: {
    /** Prefix to namespace files when sharing a bucket across apps or envs */
    bucketPrefix: 'cella',
    /** Public bucket name for publicly accessible files */
    publicBucket: 'imado-dev',
    /** Private bucket name for authenticated-only files */
    privateBucket: 'imado-dev-priv',
    /** S3 region identifier */
    region: 'nl-ams',
    /** S3 host endpoint */
    host: 's3.nl-ams.scw.cloud',
    /** CDN URL for private bucket (signed URLs) */
    privateCDNUrl: 'https://imado-dev-priv.s3.nl-ams.scw.cloud',
    /** CDN URL for public bucket */
    publicCDNUrl: 'https://imado-dev.s3.nl-ams.scw.cloud',
  } satisfies S3Config,

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
    enabled: true, // Enable local blob caching
    maxFileSize: 10 * 1024 * 1024, // 10MB - files larger than this are not cached locally
    maxTotalSize: 100 * 1024 * 1024, // 100MB - total cache size, LRU eviction when exceeded
    allowedContentTypes: [] as string[], // Empty = all types allowed
    excludedContentTypes: ['video/*'] as string[], // Excluded types (takes precedence over allowed)
    downloadConcurrency: 2, // Max concurrent background downloads
    uploadRetryAttempts: 3, // Max retry attempts for failed uploads
    uploadRetryDelays: [60000, 300000, 900000] as const, // Retry delays in ms (1min, 5min, 15min)
  },

  /******************************************************************************
   * THIRD-PARTY SERVICES
   ******************************************************************************/

  /** Paddle client token for payments */
  paddleToken: 'test_85052d6574ab68d36b341e0afc8',
  /** Paddle price IDs for subscription products */
  paddlePriceIds: {
    donate: 'pri_01hq8da4mn9s0z0da7chh0ntb9',
  },
  /** Sentry DSN for error tracking */
  sentryDsn: 'https://0f6c6e4d1e825242d9d5b0b73faa97fa@o4506897995399168.ingest.us.sentry.io/4506898171559936',
  /** Upload source maps to Sentry on build */
  sentSentrySourceMaps: true,
  /** Gleap token for customer support widget */
  gleapToken: '1ZoAxCRA83h5pj7qtRSvuz7rNNN9iXDd',
  /** Google Maps API key */
  googleMapsKey: 'AIzaSyDMjCpQusdoPWLeD7jxkqAxVgJ8s5xJ3Co',
  /** Matrix homeserver URL for chat integration */
  matrixURL: 'https://matrix-client.matrix.org',

  /******************************************************************************
   * THEMING & UI
   ******************************************************************************/

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
    colors: {
      rose: '#e11d48',
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

  /******************************************************************************
   * LOCALIZATION
   ******************************************************************************/

  /** Default language code */
  defaultLanguage: 'en' as const,
  /** Available language codes - first is fallback */
  languages: ['en', 'nl'] as const,
  /** Common reference data */
  common: {
    countries: ['fr', 'de', 'nl', 'ua', 'us', 'gb'],
    timezones: [],
  },

  /******************************************************************************
   * COMPANY DETAILS
   ******************************************************************************/

  /** Company/organization details for footer, legal pages, and contact info */
  company: {
    name: 'CellaJS',
    shortName: 'Cella',
    email: 'info@cellajs.com',
    supportEmail: 'support@cellajs.com',
    tel: '+31 6 12345678',
    streetAddress: 'Drizzle Road 42',
    postcode: '90210 JS',
    city: 'Hono City',
    country: 'TypeScript Rock',
    registration: 'Chamber of Commerce (KvK): 578 25 920',
    bankAccount: 'NL07 RABO 0309 4430 24',
    googleMapsUrl: 'https://goo.gl/maps/SQlrh',
    scheduleCallUrl: 'https://cal.com/flip-van-haaren',
    blueskyUrl: 'https://bsky.app/profile/flipvh.bsky.social',
    blueskyHandle: '@flipvh.bsky.social',
    element: 'https://matrix.to/#/!fvwljIbZIqzhNvjKvk:matrix.org',
    githubUrl: 'https://github.com/cellajs/cella',
    mapZoom: 4,
    coordinates: {
      lat: 51.92760809717153,
      lng: 4.47421039909924,
    },
  },

  /******************************************************************************
   * USER DEFAULTS
   ******************************************************************************/

  /** Default user flags applied to new users */
  defaultUserFlags: {
    finishedOnboarding: false,
  },
} satisfies RequiredConfig;

export default config;


