import { once } from 'node:events';
import type { AddressInfo } from 'node:net';
import path from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import { sql } from 'drizzle-orm';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { testDatabaseUrl } from 'shared/test-db';
import { baseDb as db, type PgDB } from '#/db/db';
import { activityBus } from '#/lib/activity-bus';
import { serveInternal } from '#/lib/listeners';
import { activitiesTable } from '#/modules/activities/activities-db';
import { attachmentsTable } from '#/modules/attachment/attachment-db';
import { sessionsTable } from '#/modules/auth/sessions-db';
import { tokensTable } from '#/modules/auth/tokens-db';
import { channelCountersTable } from '#/modules/entities/channel-counters-db';
import { membershipsTable } from '#/modules/memberships/memberships-db';
import { organizationsTable } from '#/modules/organization/organization-db';
import { emailsTable } from '#/modules/user/emails-db';
import { usersTable } from '#/modules/user/user-db';

export async function migrateDatabase() {
  const migrationsFolder = path.resolve(process.cwd(), 'drizzle');
  await migrate(db as PgDB, { migrationsFolder });
}

/**
 * Delete order respects the foreign key constraints. One transaction: the organization-keeps-an-admin check is deferred to
 * commit, when the organizations are gone too.
 */
export async function clearDatabase() {
  await db.transaction(async (tx) => {
    await tx.delete(activitiesTable);
    await tx.delete(sessionsTable);
    await tx.delete(tokensTable);
    await tx.delete(membershipsTable);
    await tx.delete(attachmentsTable);
    await tx.delete(channelCountersTable);
    await tx.delete(emailsTable);
    await tx.delete(usersTable);
    await tx.delete(organizationsTable);
  });
}

import type { ActivityEvent } from '#/lib/activity-bus';

interface CdcTestHarness {
  stop(): Promise<void>;
}

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

/** Host the real internal listener on an ephemeral local port for the CDC worker to dial. */
async function startInternalCdcWsServer(): Promise<{ url: string; close(): Promise<void> }> {
  const listener = serveInternal({ port: 0, hostname: '127.0.0.1' });
  await once(listener.server, 'listening');

  const address = listener.server.address() as AddressInfo | null;
  if (!address) {
    throw new Error('Failed to determine test CDC WebSocket server address');
  }

  return {
    url: `ws://127.0.0.1:${address.port}/internal/cdc`,
    async close() {
      const closed = once(listener.server, 'close');
      listener.close();
      await closed;
    },
  };
}

/** Run the CDC worker pipeline in-process, so full-flow tests need no external worker. */
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

/** The migration creates the publication and slot in CI; this only verifies they exist. */
export async function ensureCdcSetup() {
  const CDC_PUBLICATION_NAME = 'cdc_pub';
  const CDC_SLOT_NAME = process.env.CDC_SLOT_NAME ?? 'cdc_slot';

  const pubResult = await db.execute<{ pubname: string }>(
    sql`SELECT pubname FROM pg_publication WHERE pubname = ${CDC_PUBLICATION_NAME}`,
  );

  if (pubResult.rows.length === 0) {
    throw new Error(`CDC publication '${CDC_PUBLICATION_NAME}' not found. Run migrations first.`);
  }

  // The CDC worker creates the replication slot.
  const slotResult = await db.execute<{ slot_name: string }>(
    sql`SELECT slot_name FROM pg_replication_slots WHERE slot_name = ${CDC_SLOT_NAME}`,
  );

  return {
    publicationExists: pubResult.rows.length > 0,
    slotExists: slotResult.rows.length > 0,
  };
}
