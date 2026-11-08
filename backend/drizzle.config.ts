import { existsSync } from 'node:fs';
import { defineConfig } from 'drizzle-kit';
import { localDatabaseUrl } from 'shared/local-database';

// drizzle-kit evaluates this file in its own process, from backend/, so load the repo's .env here; variables already set win.
if (existsSync('../.env')) process.loadEnvFile('../.env');

// Drizzle Studio and push use the admin URL, which RLS does not restrict: the dev container's superuser unless the env names one.
const databaseAdminUrl = process.env.DATABASE_ADMIN_URL || process.env.DATABASE_URL || localDatabaseUrl('dev', 'postgres');

/**
 * Drizzle configuration.
 * @link https://orm.drizzle.team/docs/drizzle-config-file
 */
export default defineConfig({
  // Schemas are discovered by location, not via a barrel file. Every table lives
  // alongside its module as `*-db.ts`. drizzle-kit statically scans this glob, so new
  // tables self-register simply by existing (apps add their tables as `*-db.ts` too).
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
