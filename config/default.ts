export const config = {
  mode: 'development',
  name: 'Raak',
  slug: 'raak',

  domain: 'raak.io',
  frontendUrl: 'https://raak.io',
  backendUrl: 'https://api.raak.io',
  backendAuthUrl: 'https://api.raak.io/auth',
  tusUrl: 'https://tus.raak.io',
  electricUrl: 'https://electric.raak.io',

  defaultRedirectPath: '/home',
  firstSignInRedirectPath: '/welcome',

  aboutUrl: '/about',
  statusUrl: 'https://status.raak.io',
  productionUrl: 'https://raak.io',

  description: 'raak',
  keywords:
    'project management tool, collaboration tool, task tracker, task management, issue tracker, kanban board, trello, pivotal tracker replacement, jira, linear, pivotal tracker migration',

  supportEmail: 'support@raak.io',
  notificationsEmail: 'notifications@raak.io',
  senderIsReceiver: false,

  debug: false,
  maintenance: false,

  // Which scripts to run when seeding the database
  seedScripts: ['pnpm run seed:user', 'pnpm run seed:organizations', 'pnpm run seed:data'],

  // Which fields to omit from user object
  sensitiveFields: ['hashedPassword', 'unsubscribeToken'] as const,

  // API docs settings
  apiVersion: 'v1',
  apiDescription: 'Raak API alpha version',

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

  themeColor: '#2AB16A',

  // Theme settings
  theme: {
    colors: {},
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
  enabledAuthenticationStrategies: ['password'] as const,

  // OAuth providers
  enabledOauthProviders: ['github'] as const,

  // Optional settings
  has: {
    pwa: true, // Progressive Web App support for preloading static assets and offline support
    registrationEnabled: false, // Allow users to sign up. If disabled, the app is by invitation only
    waitList: false, // Suggest a waitlist for unknown emails when sign up is disabled
  },

  // Languages
  defaultLanguage: 'en' as const,

  languages: [
    { value: 'en', label: 'English' },
    { value: 'nl', label: 'Nederlands' },
  ] as const,

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
    name: 'Shareworks Solutions BV',
    shortName: 'Shareworks',
    email: 'info@shareworks.nl',
    tel: '',
    postcode: '3033 BH',
    streetAddress: 'Schiekade 105',
    city: 'Rotterdam',
    country: 'Netherlands',
    googleMapsUrl: 'https://goo.gl/maps/SQlrh',
    scheduleCallUrl: 'https://cal.com/flip-van-haaren',
    twitterUrl: 'https://twitter.com/flipvanhaaren',
    twitterHandle: '@flipvanhaaren',
    githubUrl: 'https://github.com/cellajs/raak',
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
