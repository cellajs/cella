export const config = {
  mode: 'development',
  name: 'Cella',
  slug: 'cella',

  domain: 'cellajs.com',
  frontendUrl: 'https://cellajs.com',
  backendUrl: 'https://api.cellajs.com',
  backendAuthUrl: 'https://api.cellajs.com/auth',
  tusUrl: 'https://tus.cellajs.com',
  electricUrl: 'https://electric.cellajs.com',

  defaultRedirectPath: '/home',
  welcomeRedirectPath: '/welcome',

  aboutUrl: 'https://cellajs.com/about',
  statusUrl: 'https://status.cellajs.com',
  productionUrl: 'https://cellajs.com',

  description: 'Intuitive TypeScript template to build web apps with a sync engine. MIT licensed.',
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

  // Which fields to omit from user object
  sensitiveFields: ['hashedPassword', 'unsubscribeToken'] as const,

  // API docs settings
  apiVersion: 'v1',
  apiDescription:
    '(ATTENTION: PRERELEASE!) This API documentation is split in modules. The documentation is based upon zod schemas that are converted to openapi specs using hono middleware: zod-openapi.',

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

  // File handling with imado
  tusPort: 4100,
  s3UploadBucket: 'cella-uploads',
  s3UploadRegion: 'eu-west-1',
  privateCDNUrl: 'https://cdn-priv.cellajs.com',
  publicCDNUrl: 'https://cdn.cellajs.com',

  themeColor: '#26262b',

  // Theme settings
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

  // Allowed oauth strategies providers
  enabledAuthenticationStrategies: ['password', 'passkey', 'oauth'] as const,

  // OAuth providers
  enabledOauthProviders: ['github'] as const,

  // Optional settings
  has: {
    pwa: true, // Progressive Web App support for preloading static assets and offline support
    sync: false, // Realtime updates and sync using Electric Sync
    registrationEnabled: true, // Allow users to sign up. If disabled, the app is by invitation only
    waitlist: false, // Suggest a waitlist for unknown emails when sign up is disabled,
    imado: true, // Imado fully configured, if false, files will be stored in local browser (indexedDB)
  },

  // Languages
  defaultLanguage: 'en' as const,

  languages: [
    { value: 'en', label: 'English' },
    { value: 'nl', label: 'Nederlands' },
  ] as const,

  // All entity types
  entityTypes: ['user', 'organization', 'attachment'] as const,

  // Page entity types (pages with memberships + users)
  pageEntityTypes: ['user', 'organization'] as const,

  // Context entity types (memberships)
  contextEntityTypes: ['organization'] as const,

  // Product entity types (no memberships)
  productEntityTypes: ['attachment'] as const,

  // Request limits
  requestLimits: {
    default: 40,
    users: 100,
    members: 40,
    organizations: 40,
    requests: 40,
    attachments: 40,
  },

  // Roles on system and entity level.
  rolesByType: { systemRoles: ['user', 'admin'] as const, entityRoles: ['member', 'admin'] as const, allRoles: ['user', 'member', 'admin'] as const },

  // Company details
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

  // UI settings
  navLogoAnimation: 'animate-spin-slow',

  // Common countries
  common: {
    countries: ['fr', 'de', 'nl', 'ua', 'us', 'gb'],
    timezones: [],
  },
};

export default config;

export type DeepPartial<T> = T extends object
  ? {
      [P in keyof T]?: DeepPartial<T[P]>;
    }
  : T;

export type Config = DeepPartial<typeof config>;
