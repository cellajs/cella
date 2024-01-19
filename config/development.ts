import { env } from '../env/env';
import { Config } from './default';

export default {
  mode: 'development',
  name: 'Cella DEVELOPMENT',
  debug: true,

  frontendUrl: env.VITE_FRONTEND_URL ?? 'http://localhost:3000',
  backendUrl: env.VITE_BACKEND_URL ?? 'http://localhost:4000',
  tusUrl: env.VITE_TUS_URL ?? 'http://localhost:1080',

  newsletterWebhookUrl: 'https://cella.app.n8n.cloud/webhook-test/subscription?',
  contactWebhookUrl: 'https://cella.app.n8n.cloud/webhook-test/contact?',
} satisfies Config;
