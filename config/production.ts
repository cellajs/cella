import type { Config } from './default';

export default {
  mode: 'production',
  maintenance: false,

  has: {
    pwa: true, // Progressive Web App support for preloading static assets and offline support
    sync: false, // Realtime updates and sync using Electric Sync
    registrationEnabled: false, // Allow users to sign up. If disabled, the app is by invitation only
    waitList: true, // Suggest a waitlist for unknown emails when sign up is disabled
  },

  googleMapsKey: 'AIzaSyDMjCpQusdoPWLeD7jxkqAxVgJ8s5xJ3Co',
} satisfies Config;
