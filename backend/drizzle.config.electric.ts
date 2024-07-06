import { defineConfig } from 'drizzle-kit';
import { env } from './env';

export default defineConfig({
  schema: './src/db/schema-electric/*',
  out: './drizzle-electric',
  dialect: 'postgresql',
  dbCredentials: {
    url: env.ELECTRIC_SYNC_URL ?? '',
  },
});
