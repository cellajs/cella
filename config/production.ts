import type { Config } from './default';

export default {
  mode: 'production',
  maintenance: false,

  googleMapsKey: 'AIzaSyAGx1ZAPoNIu8tUWD4F0D2B3XwAOaSMMH8',

  enabledAuthenticationStrategies: ['password', 'passkey'] as const,
} satisfies Config;
