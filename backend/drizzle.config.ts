import { defineConfig } from 'drizzle-kit';

const databaseUrl = process.env.DATABASE_URL || '';
// Use admin URL for Drizzle Studio/push so it bypasses RLS (admin_role has BYPASSRLS)
const databaseAdminUrl = process.env.DATABASE_ADMIN_URL || databaseUrl;

/**
 * Drizzle configuration.
 * @link https://orm.drizzle.team/docs/drizzle-config-file
 */
export default defineConfig({
  // Schemas are discovered by location, not via a barrel file. Every table lives
  // alongside its module as `*-db.ts`. drizzle-kit statically scans this glob, so new
  // tables self-register simply by existing (forks add app tables as `*-db.ts` too).
  schema: ['./src/modules/**/*-db.ts'],
  out: './drizzle',
  dialect: 'postgresql',
  // Roles are provisioned outside drizzle (see scripts/db/create-db-roles.ts).
  // drizzle-kit defaults to not managing roles (entities.roles = false), so no
  // explicit exclusion list is needed.
  dbCredentials: {
    url: databaseAdminUrl,
  },
});
