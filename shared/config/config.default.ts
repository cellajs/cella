import type { ConfigMode, RequiredConfig } from '../src/config-builder/types';

// Re-export for external consumers
export { roles, hierarchy } from './hierarchy-config';

export const config = {

  /******************************************************************************
   * ENTITY DATA MODEL
   ******************************************************************************/

  /** All entity types in the app - must match hierarchy.allTypes. */
  entityTypes: ['user', 'organization', 'attachment', 'page'] as const,

  /** Context entities with memberships - must match hierarchy.contextTypes. */
  contextEntityTypes: ['organization'] as const,

  /** Product/content entities - must match hierarchy.productTypes. */
  productEntityTypes: ['attachment', 'page'] as const,

  /**
   * Product entity types tracked for seen/unseen counts.
   * Unseen counts are grouped by the parent context entity of each tracked type.
   */
  seenTrackedEntityTypes: ['attachment'] as const,

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
   * Entity embeddings: declares which entities are embedded as ID arrays inside
   * other entities. Forks extend when adding new embedding relationships.
   */
  entityEmbeddings: [] as readonly { readonly embeddedEntity: string; readonly hostEntity: string; readonly hostColumn: string }[],

  /**
   * User menu structure of context entities with optional nested subentities.
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

  /******************************************************************************
   * SYSTEM ROLES
   ******************************************************************************/

  systemRoles: ['admin'] as const,

  /******************************************************************************
   * APP IDENTITY
   ******************************************************************************/

  name: 'Cella',
  slug: 'cella',
  domain: 'cella.dev',
  description: 'A TypeScript template to build collaborative web apps with sync engine. MIT licensed.',
  keywords:
    'starter kit, fullstack, monorepo, typescript, hono, honojs, drizzle, shadcn, react, postgres, pwa, offline, instant updates, realtime data, sync engine',

  /******************************************************************************
   * URLS & ENDPOINTS
   ******************************************************************************/

  frontendUrl: 'https://www.cella.dev',
  backendUrl: 'https://api.cella.dev',
  backendAuthUrl: 'https://api.cella.dev/auth',
  yjsUrl: 'wss://yjs.cella.dev',
  aiUrl: 'https://ai.cella.dev',

  aboutUrl: '/about',
  statusUrl: 'https://status.cella.dev',
  productionUrl: 'https://cella.dev',

  defaultRedirectPath: '/home',
  welcomeRedirectPath: '/welcome',

  /******************************************************************************
   * EMAIL
   ******************************************************************************/

  supportEmail: 'support@cellajs.com',
  notificationsEmail: 'notifications@cellajs.com',
  securityEmail: 'security@cellajs.com',

  /******************************************************************************
   * MODE & FLAGS
   ******************************************************************************/

  mode: 'development' as ConfigMode,
  maintenance: false,
  cookieVersion: 'v1',

  /******************************************************************************
   * FEATURE FLAGS
   ******************************************************************************/

  has: {
    pwa: true as boolean,
    selfRegistration: true as boolean,
    waitlist: true as boolean,
    uploadEnabled: true as boolean,
    chatSupport: false as boolean,
  },

  /******************************************************************************
   * AUTHENTICATION
   ******************************************************************************/

  enabledAuthStrategies: ['passkey', 'oauth', 'totp', 'magic'] as const,
  enabledOAuthProviders: ['github'] as const,
  tokenTypes: ['email-verification', 'oauth-verification', 'invitation', 'confirm-mfa', 'magic'] as const,

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
                  This API is organized into modules based on logical domains.`,

  /******************************************************************************
   * REQUEST LIMITS
   ******************************************************************************/

  requestLimits: {
    default: 40,
    users: 100,
    members: 40,
    organizations: 40,
    requests: 40,
    attachments: 40,
    pages: 100,
    pendingMemberships: 20,
  },

  jsonBodyLimit: 1 * 1024 * 1024,
  fileUploadLimit: 20 * 1024 * 1024,
  defaultBodyLimit: 1 * 1024 * 1024,

  /******************************************************************************
   * STORAGE & UPLOADS (S3)
   ******************************************************************************/

  s3: {
    region: 'nl-ams',
    host: 's3.nl-ams.scw.cloud',
  },

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
    uploadRetryAttempts: 3,
    uploadRetryDelays: [60000, 300000, 900000] as const,
  },

  /******************************************************************************
   * THIRD-PARTY SERVICES
   ******************************************************************************/

  gleapToken: '1ZoAxCRA83h5pj7qtRSvuz7rNNN9iXDd',
  googleMapsKey: 'AIzaSyBc1KkCJr6TNMeAw9XK4OunGVWDSXJAKEM',
  matrixURL: 'https://matrix-client.matrix.org',

  /******************************************************************************
   * THEMING & UI
   ******************************************************************************/

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

  /******************************************************************************
   * LOCALIZATION
   ******************************************************************************/

  defaultLanguage: 'en' as const,
  languages: ['en', 'nl'] as const,
  c: {
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
} satisfies RequiredConfig;

export default config;
