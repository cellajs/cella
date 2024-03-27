export const config = {
  mode: 'development' as 'production' | 'development' | 'tunnel',
  name: 'Cella',
  slug: 'cella',

  frontendUrl: 'http://localhost:3000',
  backendUrl: 'http://localhost:4000',

  defaultRedirectPath: '/home',

  aboutUrl: '/about',
  statusUrl: 'https://status.cellajs.com',
  productionUrl: 'https://cellajs.com',

  description: 'A no-nonsense TypeScript template to build modern web apps. Open source.',
  keywords: 'starter kit, fullstack, monorepo, typescript, hono, honojs, drizzle, shadcn, react, postgres, pwa',

  notificationsEmail: 'notifications@cellajs.com',
  senderIsReceiver: false,

  debug: false,
  maintenance: false,

  // Webhooks with n8n
  newsletterWebhookUrl: 'https://cella.app.n8n.cloud/webhook/subscription?',
  contactWebhookUrl: 'https://cella.app.n8n.cloud/webhook/contact?',

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

  // File handling with imado
  tusUrl: 'http://localhost:1080',
  tusPort: 1080,
  s3UploadBucket: 'cella-uploads',
  s3UploadRegion: 'eu-west-1',
  privateCDNUrl: 'https://cdn-priv.cellajs.com',
  publicCDNUrl: 'https://cdn.cellajs.com',

  // Theme settings
  theme: {
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

  // Enabled OAuth providers
  oauthOptions: ['Github'],

  // Optional settings
  has: {
    pwaSupport: true,
    signUp: true, // TODO: implement
    waitlist: true, // TODO: implement
  },

  // Languages
  languages: [
    { value: 'en', label: 'English' },
    { value: 'nl', label: 'Nederlands' },
  ],

  defaultLanguage: 'en' as const,

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
      lon: 4.47421039909924,
    },
  },

  // Roles
  // TODO, make dynamic and type safe, for now it's hardcoded
  rolesByType: {
    system: [
      { key: 'ADMIN', value: 'common:admin' },
      { key: 'USER', value: 'common:user' },
    ],
    organization: [
      { key: 'ADMIN', value: 'common:admin' },
      { key: 'MEMBER', value: 'common:member' },
    ],
  } as const,
};

export default config;

export type DeepPartial<T> = T extends object
  ? {
      [P in keyof T]?: DeepPartial<T[P]>;
    }
  : T;

export type Config = DeepPartial<typeof config>;
