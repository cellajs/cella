export const config = {
  mode: 'development',
  name: 'Cella',
  slug: 'cella',
  domain: 'cellajs.com',

  frontendUrl: 'https://cellajs.com',
  backendUrl: 'https://api.cellajs.com',
  backendAuthUrl: 'https://api.cellajs.com/auth',
  electricUrl: 'https://electric.cellajs.com',

  defaultRedirectPath: '/home',
  welcomeRedirectPath: '/welcome',

  aboutUrl: 'https://cellajs.com/about',
  statusUrl: 'https://status.cellajs.com',
  productionUrl: 'https://cellajs.com',

  description: 'Cella is a comprehensive TypeScript template to build web apps with sync engine. MIT licensed.',
  keywords:
    'starter kit, fullstack, monorepo, typescript, hono, honojs, drizzle, shadcn, react, postgres, pwa, offline, instant updates, realtime data, sync engine',

  supportEmail: 'support@cellajs.com',
  notificationsEmail: 'notifications@cellajs.com',

  debug: false,
  maintenance: false,

  // Reset version when changing cookie structure
  cookieVersion: 'v1',

  // Which scripts to run when seeding the database
  seedScripts: ['pnpm run seed:user', 'pnpm run seed:organizations'],

  // Sensitive fields to omit from user object
  sensitiveFields: ['hashedPassword', 'unsubscribeToken'] as const,

  // API docs settings
  apiVersion: 'v1',
  apiDescription:
    '(ATTENTION: PRERELEASE!) This API documentation is split in modules. The documentation is based upon zod schemas that are converted to openapi using hono middleware: zod-openapi.',

  // Payment with Paddle
  // paddleToken: 'live_ba8bb57b62089459e4f4fd1da8c',
  // paddlePriceIds: {
  //   donate: 'pri_01hq8hech7se5y1dw9tnscfzpc',
  // },
  paddleToken: 'test_85052d6574ab68d36b341e0afc8',
  paddlePriceIds: {
    donate: 'pri_01hq8da4mn9s0z0da7chh0ntb9',
  },

  sentryDsn: 'https://0f6c6e4d1e825242d9d5b0b73faa97fa@o4506897995399168.ingest.us.sentry.io/4506898171559936',
  sentSentrySourceMaps: true,

  // Customer support with Gleap
  gleapToken: '1ZoAxCRA83h5pj7qtRSvuz7rNNN9iXDd',

  // Google maps key
  googleMapsKey: 'AIzaSyDMjCpQusdoPWLeD7jxkqAxVgJ8s5xJ3Co',

  // File handling with s3 on Scaleway
  s3BucketPrefix: 'cella' as string | null, // Prefix to namespace files when sharing a bucket across apps or envs
  s3PublicBucket: 'imado-dev',
  s3PrivateBucket: 'imado-dev-priv',
  s3Region: 'nl-ams',
  s3Host: 's3.nl-ams.scw.cloud',
  privateCDNUrl: 'https://imado-dev-priv.s3.nl-ams.scw.cloud',
  publicCDNUrl: 'https://544ba5eb-2c7a-417f-a5bf-b13950b89755.svc.edge.scw.cloud',

  // Upload templates using Transloadit
  uploadTemplateIds: ['avatar', 'cover', 'attachment'] as const,

  // Theme settings
  themeColor: '#26262b',
  theme: {
    colors: {
      rose: '#e11d48',
    },
    colorDarkBackground: 'hsl(240 10% 9%)',
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

  // Placeholder colors
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

  /**
   * Upload body limit
   */
  jsonBodyLimit: 1 * 1024 * 1024, // 1mb
  fileUploadLimit: 20 * 1024 * 1024, // 20mb
  defaultBodyLimit: 1 * 1024 * 1024, // 1mb

  // Allowed oauth strategies providers
  enabledAuthenticationStrategies: ['password', 'passkey', 'oauth'] as const,

  // OAuth providers
  enabledOauthProviders: ['github'] as const,

  // Token types
  tokenTypes: ['email_verification', 'password_reset', 'invitation'] as const,

  // Optional settings
  has: {
    pwa: true, // Progressive Web App support for preloading static assets and offline support
    sync: true, // Realtime updates and sync using Electric Sync
    registrationEnabled: false, // Allow users to sign up. If false, the app is by invitation only
    waitlist: true, // Suggest a waitlist for unknown emails when sign up is disabled,
    uploadEnabled: true, // s3 fully configured, if false, files will be stored in local browser (indexedDB)
  },

  /**
   * Default language
   */
  defaultLanguage: 'en' as const,

  /**
   * Language options
   */
  languages: ['en', 'nl'] as const,

  /**
   * All entity types used in the app
   */
  entities: ['user', 'organization', 'attachment'] as const,

  /**
   * Page entity types (pages with memberships + users)
   */
  pageEntities: ['user', 'organization'] as const,

  /**
   * Context entity types (memberships)
   */
  contextEntities: ['organization'] as const,

  /**
   * Product entity types (mostly content)
   */
  productEntities: ['attachment'] as const,

  /**
   * Define fields to identify an entity in a relationship
   */
  entityIdFields: {
    user: 'userId',
    organization: 'organizationId',
    attachment: 'attachmentId',
  } as const,

  /**
   * Define user menu structure of context entities with optionally nested subentities
   * ⚠️ IMPORTANT: If you define a `subentity`, then the corresponding database table for that
   * subentity, must include a foreign key, field named `${entity}Id`.
   */
  menuStructure: [
    {
      entity: 'organization',
      subentity: null,
    } as const,
  ],

  /**
   * Restrictions within organization to set limits on entities
   */
  defaultOrganizationRestrictions: {
    user: 1000,
    attachment: 100,
  } as const,

  /**
   * Default request limits for lists
   *
   * By default, BE common-schemas enforce a maximum limit of 1000 items via `limitRefine`
   * if some of requested limit need to exceed 1000, make sure to adjust `limitRefine` accordingly
   */
  requestLimits: {
    default: 40,
    users: 100,
    members: 40,
    organizations: 40,
    requests: 40,
    attachments: 40,
    pendingInvitations: 20,
  },
  /**
   * Roles on system and entity level
   */
  rolesByType: {
    systemRoles: ['user', 'admin'] as const,
    entityRoles: ['member', 'admin'] as const,
    allRoles: ['user', 'member', 'admin'] as const,
  },

  /**
   * Company details
   */
  company: {
    name: 'CellaJS',
    shortName: 'Cella',
    email: 'info@cellajs.com',
    postcode: '90210 JS',
    tel: '+31 6 12345678',
    streetAddress: 'Drizzle Road 42',
    city: 'Hono City',
    country: 'TypeScript Rock',
    googleMapsUrl: 'https://goo.gl/maps/SQlrh',
    scheduleCallUrl: 'https://cal.com/flip-van-haaren',
    blueskyUrl: 'https://bsky.app/profile/flipvh.bsky.social',
    blueskyHandle: '@flipvh.bsky.social',
    githubUrl: 'https://github.com/cellajs/cella',
    mapZoom: 4,
    coordinates: {
      lat: 51.92760809717153,
      lng: 4.47421039909924,
    },
  },

  /**
   * Error handling
   */
  severityLevels: ['debug', 'log', 'info', 'warn', 'error'] as const,

  /**
   * UI settings
   */
  navLogoAnimation: 'animate-spin-slow',

  /**
   * Common countries
   */
  common: {
    countries: ['fr', 'de', 'nl', 'ua', 'us', 'gb'],
    timezones: [],
  },

  /**
   * Uppy file uploader settings.
   */
  uppy: {
    defaultRestrictions: {
      maxFileSize: 10 * 1024 * 1024, // 10MB
      maxNumberOfFiles: 1,
      allowedFileTypes: ['.jpg', '.jpeg', '.png'],
      maxTotalFileSize: 100 * 1024 * 1024, // 100MB
    },
  },
};
export default config;

export type DeepPartial<T> = T extends object
  ? {
      [P in keyof T]?: DeepPartial<T[P]>;
    }
  : T;

export type Config = DeepPartial<typeof config>;
