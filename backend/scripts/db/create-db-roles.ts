import { sql } from 'drizzle-orm';
import { migrationDb } from '#/db/db';
import { env } from '#/env';
import pc from 'picocolors';

/**
 * Creates database roles for RLS tenant isolation.
 * Passwords are extracted from DATABASE_URL and DATABASE_CDC_URL connection strings.
 * Works in all environments (dev + production). Idempotent — skips existing roles.
 *
 * Requires DATABASE_ADMIN_URL (superuser) to create roles.
 * In Neon, this should be the neondb_owner connection string.
 */

/**
 * Parse username and password from a PostgreSQL connection string.
 * Supports both `postgres://user:pass@host/db` and `postgresql://user:pass@host/db`.
 */
function parseCredentials(connectionString: string): { username: string; password: string } {
const url = new URL(connectionString);
return {
  username: decodeURIComponent(url.username),
  password: decodeURIComponent(url.password),
};
}

/**
 * Build idempotent SQL to create roles with passwords from connection strings.
 * Neon doesn't support REPLICATION on custom roles, so we skip it for cdc_role
 * and let Neon handle logical replication at the project level.
 */
function buildCreateRolesSql(runtimePassword: string, cdcPassword: string, adminPassword: string): string {
// Escape single quotes for SQL injection safety
const escSql = (s: string) => s.replace(/'/g, "''");

return `
DO $$
BEGIN
-- Check if we can create roles (not available in PGlite)
IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'pg_database_owner') THEN
  RAISE NOTICE 'Role management not available (e.g., PGlite) - skipping.';
  RETURN;
END IF;

-- runtime_role: Normal authenticated requests, subject to RLS
IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'runtime_role') THEN
  CREATE ROLE runtime_role WITH LOGIN PASSWORD '${escSql(runtimePassword)}';
  RAISE NOTICE 'Created role runtime_role';
ELSE
  ALTER ROLE runtime_role WITH PASSWORD '${escSql(runtimePassword)}';
END IF;

  -- cdc_role: CDC worker, INSERT on activities only + REPLICATION for logical replication
  BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'cdc_role') THEN
      CREATE ROLE cdc_role WITH LOGIN REPLICATION PASSWORD '${escSql(cdcPassword)}';
      RAISE NOTICE 'Created role cdc_role with REPLICATION';
    ELSE
      ALTER ROLE cdc_role WITH REPLICATION PASSWORD '${escSql(cdcPassword)}';
    END IF;
  EXCEPTION WHEN OTHERS THEN
    -- Some managed providers (e.g., Neon, Scaleway) don't allow REPLICATION on custom roles
    -- or return non-standard error codes (Scaleway returns XX000 instead of 42501).
    -- Fall back to creating without REPLICATION; the CDC URL must then use a role that has it.
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'cdc_role') THEN
      CREATE ROLE cdc_role WITH LOGIN PASSWORD '${escSql(cdcPassword)}';
      RAISE NOTICE 'Created role cdc_role without REPLICATION (managed provider)';
    ELSE
      ALTER ROLE cdc_role WITH PASSWORD '${escSql(cdcPassword)}';
    END IF;
  END;

-- admin_role: Migrations, seeds, system admin
-- Try BYPASSRLS first, fall back without it (Scaleway doesn't allow BYPASSRLS on custom roles)
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'admin_role') THEN
    CREATE ROLE admin_role WITH LOGIN BYPASSRLS PASSWORD '${escSql(adminPassword)}';
    RAISE NOTICE 'Created role admin_role with BYPASSRLS';
  ELSE
    ALTER ROLE admin_role WITH BYPASSRLS PASSWORD '${escSql(adminPassword)}';
  END IF;
EXCEPTION WHEN OTHERS THEN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'admin_role') THEN
    CREATE ROLE admin_role WITH LOGIN PASSWORD '${escSql(adminPassword)}';
    RAISE NOTICE 'Created role admin_role without BYPASSRLS (managed provider)';
  ELSE
    ALTER ROLE admin_role WITH PASSWORD '${escSql(adminPassword)}';
  END IF;
END;

-- Grant schema access
GRANT USAGE ON SCHEMA public TO runtime_role;
GRANT USAGE ON SCHEMA public TO cdc_role;
GRANT ALL ON SCHEMA public TO admin_role;

-- Grant role membership to current user so migrations can ALTER TABLE ... OWNER TO admin_role
BEGIN
  GRANT runtime_role TO CURRENT_USER;
  GRANT cdc_role TO CURRENT_USER;
  GRANT admin_role TO CURRENT_USER;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'Could not grant roles to current user (may already be granted or not supported)';
END;

END $$;
`;
}

const requiredRoles = ['runtime_role', 'cdc_role', 'admin_role'] as const;

/**
 * Fast read-only check: do all required roles already exist?
 * Returns true if setup can be skipped (avoids catalog writes on hot-reload).
 */
async function rolesExist(): Promise<boolean> {
const result = await migrationDb!.execute(
  sql.raw(`SELECT COUNT(*)::int AS cnt FROM pg_roles WHERE rolname IN ('${requiredRoles.join("','")}')`),
);
return (result.rows[0] as { cnt: number }).cnt === requiredRoles.length;
}

export async function createDbRoles() {
if (env.DEV_MODE === 'basic') {
  // PGlite doesn't support roles
  return;
}

  if (!migrationDb) {
    throw new Error('DATABASE_ADMIN_URL required for role setup');
  }

  // Quick pre-check: skip entirely when all roles already exist (common on hot-reload)
  if (await rolesExist()) {
    console.info(`${pc.green('✔')} All roles exist, skipping`);
    return;
  }

// Extract passwords from connection strings
const runtime = parseCredentials(env.DATABASE_URL);
const cdcUrl = process.env.DATABASE_CDC_URL;

// TODO review: For admin_role, use a dedicated env var or fall back to same password as runtime
const adminPassword = process.env.DATABASE_ADMIN_ROLE_PASSWORD ?? runtime.password;

// CDC URL is optional — default to runtime password if not set (e.g., quick/core modes without CDC)
const cdcPassword = cdcUrl ? parseCredentials(cdcUrl).password : runtime.password;

const createRolesSql = buildCreateRolesSql(runtime.password, cdcPassword, adminPassword);

  try {
    await migrationDb.execute(sql.raw(createRolesSql));
    console.info(`${pc.green('✔')} Database roles configured`);
  } catch (error) {
    throw new Error(`${pc.red('✖')} Failed to setup roles: ${error}`);
  }
}

// To run directly: tsx scripts/db/create-db-roles.ts