import { Config } from './default';

export default {
  mode: 'development',
  name: 'Cella DEVELOPMENT',
  debug: true,

  senderIsReceiver: true,

  frontendUrl: 'http://localhost:3000',
  backendUrl: 'http://localhost:4000',
  tusUrl: 'http://localhost:1080',

  newsletterWebhookUrl: 'https://cella.app.n8n.cloud/webhook-test/subscription?',
  contactWebhookUrl: 'https://cella.app.n8n.cloud/webhook-test/contact?',
} satisfies Config;
