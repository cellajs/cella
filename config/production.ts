import type { Config } from './default';

export default {
  mode: 'production',
  maintenance: false,

  has: {
    pwa: true, // Progressive Web App support for preloading static assets and offline support
    sync: false, // Realtime updates and sync using Electric Sync
    registrationEnabled: true, // Allow users to sign up. If disabled, the app is by invitation only
    waitList: false, // Suggest a waitlist for unknown emails when sign up is disabled
  },

  googleMapsKey: 'AIzaSyAGx1ZAPoNIu8tUWD4F0D2B3XwAOaSMMH8',
} satisfies Config;
