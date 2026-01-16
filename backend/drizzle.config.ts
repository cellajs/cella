import { defineConfig } from 'drizzle-kit';
import { dbConfig } from './src/db/db';
import { env } from './src/env';

const extendConfig = env.DEV_MODE === 'basic' ? { driver: 'pglite' } : {};

/**
 * Drizzle configuration.
 * @link https://orm.drizzle.team/docs/drizzle-config-file
 */
export default defineConfig({
  schema: './src/db/schema/*',
  out: './drizzle',
  dialect: 'postgresql',
  casing: dbConfig.casing,
  ...extendConfig,
  dbCredentials: {
    url: env.DEV_MODE === 'basic' ? './.db' : env.DATABASE_URL,
  },
});
