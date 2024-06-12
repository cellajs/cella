import type { Config } from './default';

export default {
  mode: 'production',
  maintenance: false,

  frontendUrl: 'https://cellajs.com',
  backendUrl: 'https://cellajs.com/api/v1',
  tusUrl: 'https://cellajs.com/upload/v1',
  electricUrl: 'https://cellajs.com/electric/v1',

  googleMapsKey: 'AIzaSyAGx1ZAPoNIu8tUWD4F0D2B3XwAOaSMMH8',
} satisfies Config;
