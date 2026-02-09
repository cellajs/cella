import { migrationDb } from '#/db/db';
import { env } from '#/env';
import pc from 'picocolors';

/**
 * Creates database roles for RLS tenant isolation (dev only).
 * In production, roles should be pre-created via infrastructure (Terraform/Pulumi).
 * This script is idempotent - skips if roles already exist.
 */

const setupRolesSql = `
DO $$
BEGIN
  -- Check if we can create roles (not available in PGlite)
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'pg_database_owner') THEN
    RAISE NOTICE 'Role management not available (e.g., PGlite) - skipping.';
    RETURN;
  END IF;

  -- runtime_role: Normal authenticated requests, subject to RLS
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'runtime_role') THEN
    CREATE ROLE runtime_role WITH LOGIN PASSWORD 'dev_password';
    RAISE NOTICE 'Created role runtime_role';
  END IF;

  -- cdc_role: CDC worker, REPLICATION + INSERT on activities only
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'cdc_role') THEN
    CREATE ROLE cdc_role WITH LOGIN REPLICATION PASSWORD 'dev_password';
    RAISE NOTICE 'Created role cdc_role';
  END IF;

  -- admin_role: Migrations, seeds, system admin, BYPASSRLS
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'admin_role') THEN
    CREATE ROLE admin_role WITH LOGIN BYPASSRLS PASSWORD 'dev_password';
    RAISE NOTICE 'Created role admin_role';
  END IF;

  -- Grant schema access
  GRANT USAGE ON SCHEMA public TO runtime_role;
  GRANT USAGE ON SCHEMA public TO cdc_role;
  GRANT ALL ON SCHEMA public TO admin_role;
END $$;
`;

export async function setupRoles() {
  if (env.DEV_MODE === 'basic') {
    // PGlite doesn't support roles
    return;
  }

  if (!migrationDb) {
    console.error('DATABASE_ADMIN_URL required for role setup');
    process.exit(1);
  }

  try {
    await migrationDb.execute(setupRolesSql);
    console.info(`${pc.green('✔')} Database roles configured`);
  } catch (error) {
    console.error('Failed to setup roles:', error);
    process.exit(1);
  }
}

// Run if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  await setupRoles();
  process.exit(0);
}
