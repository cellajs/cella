import { env } from '../env';
import { Config } from './default';

export default {
  mode: 'production',
  name: 'Cella',
  frontendUrl: env.VITE_FRONTEND_URL ?? 'https://cellajs.com',
  backendUrl: env.VITE_BACKEND_URL ?? 'https://cellajs.com/api/v1',
  tusUrl: env.VITE_TUS_URL ?? 'https://cellajs.com/upload',
} satisfies Config;
