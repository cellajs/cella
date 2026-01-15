import { sql } from 'drizzle-orm';
import { LogicalReplicationService, PgoutputPlugin } from 'pg-logical-replication';
import { db } from '#/db/db';
import { activitiesTable } from '#/db/schema/activities';
import { env } from '#/env';
import { logEvent } from '#/utils/logger';
import { CDC_PUBLICATION_NAME, CDC_SLOT_NAME } from './constants';
import { processMessage } from './process-message';
import { appConfig } from 'config';

/**
 * Ensure the replication slot exists, creating it if necessary.
 * This must be done outside of a transaction, so we do it in the worker.
 */
async function ensureReplicationSlot(): Promise<void> {
  const result = await db.execute<{ slot_name: string }>(
    sql`SELECT slot_name FROM pg_replication_slots WHERE slot_name = ${CDC_SLOT_NAME}`,
  );

  if (result.rows.length === 0) {
    logEvent('info', 'Creating replication slot...', { slotName: CDC_SLOT_NAME });
    await db.execute(sql`SELECT pg_create_logical_replication_slot(${CDC_SLOT_NAME}, 'pgoutput')`);
    logEvent('info', 'Replication slot created', { slotName: CDC_SLOT_NAME });
  } else {
    logEvent('info', 'Replication slot already exists', { slotName: CDC_SLOT_NAME });
  }
}

/**
 * CDC Worker that subscribes to PostgreSQL logical replication
 * and writes activities to the activities table.
 */
export async function startCdcWorker() {
  logEvent('info', 'CDC worker starting...', { publicationName: CDC_PUBLICATION_NAME, slotName: CDC_SLOT_NAME });

  // Ensure the replication slot exists before subscribing
  await ensureReplicationSlot();

  // Build replication connection string (add replication=database if not present)
  const replicationUrl = new URL(env.DATABASE_URL);
  if (!replicationUrl.searchParams.has('replication')) {
    replicationUrl.searchParams.set('replication', 'database');
  }

  const service = new LogicalReplicationService(
    {
      connectionString: replicationUrl.toString(),
      application_name: `${appConfig.slug}-cdc-worker`,
    },
    {
      acknowledge: { auto: true, timeoutSeconds: 10 },
    },
  );

  const plugin = new PgoutputPlugin({
    protoVersion: 1,
    publicationNames: [CDC_PUBLICATION_NAME],
  });

  // Handle incoming replication messages
  service.on('data', async (lsn: string, message: unknown) => {
    try {
      // Debug: log the raw message type
      const msg = message as { tag?: string; relation?: { name?: string } };
      logEvent('debug', 'CDC message received', {
        lsn,
        tag: msg.tag,
        table: msg.relation?.name,
      });

      // Process the message and create an activity if applicable
      const activity = processMessage(message as Parameters<typeof processMessage>[0]);

      if (activity) {
        await db.insert(activitiesTable).values(activity);
        logEvent('info', 'Activity created from CDC', {
          type: activity.type,
          entityId: activity.entityId,
          lsn,
        });
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      const errorStack = error instanceof Error ? error.stack : undefined;
      logEvent('error', 'Error processing CDC message', { error: errorMessage, stack: errorStack, lsn });
    }
  });

  // Handle errors
  service.on('error', (error: Error) => {
    logEvent('error', 'CDC replication error', { error: error.message });
  });

  // Subscribe with reconnection loop
  async function subscribeWithRetry() {
    while (true) {
      try {
        logEvent('info', 'CDC worker subscribing to replication slot...');
        await service.subscribe(plugin, CDC_SLOT_NAME);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        logEvent('warn', 'CDC subscription error, retrying in 5s...', { error: errorMessage });
        await new Promise((resolve) => setTimeout(resolve, 5000));
      }
    }
  }

  await subscribeWithRetry();
}

/**
 * Stop the CDC worker gracefully.
 */
export async function stopCdcWorker() {
  logEvent('info', 'CDC worker stopping...');
  // The service will be garbage collected when the process exits
}
