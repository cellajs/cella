import { defineConfig } from 'drizzle-kit';

const devMode = process.env.DEV_MODE || 'core';
const databaseUrl = process.env.DATABASE_URL || '';
// Use admin URL for Drizzle Studio/push so it bypasses RLS (admin_role has BYPASSRLS)
const databaseAdminUrl = process.env.DATABASE_ADMIN_URL || databaseUrl;
const extendConfig = devMode === 'basic' ? { driver: 'pglite' as const } : {};

/**
 * Drizzle configuration.
 * @link https://orm.drizzle.team/docs/drizzle-config-file
 */
export default defineConfig({
  schema: './src/db/schema/index.ts',
  out: './drizzle',
  dialect: 'postgresql',
  casing: 'snake_case',
  entities: {
    roles: true,
  },
  ...extendConfig,
  dbCredentials: {
    url: devMode === 'basic' ? './.db' : databaseAdminUrl,
  },
});
