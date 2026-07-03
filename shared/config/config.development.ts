import type { DeepPartial } from '../src/config-builder/types';
import type _default from './config.default';

export default {
  mode: 'development',
  name: 'Cella DEVELOPMENT',
  slug: 'cella-development',

  has: {
    selfRegistration: true,
    waitlist: true,
    chatSupport: false,
  },

  domain: '',
  frontendUrl: 'http://localhost:3000',
  backendUrl: 'http://localhost:4000',
  backendAuthUrl: 'http://localhost:4000/auth',
  yjsUrl: 'http://localhost:4002',
  mcpUrl: 'http://localhost:4003',

  // Shared Cella Maps key is referer-restricted to official domains and rejects localhost.
  // Leave empty locally so the contact-form map gracefully skips rendering. Set your own key to enable.
  googleMapsKey: '',

  s3: {
    publicBucket: 'cella-shared-public',
    privateBucket: 'cella-shared-private',
  },
} satisfies DeepPartial<typeof _default>;
