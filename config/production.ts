import type { Config } from './default';

export default {
  mode: 'production',
  maintenance: true,

  frontendUrl: 'https://cella-frontend.onrender.com',
  backendUrl: 'https://cella-backend.onrender.com',
  // backendUrl: 'https://cellajs.com/api/v1',
  tusUrl: 'https://cellajs.com/upload',
  // electricUrl: 'https://cellajs.com/electric',
  electricUrl: 'https://cella-electric-sync.onrender.com',
} satisfies Config;
