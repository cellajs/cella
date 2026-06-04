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
 * CDC database client.
 *
 * Connects via DATABASE_CDC_URL, which uses admin_role: Scaleway only grants the
 * REPLICATION attribute (required to open a logical replication slot) to admin
 * users, so the worker cannot run under a lesser role. Append-only behaviour on
 * the activities table is enforced by the immutability triggers, not by role
 * privileges.
 */
export const cdcDb = drizzle({
  connection: { connectionString: env.DATABASE_CDC_URL, connectionTimeoutMillis: 10_000, max: 20, ssl: sslConfig },
  ...dbConfig,
});
