/**
 * Integration test setup for CDC + EventBus tests.
 *
 * These tests require:
 * - Real PostgreSQL (not PGlite) with logical replication enabled
 * - DATABASE_URL environment variable pointing to the test database
 *
 * The setup handles:
 * - Database migrations
 * - Starting CDC worker in-process
 * - Starting EventBus listener
 * - Cleanup between tests
 */

import path from 'node:path';
import { sql } from 'drizzle-orm';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { db } from '#/db/db';
import { activitiesTable } from '#/db/schema/activities';
import { emailsTable } from '#/db/schema/emails';
import { membershipsTable } from '#/db/schema/memberships';
import { organizationsTable } from '#/db/schema/organizations';
import { sessionsTable } from '#/db/schema/sessions';
import { tokensTable } from '#/db/schema/tokens';
import { usersTable } from '#/db/schema/users';
import { eventBus } from '#/sync/activity-bus';

/**
 * Run database migrations for integration tests.
 */
export async function migrateDatabase() {
  const migrationsFolder = path.resolve(process.cwd(), 'drizzle');
  await migrate(db, { migrationsFolder });
}

/**
 * Clear test data from database tables.
 * Preserves schema but removes all rows.
 */
export async function clearDatabase() {
  // Delete in order to respect foreign key constraints
  await db.delete(activitiesTable);
  await db.delete(sessionsTable);
  await db.delete(tokensTable);
  await db.delete(membershipsTable);
  await db.delete(emailsTable);
  await db.delete(usersTable);
  await db.delete(organizationsTable);
}

/**
 * Start the EventBus listener.
 * Must be called once before tests that expect to receive events.
 */
export async function startEventBus() {
  await eventBus.start();
}

/**
 * Stop the EventBus and clean up connections.
 */
export async function stopEventBus() {
  await eventBus.stop();
}

/**
 * Helper to wait for an event with timeout.
 * @param eventType - The event type to wait for
 * @param timeoutMs - Maximum time to wait (default 10s)
 */
export function waitForEvent<T>(eventType: Parameters<typeof eventBus.once>[0], timeoutMs = 10000): Promise<T> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error(`Timeout waiting for event: ${eventType}`));
    }, timeoutMs);

    eventBus.once(eventType, (event) => {
      clearTimeout(timeout);
      resolve(event as T);
    });
  });
}

/**
 * Ensure CDC publication and replication slot exist.
 * In CI, these are created by the migration. This is a safety check.
 */
export async function ensureCdcSetup() {
  const CDC_PUBLICATION_NAME = 'cella_development_cdc_pub';
  const CDC_SLOT_NAME = 'cella_development_cdc_slot';

  // Check if publication exists
  const pubResult = await db.execute<{ pubname: string }>(
    sql`SELECT pubname FROM pg_publication WHERE pubname = ${CDC_PUBLICATION_NAME}`,
  );

  if (pubResult.rows.length === 0) {
    throw new Error(`CDC publication '${CDC_PUBLICATION_NAME}' not found. Run migrations first.`);
  }

  // Check if replication slot exists (CDC worker creates this)
  const slotResult = await db.execute<{ slot_name: string }>(
    sql`SELECT slot_name FROM pg_replication_slots WHERE slot_name = ${CDC_SLOT_NAME}`,
  );

  return {
    publicationExists: pubResult.rows.length > 0,
    slotExists: slotResult.rows.length > 0,
  };
}
