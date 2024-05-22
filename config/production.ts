import type { Config } from './default';

export default {
  mode: 'production',

  frontendUrl: 'https://cellajs.com',
  backendUrl: 'https://cellajs.com/api/v1',
  tusUrl: 'https://cellajs.com/upload',
  // electricUrl: 'https://cellajs.com/electric',
  electricUrl: 'https://cella-electric-sync-service.onrender.com',
} satisfies Config;
