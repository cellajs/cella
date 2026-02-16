import { type DrizzleConfig } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import { env } from './env';

/**
 * Database configuration for CDC Worker.
 */
const dbConfig: DrizzleConfig = {
  logger: env.DEBUG,
  casing: 'snake_case',
};

/**
 * CDC database client (cdc_role).
 *
 * This connection uses a restricted role that can only:
 * - Use REPLICATION for logical replication stream
 * - INSERT into activities table (append-only audit log)
 * - SELECT, INSERT, UPDATE on counters (sequence tracking)
 * - SELECT from tenants, organizations (for FK validation)
 *
 * The cdc_role cannot UPDATE or DELETE activities, enforcing
 * the append-only nature of the audit log at the database level.
 */
export const cdcDb = drizzle({
  connection: { connectionString: env.DATABASE_CDC_URL, connectionTimeoutMillis: 10000 },
  ...dbConfig,
});
