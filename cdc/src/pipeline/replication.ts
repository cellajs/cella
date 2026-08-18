import { sql } from 'drizzle-orm';
import { LogicalReplicationService, type Pgoutput, type PgoutputPlugin } from 'pg-logical-replication';
import { appConfig } from 'shared';
import { CDC_PUBLICATION_NAME, CDC_SLOT_NAME, RESOURCE_LIMITS } from '../constants';
import { env } from '../env';
import { buildVerifiedSsl, cdcDb, stripSslParams } from '../lib/db';
import { log } from '../lib/pino';
import { wsClient } from '../network/websocket-client';
import { replicationState } from '../services/replication-state';
import { handleDataMessage } from './handle-message';
import { isStalePublicationError } from './replication-errors';

const { reconnection, slotTakeover } = RESOURCE_LIMITS;

// Replication service setup

/**
 * Strips the `sslmode=require&uselibpqcompat=true` params so the explicit, CA-verified `ssl` config
 * of {@link createReplicationService} applies and pg cannot downgrade to unverified libpq-compat.
 */
function buildReplicationUrl(): URL {
  const replicationUrl = new URL(stripSslParams(env.DATABASE_CDC_URL));
  if (!replicationUrl.searchParams.has('replication')) {
    replicationUrl.searchParams.set('replication', 'database');
  }
  return replicationUrl;
}

export function createReplicationService(): LogicalReplicationService {
  const connectionUrl = buildReplicationUrl();
  const service = new LogicalReplicationService(
    {
      connectionString: connectionUrl.toString(),
      application_name: `${appConfig.slug}-cdc-worker`,
      // Verified TLS, matching the query connection; certificate identity is pinned to the dialed host in production.
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
    log.error('CDC replication error', { err: error });
  });

  service.on('heartbeat', async (lsn: string, _timestamp: number, shouldRespond: boolean) => {
    log.trace('Heartbeat received', { lsn, shouldRespond, wsConnected: wsClient.isConnected() });
    if (shouldRespond) {
      await service.acknowledge(lsn);
    }
  });

  return service;
}

// Slot management

export async function ensureReplicationSlot(): Promise<void> {
  try {
    const slotCheck = await cdcDb.execute(sql`SELECT 1 FROM pg_replication_slots WHERE slot_name = ${CDC_SLOT_NAME}`);
    if (slotCheck.rows.length === 0) {
      log.info(`Replication slot '${CDC_SLOT_NAME}' not found, creating...`);
      await cdcDb.execute(sql`SELECT pg_create_logical_replication_slot(${CDC_SLOT_NAME}, 'pgoutput')`);
      log.info(`Replication slot '${CDC_SLOT_NAME}' created`);
    }
  } catch (error) {
    log.warn('Could not verify/create replication slot', { err: error, slotName: CDC_SLOT_NAME });
  }
}

/** One stale-slot recovery per worker lifetime, so the retry loop cannot repeatedly discard WAL. */
let slotRecreationAttempted = false;

/**
 * Recreates a slot whose WAL start predates its publication, after terminating its sender; the sync
 * sequence recovers the skipped WAL. Runs once per worker and only once the publication is confirmed
 * to exist, which distinguishes a stale slot from a missing publication.
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

/** @returns null when the slot is free or the lookup fails, so diagnostics never break retries. */
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

/** Backpressure: replication acknowledgment pauses while the WebSocket is disconnected. */
export function setupBackpressure(): void {
  wsClient.setCallbacks({
    onConnect: () => {
      const wasPaused = replicationState.status === 'paused';
      if (wasPaused) {
        log.info('WebSocket reconnected - resuming replication acknowledgment');
      } else {
        log.info('WebSocket connected - resuming replication acknowledgment');
      }
      replicationState.markActive();
    },
    onDisconnect: () => {
      if (!wsClient.inGracePeriod()) {
        log.warn('WebSocket disconnected - pausing replication acknowledgment');
      }
      replicationState.markPaused();
    },
  });
}

// Subscription loop

export async function subscribeWithReconnect(
  service: LogicalReplicationService,
  plugin: PgoutputPlugin,
): Promise<never> {
  // Fast retries during a rolling-deploy slot handoff, then the normal cadence under sustained contention.
  let attempt = 0;
  while (true) {
    try {
      // Every attempt: dropping a database removes its slots, and no slot can be created while it is
      // unreachable. One catalog SELECT per attempt, and a no-op when another worker holds the slot.
      await ensureReplicationSlot();

      log.info('Subscribing to replication slot...');
      replicationState.status = wsClient.isConnected() ? 'active' : 'paused';
      await service.subscribe(plugin, CDC_SLOT_NAME);
    } catch (error) {
      attempt += 1;
      const inHandoffWindow = attempt <= slotTakeover.maxAttempts;
      const retryDelayMs = inHandoffWindow ? slotTakeover.retryDelayMs : reconnection.retryDelayMs;
      const takeover = inHandoffWindow ? ` (slot-takeover ${attempt}/${slotTakeover.maxAttempts})` : '';
      const slotHolder =
        (error as { code?: string } | null)?.code === PG_OBJECT_IN_USE ? await describeSlotHolder() : null;
      log.warn(`Subscription error, retrying in ${retryDelayMs / 1000}s${takeover}...`, {
        err: error,
        ...(slotHolder && { slotHolder }),
      });
      replicationState.markStopped();
      // Reposition a slot whose start predates its publication so decoding can proceed.
      if (isStalePublicationError(error)) {
        log.warn(`Slot '${CDC_SLOT_NAME}' predates publication '${CDC_PUBLICATION_NAME}', recreating to self-heal`);
        await recreateReplicationSlot();
      }
      await new Promise((resolve) => setTimeout(resolve, retryDelayMs));
    }
  }
}
