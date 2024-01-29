export const config = {
  mode: 'development',
  name: 'Cella',
  slug: 'cella',
  frontendUrl: 'http://localhost:3000',
  backendUrl: 'http://localhost:4000',

  defaultRedirectPath: '/home',

  aboutUrl: 'https://about.example.com',
  statusUrl: 'https://status.example.com',

  notificationsEmail: 'notifications@cellajs.com',
  senderIsReceiver: false,

  debug: false,
  maintenance: false,

  newsletterWebhookUrl: 'https://cella.app.n8n.cloud/webhook/subscription?',
  contactWebhookUrl: 'https://cella.app.n8n.cloud/webhook/contact?',

  // File handling with imado
  tusUrl: 'http://localhost:1080',
  tusPort: 1080,
  s3UploadBucket: 'cella-uploads',
  s3UploadRegion: 'eu-west-1',
  privateCDNUrl: 'https://cdn-priv.cellajs.com',
  publicCDNUrl: 'https://cdn.cellajs.com',

  theme: {
    rose: { primary: '#e11d48' },
    colorDarkBackground: 'hsl(240 10% 9%)',
    strokeWidth: 1.5,
  },

  oauthOptions: ['Github'],

  // Feature flags
  has: {
    chatSupport: true, // TODO: implement
    pwaSupport: true, // TODO: implement
    darkMode: true, // TODO: implement
    notifications: true, // TODO: implement
    userProfiles: true, // TODO: implement
    newsletters: true, // TODO: implement
    signUp: true, // TODO: implement
    waitlist: true, // TODO: implement
  },

  integrations: {
    simpleLocalizeProjectToken: undefined,
    appsignalFrontendKey: undefined,
  },

  description: 'A no-nonsense TypeScript template to build modern web apps. Open source.',
  keywords: 'starter kit, fullstack, monorepo, typescript, hono, honojs, drizzle, shadcn, react, postgres, pwa',

  languages: [
    {
      value: 'en',
      label: 'English',
    },
    {
      value: 'nl',
      label: 'Nederlands',
    },
  ],
  defaultLanguage: 'en',

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
    coordinates: {
      lat: 51.92760809717153,
      lon: 4.47421039909924,
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
