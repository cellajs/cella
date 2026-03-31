import { defineConfig } from 'drizzle-kit';

const databaseUrl = process.env.DATABASE_URL || '';
// Use admin URL for Drizzle Studio/push so it bypasses RLS (admin_role has BYPASSRLS)
const databaseAdminUrl = process.env.DATABASE_ADMIN_URL || databaseUrl;

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
  dbCredentials: {
    url: databaseAdminUrl,
  },
});
