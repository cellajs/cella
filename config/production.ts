import type { Config } from './default';

export default {
  mode: 'production',
  maintenance: false,

  frontendUrl: 'https://cellajs.com',
  backendUrl: 'https://api.cellajs.com',
  tusUrl: 'https://tus.cellajs.com',
  electricUrl: 'https://electric-sync.cellajs.com',

  googleMapsKey: 'AIzaSyAGx1ZAPoNIu8tUWD4F0D2B3XwAOaSMMH8',
} satisfies Config;
