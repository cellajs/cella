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

import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import path from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import { sql } from 'drizzle-orm';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { baseDb as db, type PgDB } from '#/db/db';
import { activityBus } from '#/lib/activity-bus';
import { cdcWebSocketServer } from '#/lib/cdc-websocket';
import { activitiesTable } from '#/modules/activities/activities-db';
import { attachmentsTable } from '#/modules/attachment/attachment-db';
import { sessionsTable } from '#/modules/auth/sessions-db';
import { tokensTable } from '#/modules/auth/tokens-db';
import { contextCountersTable } from '#/modules/entities/context-counters-db';
import { membershipsTable } from '#/modules/memberships/memberships-db';
import { organizationsTable } from '#/modules/organization/organization-db';
import { emailsTable } from '#/modules/user/emails-db';
import { usersTable } from '#/modules/user/user-db';
import { testDatabaseUrl } from '../../../test-db-config';

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

interface CdcTestHarness {
  stop(): Promise<void>;
}

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

/** Poll a predicate until it returns true or the timeout expires. */
export async function waitFor(
  predicate: () => boolean | Promise<boolean>,
  timeoutMs: number,
  label: string,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await predicate()) return;
    await sleep(50);
  }
  throw new Error(`Timeout waiting for: ${label}`);
}

/**
 * Host the backend's real `/internal/cdc` WebSocket endpoint on an ephemeral
 * local port, standing in for the deployed backend the CDC worker would dial.
 * Returns the dial URL and a closer.
 */
async function startInternalCdcWsServer(): Promise<{ url: string; close(): Promise<void> }> {
  const server = createServer((_req, res) => {
    res.writeHead(404);
    res.end();
  });
  cdcWebSocketServer.attachToServer(server as unknown as Server);

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));

  const address = server.address() as AddressInfo | null;
  if (!address) {
    throw new Error('Failed to determine test CDC WebSocket server address');
  }

  return {
    url: `ws://127.0.0.1:${address.port}/internal/cdc`,
    async close() {
      cdcWebSocketServer.close();
      await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
    },
  };
}

/**
 * Start the CDC worker pipeline in-process so backend full-flow tests do not
 * depend on an externally running worker. Hosts the real `/internal/cdc`
 * endpoint locally, then delegates pipeline bring-up/teardown to the shared CDC
 * harness (the same one the CDC package tests use).
 */
export async function startInProcessCdcWorker(): Promise<CdcTestHarness> {
  process.env.DATABASE_CDC_URL = testDatabaseUrl;
  process.env.CDC_SECRET = process.env.CDC_SECRET ?? 'test-cdc-secret-min16chars';
  process.env.CDC_SLOT_NAME = process.env.CDC_SLOT_NAME ?? `cdc_slot_backend_${process.pid}_${Date.now()}`;

  const wsServer = await startInternalCdcWsServer();
  process.env.API_WS_URL = wsServer.url;

  // Import after env is set: CDC modules parse env at load time.
  const { startCdcPipeline } = await import('../../../cdc/src/tests/integration/pipeline-harness');
  const pipeline = await startCdcPipeline();

  return {
    async stop() {
      await pipeline.stop();
      await wsServer.close();
    },
  };
}

/**
 * Ensure CDC publication and replication slot exist.
 * In CI, these are created by the migration. This is a safety check.
 */
export async function ensureCdcSetup() {
  const CDC_PUBLICATION_NAME = 'cdc_pub';
  const CDC_SLOT_NAME = process.env.CDC_SLOT_NAME ?? 'cdc_slot';

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
