import { LogicalReplicationService, type Pgoutput, PgoutputPlugin } from 'pg-logical-replication';
import { sql } from 'drizzle-orm';
import { appConfig } from 'shared';

import { CDC_PUBLICATION_NAME, CDC_SLOT_NAME, RESOURCE_LIMITS } from '../constants';
import { buildVerifiedSsl, cdcDb, stripSslParams } from '../lib/db';
import { env } from '../env';
import { log } from '../lib/pino';

import { replicationState } from '../services/replication-state';
import { wsClient } from '../network/websocket-client';

import { handleDataMessage } from './handle-message';
import { isStalePublicationError } from './replication-errors';

const { reconnection, slotTakeover } = RESOURCE_LIMITS;

// Replication service setup

/**
 * Build the replication connection URL from the CDC database URL.
 *
 * Strips the `sslmode=require&uselibpqcompat=true` params so the explicit,
 * CA-verified `ssl` config (see {@link createReplicationService}) is used and
 * prevents pg's unverified libpq-compat downgrade.
 */
function buildReplicationUrl(): URL {
  const replicationUrl = new URL(stripSslParams(env.DATABASE_CDC_URL));
  if (!replicationUrl.searchParams.has('replication')) {
    replicationUrl.searchParams.set('replication', 'database');
  }
  return replicationUrl;
}

/**
 * Create and configure the logical replication service.
 */
export function createReplicationService(): LogicalReplicationService {
  const connectionUrl = buildReplicationUrl();
  const service = new LogicalReplicationService(
    {
      connectionString: connectionUrl.toString(),
      application_name: `${appConfig.slug}-cdc-worker`,
// Match the query connection's verified TLS for full-row replication data.
// Certificate identity is pinned to the dialed host in production.
      ssl: buildVerifiedSsl(env.DATABASE_CDC_URL),
    },
    {
      acknowledge: { auto: false, timeoutSeconds: 0 },
      flowControl: { enabled: true },
    },
  );

  service.on('data', (lsn: string, message: unknown) => {
    handleDataMessage(lsn, message as Pgoutput.Message);
  });

  service.on('error', (error: Error) => {
    log.error(`CDC replication error`, { err: error });
  });

  service.on('heartbeat', async (lsn: string, _timestamp: number, shouldRespond: boolean) => {
    log.trace(`Heartbeat received`, { lsn, shouldRespond, wsConnected: wsClient.isConnected() });
    if (shouldRespond) {
      await service.acknowledge(lsn);
    }
  });

  return service;
}

// Slot management

/**
 * Ensure the replication slot exists, creating it if necessary.
 */
export async function ensureReplicationSlot(): Promise<void> {
  try {
    const slotCheck = await cdcDb.execute(
      sql`SELECT 1 FROM pg_replication_slots WHERE slot_name = ${CDC_SLOT_NAME}`,
    );
    if (slotCheck.rows.length === 0) {
      log.info(`Replication slot '${CDC_SLOT_NAME}' not found, creating...`);
      await cdcDb.execute(sql`SELECT pg_create_logical_replication_slot(${CDC_SLOT_NAME}, 'pgoutput')`);
      log.info(`Replication slot '${CDC_SLOT_NAME}' created`);
    }
  } catch (error) {
    log.warn('Could not verify/create replication slot', { err: error, slotName: CDC_SLOT_NAME });
  }
}

/**
 * Limits stale-slot recovery to one attempt per worker lifetime.
 * This prevents the retry loop from repeatedly discarding WAL; restarting arms another attempt.
 */
let slotRecreationAttempted = false;

/**
 * Recreates a slot whose WAL start predates its publication, after terminating its sender.
 * The sync sequence recovers skipped WAL. This runs once per worker and only after confirming
 * the publication exists, distinguishing a stale slot from a missing publication.
 * Failures are logged for the normal retry loop.
 */
async function recreateReplicationSlot(): Promise<void> {
  if (slotRecreationAttempted) {
    log.warn(`Skipping slot recreation for '${CDC_SLOT_NAME}': already attempted once this worker lifetime`);
    return;
  }
  try {
    const publicationCheck = await cdcDb.execute(
      sql`SELECT 1 FROM pg_publication WHERE pubname = ${CDC_PUBLICATION_NAME}`,
    );
    if (publicationCheck.rows.length === 0) {
      log.warn(
        `Publication '${CDC_PUBLICATION_NAME}' does not exist; not recreating slot '${CDC_SLOT_NAME}'. Backing off until it appears.`,
      );
      return;
    }

    slotRecreationAttempted = true;
    log.warn(`Recreating replication slot '${CDC_SLOT_NAME}' to clear a stale start position`);
    await cdcDb.execute(sql`
      SELECT pg_terminate_backend(active_pid) FROM pg_replication_slots
      WHERE slot_name = ${CDC_SLOT_NAME} AND active_pid IS NOT NULL
    `);
    await cdcDb.execute(sql`
      SELECT pg_drop_replication_slot(${CDC_SLOT_NAME})
      WHERE EXISTS (SELECT 1 FROM pg_replication_slots WHERE slot_name = ${CDC_SLOT_NAME})
    `);
    await cdcDb.execute(sql`SELECT pg_create_logical_replication_slot(${CDC_SLOT_NAME}, 'pgoutput')`);
    log.info(`Replication slot '${CDC_SLOT_NAME}' recreated at current WAL position`);
  } catch (error) {
    log.warn('Could not recreate replication slot', { err: error, slotName: CDC_SLOT_NAME });
  }
}

/** Postgres `object_in_use`: subscribe() lost the race for an actively held slot. */
const PG_OBJECT_IN_USE = '55006';

/**
 * Describes the worker connection holding the replication slot for actionable diagnostics.
 * Returns null when free or unavailable so diagnostic lookup never breaks retries.
 */
async function describeSlotHolder(): Promise<Record<string, unknown> | null> {
  try {
    const result = await cdcDb.execute(sql`
      SELECT a.pid, a.application_name, a.client_addr::text AS client_addr, a.backend_start::text AS backend_start
      FROM pg_replication_slots s
      JOIN pg_stat_activity a ON a.pid = s.active_pid
      WHERE s.slot_name = ${CDC_SLOT_NAME}
    `);
    return result.rows[0] ?? null;
  } catch {
    return null;
  }
}

// Backpressure

/**
 * Wire up WebSocket callbacks for replication backpressure.
 * Pauses acknowledgment when WebSocket is disconnected.
 */
export function setupBackpressure(): void {
  wsClient.setCallbacks({
    onConnect: () => {
      const wasPaused = replicationState.status === 'paused';
      if (wasPaused) {
        log.info(`WebSocket reconnected - resuming replication acknowledgment`);
      } else {
        log.info(`WebSocket connected - resuming replication acknowledgment`);
      }
      replicationState.markActive();
    },
    onDisconnect: () => {
      if (!wsClient.inGracePeriod()) {
        log.warn(`WebSocket disconnected - pausing replication acknowledgment`);
      }
      replicationState.markPaused();
    },
  });
}

// Subscription loop

/**
 * Subscribe to the replication slot with automatic reconnection.
 */
export async function subscribeWithReconnect(service: LogicalReplicationService, plugin: PgoutputPlugin): Promise<never> {
  // Retry quickly during a rolling-deploy slot handoff, then use the normal cadence.
  // This keeps takeover fast without hammering Postgres during sustained contention.
  let attempt = 0;
  while (true) {
    try {
      // Ensure on every attempt because dropping a database removes its slots, and a worker
      // cannot create a slot while the database is unreachable. This costs one catalog SELECT
      // per subscription attempt and is a no-op when another worker already holds the slot.
      await ensureReplicationSlot();

      log.info(`Subscribing to replication slot...`);
      replicationState.status = wsClient.isConnected() ? 'active' : 'paused';
      await service.subscribe(plugin, CDC_SLOT_NAME);
    } catch (error) {
      attempt += 1;
      const inHandoffWindow = attempt <= slotTakeover.maxAttempts;
      const retryDelayMs = inHandoffWindow ? slotTakeover.retryDelayMs : reconnection.retryDelayMs;
      const takeover = inHandoffWindow ? ` (slot-takeover ${attempt}/${slotTakeover.maxAttempts})` : '';
      const slotHolder = (error as { code?: string } | null)?.code === PG_OBJECT_IN_USE ? await describeSlotHolder() : null;
      log.warn(`Subscription error, retrying in ${retryDelayMs / 1000}s${takeover}...`, {
        err: error,
        ...(slotHolder && { slotHolder }),
      });
      replicationState.markStopped();
      // Reposition a slot whose start predates its publication so decoding can proceed.
      // The distinct stale-publication error keeps this out of normal slot handoff.
      if (isStalePublicationError(error)) {
        log.warn(`Slot '${CDC_SLOT_NAME}' predates publication '${CDC_PUBLICATION_NAME}', recreating to self-heal`);
        await recreateReplicationSlot();
      }
      await new Promise((resolve) => setTimeout(resolve, retryDelayMs));
    }
  }
}
