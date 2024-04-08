import type { Config } from './default';

export default {
  mode: 'production',

  has: {
    pwaSupport: true,
    signUp: true,
    onboarding: false,
  },

  frontendUrl: 'https://cellajs.com',
  backendUrl: 'https://cellajs.com/api/v1',
  tusUrl: 'https://cellajs.com/upload',
} satisfies Config;
