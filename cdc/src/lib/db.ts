import { type DrizzleConfig } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import { env } from '../env';

/**
 * Database configuration for CDC Worker.
 */
const dbConfig: DrizzleConfig = {
  logger: env.DEBUG,
};

// Scaleway private DB endpoints use self-signed certificates.
const sslConfig = env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : undefined;

/**
 * CDC database client (cdc_role).
 *
 * This connection uses a restricted role that should only:
 * - Use REPLICATION for logical replication stream
 * - INSERT into activities table (append-only audit log)
 * - SELECT, INSERT, UPDATE on counters (sequence tracking)
 * - SELECT from tenants, organizations (for FK validation)
 *
 * The cdc_role cannot UPDATE or DELETE activities, enforcing
 * the append-only nature of the audit log at the database level.
 */
export const cdcDb = drizzle({
  connection: { connectionString: env.DATABASE_CDC_URL, connectionTimeoutMillis: 10_000, max: 20, ssl: sslConfig },
  ...dbConfig,
});
