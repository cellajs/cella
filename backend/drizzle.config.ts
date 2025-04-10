import { defineConfig } from 'drizzle-kit';
import { dbConfig } from './src/db/db';
import { env } from './src/env';

const extendConfig = env.PGLITE ? { driver: 'pglite' } : {};

export default defineConfig({
  schema: './src/db/schema/*',
  out: './drizzle',
  dialect: 'postgresql',
  casing: dbConfig.casing,
  ...extendConfig,
  dbCredentials: {
    url: env.PGLITE ? './.db' : env.DATABASE_URL,
  },
});
