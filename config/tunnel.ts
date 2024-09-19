import type { Config } from './default';

export default {
  mode: 'tunnel',
  name: 'Cella TUNNEL',
  frontendUrl: 'https://localhost:3003',
  backendUrl: 'http://cella.eu.ngrok.io',
} satisfies Config;
