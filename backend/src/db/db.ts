import type { PGlite } from '@electric-sql/pglite';
import { type DrizzleConfig } from 'drizzle-orm';
import { type NodePgClient, drizzle as pgDrizzle } from 'drizzle-orm/node-postgres';
import type { PgAsyncDatabase } from 'drizzle-orm/pg-core';
import { drizzle as pgliteDrizzle } from 'drizzle-orm/pglite';
import { appConfig } from 'shared';
import { env } from '../env';

/**
 * Database configuration for Drizzle ORM.
 */
export const dbConfig: DrizzleConfig = {
  logger: appConfig.debug,
  casing: 'snake_case',
};

/**
 * Migration configuration for Drizzle ORM.
 */
export const migrateConfig = { migrationsFolder: 'drizzle', migrationsSchema: 'drizzle-backend' };

// biome-ignore lint/suspicious/noExplicitAny: Can be two different types
type DB = PgAsyncDatabase<any> & { $client: PGlite | NodePgClient };

/** Helper to create a Postgres connection with standard config. */
const createPgConnection = (connectionString: string) =>
  pgDrizzle({
    connection: { connectionString, connectionTimeoutMillis: 10000 },
    ...dbConfig,
  }) as DB;

/**
 * Initialize database connections based on DEV_MODE.
 *
 * - DEV_MODE=none: No connections (OpenAPI generation, basic tests)
 * - DEV_MODE=basic: PGlite only (single connection)
 * - Otherwise: Full Postgres with role-specific connections
 */
const initConnections = (): { db: DB; migrationDb: DB | undefined; adminDb: DB | undefined } => {
  if (env.DEV_MODE === 'none') {
    return { db: {} as DB, migrationDb: undefined, adminDb: undefined };
  }

  if (env.DEV_MODE === 'basic') {
    return {
      db: pgliteDrizzle({ connection: { dataDir: './.db' }, ...dbConfig }) as DB,
      migrationDb: undefined,
      adminDb: undefined, // PGlite doesn't have RLS, no bypass needed
    };
  }

  return {
    db: createPgConnection(env.DATABASE_URL),
    migrationDb: createPgConnection(env.DATABASE_ADMIN_URL),
    adminDb: createPgConnection(env.DATABASE_ADMIN_URL),
  };
};

const connections = initConnections();

/**
 * Primary database client (runtime_role, subject to RLS).
 * Public access is handled via session variables and RLS policies, not a separate connection.
 */
export const db: DB = connections.db;

/**
 * Admin database connection for migrations only.
 *
 * ⚠️ UNSAFE: Bypasses all RLS policies. Only use for:
 * - Migrations (DDL requires superuser)
 * - Seeds (initial data setup)
 *
 * Undefined in DEV_MODE=none or DEV_MODE=basic.
 */
export const migrationDb: DB | undefined = connections.migrationDb;

/**
 * Admin database connection that bypasses RLS (admin_role, BYPASSRLS).
 *
 * ⚠️ UNSAFE: Bypasses ALL RLS policies. Only use for:
 * - System admin operations on entities they don't have membership in
 * - Cross-tenant operations that require admin privileges
 *
 * The 'unsafe' prefix makes it greppable for security audits.
 * Undefined in DEV_MODE=none or DEV_MODE=basic (PGlite has no RLS).
 */
export const unsafeInternalAdminDb: DB | undefined = connections.adminDb;
