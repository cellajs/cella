import { LogicalReplicationService, type Pgoutput, PgoutputPlugin } from 'pg-logical-replication';
import { sql } from 'drizzle-orm';
import { appConfig } from 'shared';

import { CDC_SLOT_NAME, RESOURCE_LIMITS } from '../constants';
import { buildVerifiedSsl, cdcDb, stripSslParams } from '../lib/db';
import { env } from '../env';
import { log } from '../lib/pino';

import { replicationState } from '../services/replication-state';
import { wsClient } from '../network/websocket-client';

import { handleDataMessage } from './handle-message';

const { reconnection, slotTakeover } = RESOURCE_LIMITS;

// Replication service setup

/**
 * Build the replication connection URL from the CDC database URL.
 *
 * Strips the `sslmode=require&uselibpqcompat=true` params so the explicit,
 * CA-verified `ssl` config (see {@link createReplicationService}) is used
 * instead of pg's unverified libpq-compat downgrade.
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
      // Verified TLS, consistent with cdcDb: the replication stream carries full
      // row data and must not silently downgrade. buildVerifiedSsl pins the cert
      // identity check to the dialed host so the Scaleway RDB cert's SANs are
      // honored (returns undefined outside production, where TLS is not required).
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

/** Postgres `object_in_use`: subscribe() lost the race for an actively held slot. */
const PG_OBJECT_IN_USE = '55006';

/**
 * Best-effort lookup of the connection currently holding the replication slot.
 *
 * "replication slot is active for PID N" alone is hard to act on: the PID is a
 * Postgres walsender, not a host process. The holder's application_name and
 * backend_start usually identify the competing worker at a glance — the old
 * worker of a rolling deploy, or a stray local process that never shut down.
 * Returns null when the slot is free or the lookup fails; diagnostics must
 * never break the retry loop.
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
  // During a rolling deploy the new worker contends for the slot the old worker
  // still holds, so subscribe() rejects until the old worker releases it. For the
  // first `slotTakeover.maxAttempts` retries (the handoff window) retry at the
  // tightened `slotTakeover.retryDelayMs` so the takeover is sub-second; after
  // that, settle to the normal `reconnection` cadence so a steady-state reconnect
  // does not hammer Postgres. A first boot with no old worker acquires the slot
  // immediately, so the fast cadence only ever applies under real contention.
  let attempt = 0;
  while (true) {
    try {
      // Re-ensured before every attempt rather than once at boot. The slot is not permanent:
      // dropping a database takes its slots with it, so a slot can vanish under a running worker.
      // And a worker that boots while the database is unreachable cannot create one at all. In
      // both cases a startup-only ensure leaves this loop retrying a slot that will never exist,
      // and replication stays dead until someone restarts the process. Cheap enough to repeat:
      // one catalog SELECT per (re)subscribe, and a no-op during a rolling deploy, where the slot
      // exists and is merely held by the outgoing worker.
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
      await new Promise((resolve) => setTimeout(resolve, retryDelayMs));
    }
  }
}
