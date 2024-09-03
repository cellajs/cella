import { defineConfig } from 'drizzle-kit';
import { env } from './env';

export default defineConfig({
  schema: './src/db/schema/*',
  out: './drizzle',
  dialect: 'postgresql',
  driver: env.PGLITE ? 'pglite' : undefined,
  dbCredentials: {
    url: env.PGLITE ? './.db' : env.DATABASE_URL,
  },
});
