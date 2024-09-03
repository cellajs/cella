import { config } from 'config';
import { defineConfig } from 'drizzle-kit';
import { env } from './env';

export default defineConfig({
  schema: './src/db/schema/*',
  out: './drizzle',
  dialect: 'postgresql',
  driver: config.mode === 'production' ? undefined : 'pglite',
  dbCredentials: {
    url: config.mode === 'production' ? env.DATABASE_URL : './.db',
  },
});
