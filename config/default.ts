import type { BaseAuthStrategies, BaseConfigType, BaseOAuthProviders, GenerateScript } from "./types";

export const config = {

  /******************************************************************************
   * APP IDENTITY
   ******************************************************************************/
  name: 'Cella',
  slug: 'cella',
  domain: 'cellajs.com',
  description: 'Cella is a TypeScript template to build collaborative web apps with sync engine. MIT licensed.',
  keywords:
    'starter kit, fullstack, monorepo, typescript, hono, honojs, drizzle, shadcn, react, postgres, pwa, offline, instant§ updates, realtime data, sync engine',

  /******************************************************************************
   * URLS & ENDPOINTS
   ******************************************************************************/
  frontendUrl: 'https://cellajs.com',
  backendUrl: 'https://api.cellajs.com',
  backendAuthUrl: 'https://api.cellajs.com/auth',

  aboutUrl: 'https://cellajs.com/about',
  statusUrl: 'https://status.cellajs.com',
  productionUrl: 'https://cellajs.com',

  defaultRedirectPath: '/home',
  welcomeRedirectPath: '/welcome',

  /******************************************************************************
   * EMAIL
   ******************************************************************************/
  supportEmail: 'support@cellajs.com',
  notificationsEmail: 'notifications@cellajs.com',

  /******************************************************************************
   * MODE & FLAGS
   ******************************************************************************/
  mode: 'development' satisfies BaseConfigType['mode'],
  debug: false,
  maintenance: false,
  cookieVersion: 'v1', // Reset version when changing cookie structure

  /******************************************************************************
   * FEATURE FLAGS
   ******************************************************************************/
  has: {
    pwa: true, // Progressive Web App support for preloading static assets and offline support
    registrationEnabled: true, // Allow users to sign up. If false, the app is by invitation only
    waitlist: true, // Suggest a waitlist for unknown emails when sign up is disabled
    uploadEnabled: true, // s3 fully configured, if false, files will be stored in local browser (indexedDB)
  },

  /******************************************************************************
   * AUTHENTICATION
   ******************************************************************************/
  // Currently available: 'password', 'passkey', 'oauth' and 'totp'.
  // Totp can only be used as a fallback strategy for mfa, with 'passkey' as the primary.
  enabledAuthStrategies: ['password', 'passkey', 'oauth', 'totp'] satisfies BaseAuthStrategies[],

  // Currently supported: 'github', 'google', 'microsoft'.
  enabledOAuthProviders: ['github'] satisfies BaseOAuthProviders[],
  tokenTypes: ['email-verification', 'oauth-verification', 'password-reset', 'invitation', 'confirm-mfa'] as const,
  totpConfig: {
    intervalInSeconds: 30,
    gracePeriodInSeconds: 60,
    digits: 6,
  },

  /******************************************************************************
   * API CONFIGURATION
   ******************************************************************************/
  apiVersion: 'v1',
  apiDescription: `⚠️ ATTENTION: PRERELEASE!  
                  This API is organized into modules based on logical domains (e.g. \`auth\`, \`organizations\`, \`memberships\`).
                  Each module includes a set of endpoints that expose functionality related to a specific resource or cross resource logic.

                  The documentation is generated from source code using \`zod\` schemas, converted into OpenAPI via \`zod-openapi\` and served through the \`hono\` framework.`,

  /******************************************************************************
   * ENTITY DATA MODEL
   ******************************************************************************/
  entityTypes: ['user', 'organization', 'attachment', 'page'] as const,

  contextEntityTypes: ['organization'] as const, // Entities with memberships
  productEntityTypes: ['attachment', 'page'] as const, // Content entities
  
  offlineEntityTypes: [] as const, // Entities that support offline transactions
  realtimeEntityTypes: ['attachment', 'page'] as const, // Entities with realtime & offline transactions

  entityIdColumnKeys: {
    user: 'userId',
    organization: 'organizationId',
    attachment: 'attachmentId',
    page: 'pageId',
  } as const,

  entityActions: ['create', 'read', 'update', 'delete', 'search'] as const,

  // Define user menu structure of context entities with optionally nested subentities
  // ⚠️ IMPORTANT: If you define a `subentityType`, the corresponding table must include `${entity}Id` foreign key.
  menuStructure: [
    {
      entityType: 'organization',
      subentityType: null,
    } as const,
  ],
  defaultOrganizationRestrictions: {
    user: 1000,
    attachment: 100,
  } as const,

  /******************************************************************************
   * REQUEST LIMITS
   ******************************************************************************/
  // BE common-schemas enforce max 1000 via `limitRefine`. Adjust if needed.
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
  jsonBodyLimit: 1 * 1024 * 1024, // 1mb
  fileUploadLimit: 20 * 1024 * 1024, // 20mb
  defaultBodyLimit: 1 * 1024 * 1024, // 1mb

  /******************************************************************************
   * ROLES & PERMISSIONS
   ******************************************************************************/
  roles: {
    systemRoles: ['admin'] as const,
    entityRoles: ['member', 'admin'] as const,
  },

  /******************************************************************************
   * STORAGE & UPLOADS (S3)
   ******************************************************************************/
  s3BucketPrefix: 'cella' satisfies BaseConfigType['s3BucketPrefix'] as BaseConfigType['s3BucketPrefix'],
  s3PublicBucket: 'imado-dev',
  s3PrivateBucket: 'imado-dev-priv',
  s3Region: 'nl-ams',
  s3Host: 's3.nl-ams.scw.cloud',
  privateCDNUrl: 'https://imado-dev-priv.s3.nl-ams.scw.cloud',
  publicCDNUrl: 'https://imado-dev.s3.nl-ams.scw.cloud',
  uploadTemplateIds: ['avatar', 'cover', 'attachment'] as const,
  uppy: {
    defaultRestrictions: {
      maxFileSize: 10 * 1024 * 1024, // 10MB
      maxNumberOfFiles: 1,
      allowedFileTypes: ['.jpg', '.jpeg', '.png'],
      maxTotalFileSize: 100 * 1024 * 1024, // 100MB
      minFileSize: null,
      minNumberOfFiles: null,
      requiredMetaFields: [],
    },
  },

  /******************************************************************************
   * THIRD-PARTY SERVICES
   ******************************************************************************/
  // Paddle (Payments)
  paddleToken: 'test_85052d6574ab68d36b341e0afc8',
  paddlePriceIds: {
    donate: 'pri_01hq8da4mn9s0z0da7chh0ntb9',
  },
  // Sentry (Error tracking)
  sentryDsn: 'https://0f6c6e4d1e825242d9d5b0b73faa97fa@o4506897995399168.ingest.us.sentry.io/4506898171559936',
  sentSentrySourceMaps: true,
  // Gleap (Customer support)
  gleapToken: '1ZoAxCRA83h5pj7qtRSvuz7rNNN9iXDd',
  // Google Maps
  googleMapsKey: 'AIzaSyDMjCpQusdoPWLeD7jxkqAxVgJ8s5xJ3Co',
  // Matrix (Chat)
  matrixURL: 'https://matrix-client.matrix.org',

  /******************************************************************************
   * THEMING & UI
   ******************************************************************************/
  themeColor: '#26262b',
  theme: {
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
  navLogoAnimation: 'animate-spin-slow',

  /******************************************************************************
   * LOCALIZATION
   ******************************************************************************/
  defaultLanguage: 'en' as const,
  languages: ['en', 'nl'] as const,
  common: {
    countries: ['fr', 'de', 'nl', 'ua', 'us', 'gb'],
    timezones: [],
  },

  /******************************************************************************
   * COMPANY DETAILS
   ******************************************************************************/
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
  defaultUserFlags: {
    finishedOnboarding: false,
  },

  /******************************************************************************
   * LOGGING & ERRORS
   ******************************************************************************/
  severityLevels: {
    fatal: 60,
    error: 50,
    warn: 40,
    info: 30,
    debug: 20,
    trace: 10,
  } as const,

  /******************************************************************************
   * DEV & SEEDING
   ******************************************************************************/
  generateScripts: [
    {
      name: 'Drizzle migrations',
      command: 'drizzle-kit generate --config drizzle.config.ts',
      type: 'drizzle',
    },
    {
      name: 'CDC setup migration',
      command: 'tsx scripts/migrations/cdc-migration.ts',
      type: 'migration',
      migrationTag: 'cdc_setup',
    },
    {
      name: 'Partman setup migration',
      command: 'tsx scripts/migrations/partman-migration.ts',
      type: 'migration',
      migrationTag: 'partman_setup',
    },
  ] satisfies GenerateScript[],
  seedScripts: ['pnpm run seed:user', 'pnpm run seed:organizations', 'pnpm run seed:data'],
};

export default config;


