import { sql } from 'drizzle-orm';
import { migrationDb } from '#/db/db';
import { env } from '#/env';
import { timestamp } from '#/utils/console';
import pc from 'picocolors';

/**
 * Creates database roles for RLS tenant isolation.
 *
 * In production (Scaleway): roles are pre-created as Scaleway-managed users
 * (admin_role, runtime_role, cdc_role). This script only ensures schema grants
 * and role memberships are in place.
 *
 * In development (Docker Compose): roles are created from scratch using
 * passwords extracted from DATABASE_URL and DATABASE_CDC_URL connection strings.
 *
 * Requires DATABASE_ADMIN_URL (superuser/admin) to create or configure roles.
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
 * Only used in development — production roles are Scaleway-managed users.
 */
function buildCreateRolesSql(runtimePassword: string, cdcPassword: string, adminPassword: string): string {
// Escape single quotes for SQL injection safety
const escSql = (s: string) => s.replace(/'/g, "''");

return `
DO $$
BEGIN
-- Check if we can create roles
IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'pg_database_owner') THEN
  RAISE NOTICE 'Role management not available - skipping.';
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

-- admin_role: Migrations, seeds, system admin, CDC worker.
-- Needs BYPASSRLS (for CDC seq stamping under FORCE RLS) and REPLICATION (for the CDC slot).
-- Try with both first; fall back without them on managed providers that forbid these attributes.
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'admin_role') THEN
    CREATE ROLE admin_role WITH LOGIN BYPASSRLS REPLICATION PASSWORD '${escSql(adminPassword)}';
    RAISE NOTICE 'Created role admin_role with BYPASSRLS + REPLICATION';
  ELSE
    ALTER ROLE admin_role WITH BYPASSRLS REPLICATION PASSWORD '${escSql(adminPassword)}';
  END IF;
EXCEPTION WHEN OTHERS THEN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'admin_role') THEN
    CREATE ROLE admin_role WITH LOGIN PASSWORD '${escSql(adminPassword)}';
    RAISE NOTICE 'Created role admin_role without BYPASSRLS/REPLICATION (managed provider)';
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

/**
 * Build SQL to ensure schema grants and role memberships are in place.
 * Used in production when roles already exist as Scaleway-managed users.
 */
function buildEnsureGrantsSql(): string {
return `
DO $$
BEGIN
-- Grant schema access (idempotent)
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

/**
 * Check if the current database user is one of the application roles.
 * If so, roles are Scaleway-managed and we only need to ensure grants.
 */
async function isRoleManagedExternally(): Promise<boolean> {
  const result = await migrationDb!.execute(sql.raw('SELECT CURRENT_USER AS cu'));
  const currentUser = (result.rows[0] as { cu: string }).cu;
  return requiredRoles.includes(currentUser as typeof requiredRoles[number]);
}

export async function createDbRoles() {
  if (!migrationDb) {
    throw new Error('DATABASE_ADMIN_URL required for role setup');
  }

  // If we're connected as one of the application roles, they're managed externally
  // (e.g., Scaleway-managed users). Only ensure grants are in place.
  if (await isRoleManagedExternally()) {
    if (await rolesExist()) {
      console.info(`${timestamp()} ${pc.green('✔')} All roles exist (externally managed), ensuring grants`);
      await migrationDb.execute(sql.raw(buildEnsureGrantsSql()));
      return;
    }
  }

  // Quick pre-check: skip entirely when all roles already exist (common on hot-reload)
  if (await rolesExist()) {
    console.info(`${timestamp()} ${pc.green('✔')} All roles exist, skipping`);
    return;
  }

// Extract passwords from connection strings
const runtime = parseCredentials(env.DATABASE_URL);
const cdcUrl = process.env.DATABASE_CDC_URL;

// For admin_role in dev, use a dedicated env var or fall back to same password as runtime
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