export const config = {
  mode: 'development',
  name: 'Cella',
  slug: 'cella',

  domain: 'cellajs.com',
  frontendUrl: 'https://cellajs.com',
  backendUrl: 'https://api.cellajs.com',
  backendAuthUrl: 'https://api.cellajs.com/auth',
  tusUrl: 'https://tus.cellajs.com',

  defaultRedirectPath: '/home',
  firstSignInRedirectPath: '/welcome',

  aboutUrl: '/about',
  statusUrl: 'https://status.cellajs.com',
  productionUrl: 'https://cellajs.com',

  description: 'Intuitive TypeScript template to build local-first web apps. Implementation-ready. MIT licensed.',
  keywords: 'starter kit, fullstack, monorepo, typescript, hono, honojs, drizzle, shadcn, react, postgres, pwa',

  supportEmail: 'support@cellajs.com',
  notificationsEmail: 'notifications@cellajs.com',
  senderIsReceiver: false,

  debug: false,
  maintenance: false,

  // Which scripts to run when seeding the database

  seedScripts: ['pnpm run seed:user', 'pnpm run seed:organizations', 'pnpm run seed:data'],

  // Which fields to omit from user object
  sensitiveFields: ['hashedPassword', 'unsubscribeToken'] as const,

  // API docs settings
  apiVersion: 'v1',
  apiDescription: `
      (ATTENTION: PRERELEASE!) This API documentation is split in modules. Each module relates to a module in the backend codebase. Each module should be at least loosely-coupled, but ideally entirely decoupled. The documentation is based upon zod schemas that are converted to openapi specs using hono middleware: zod-openapi.

      API differentiates between two types of resource: entities and resources. Entities are the main data objects, the other tables are secondary. They all have an entity column.

      Entities can be split into three categories:
      1) Contextual entities (ie organization, workspace, project)
      2) Product entities (ie task, label)
      3) All entities (ie user, organization, workspace, project, task, label)

      - SSE stream is not included in this API documentation
      - API design is flat, not nested`,

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
  tusPort: 1080,
  s3UploadBucket: 'cella-uploads',
  s3UploadRegion: 'eu-west-1',
  privateCDNUrl: 'https://cdn-priv.cellajs.com',
  publicCDNUrl: 'https://cdn.cellajs.com',

  // Theme settings
  theme: {
    dark: { primary: '#26262b' },
    rose: { primary: '#e11d48' },
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
  },

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

  // OAuth providers
  oauthProviderOptions: ['github', 'google', 'microsoft'] as const,
  enabledOauthProviders: ['github'] as const,

  // Optional settings
  has: {
    pwa: true, // Progressive Web App support for preloading static assets and offline support
    signUp: true, // Allow users to sign up. If disabled, the app is by invitation only
    waitList: false, // Suggest a waitlist for unknown emails when sign up is disabled
  },

  // Languages
  defaultLanguage: 'en' as const,

  languages: [
    { value: 'en', label: 'English' },
    { value: 'nl', label: 'Nederlands' },
  ],

  // All entity types
  entityTypes: ['user', 'organization', 'workspace', 'project', 'task', 'label'] as const,

  // Page entity types (pages with memberships and users)
  pageEntityTypes: ['user', 'organization', 'workspace', 'project'] as const,

  // Context entity types (memberships)
  contextEntityTypes: ['organization', 'workspace', 'project'] as const,

  // Product entity types (no memberships)
  productEntityTypes: ['task', 'label'] as const,

  rolesByType: {
    systemRoles: ['user', 'admin'] as const,
    entityRoles: ['member', 'admin'] as const,
    allRoles: ['user', 'member', 'admin'] as const,
  },

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
    twitterUrl: 'https://twitter.com/flipvanhaaren',
    twitterHandle: '@flipvanhaaren',
    githubUrl: 'https://github.com/cellajs/cella',
    mapZoom: 4,
    coordinates: {
      lat: 51.92760809717153,
      lng: 4.47421039909924,
    },
  },

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
