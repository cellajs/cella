/**
 * Integration test setup for CDC + EventBus tests.
 *
 * These tests require:
 * - Real PostgreSQL with logical replication enabled
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
import { baseDb as db, type PgDB } from '#/db/db';
import { activityBus } from '#/lib/activity-bus';
import { activitiesTable } from '#/modules/activities/activities-db';
import { attachmentsTable } from '#/modules/attachment/attachment-db';
import { sessionsTable } from '#/modules/auth/sessions-db';
import { tokensTable } from '#/modules/auth/tokens-db';
import { contextCountersTable } from '#/modules/entities/context-counters-db';
import { membershipsTable } from '#/modules/memberships/memberships-db';
import { organizationsTable } from '#/modules/organization/organization-db';
import { emailsTable } from '#/modules/user/emails-db';
import { usersTable } from '#/modules/user/user-db';

/**
 * Run database migrations for integration tests.
 */
export async function migrateDatabase() {
  const migrationsFolder = path.resolve(process.cwd(), 'drizzle');
  await migrate(db as PgDB, { migrationsFolder });
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
  await db.delete(attachmentsTable);
  await db.delete(contextCountersTable);
  await db.delete(emailsTable);
  await db.delete(usersTable);
  await db.delete(organizationsTable);
}

import type { ActivityEvent } from '#/lib/activity-bus';

/**
 * Helper to wait for an event with timeout.
 * @param eventType - The event type to wait for
 * @param timeoutMs - Maximum time to wait (default 10s)
 */
export function waitForEvent(
  eventType: Parameters<typeof activityBus.once>[0],
  timeoutMs = 10000,
): Promise<ActivityEvent> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error(`Timeout waiting for event: ${eventType}`));
    }, timeoutMs);

    activityBus.once(eventType, (event) => {
      clearTimeout(timeout);
      resolve(event);
    });
  });
}

/**
 * Ensure CDC publication and replication slot exist.
 * In CI, these are created by the migration. This is a safety check.
 */
export async function ensureCdcSetup() {
  const CDC_PUBLICATION_NAME = 'cdc_pub';
  const CDC_SLOT_NAME = 'cdc_slot';

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
