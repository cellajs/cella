import { sql } from 'drizzle-orm';
import { LogicalReplicationService, type Pgoutput, type PgoutputPlugin } from 'pg-logical-replication';
import { appConfig } from 'shared';
import { CDC_PUBLICATION_NAME, CDC_SLOT_NAME, RESOURCE_LIMITS } from '../constants';
import { env } from '../env';
import { buildVerifiedSsl, cdcDb, stripSslParams } from '../lib/db';
import { log } from '../lib/pino';
import { wsClient } from '../network/websocket-client';
import { replicationState } from '../services/replication-state';
import { checkReplicationSetup } from '../services/setup-check';
import { acknowledgeIdlePosition, handleDataMessage, resetBuffers } from './handle-message';
import { isStalePublicationError } from './replication-errors';
import { countersAreLost, hasHistory, rebuildAllowed, rebuildBooks, rebuildIsRequested } from './verify';

const { reconnection, runtime, slotTakeover } = RESOURCE_LIMITS;

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
      // A peer that is gone without a word is noticed by the probes, and the read fails like any other.
      keepAlive: true,
      keepAliveInitialDelayMillis: 30_000,
    },
    { acknowledge: { auto: false, timeoutSeconds: 0 }, flowControl: { enabled: true } },
  );

  // The handler's promise is returned: with flow control on, the service reads the next message only once it resolved,
  // so a worker that is behind holds the stream where it is.
  // A service that was replaced can still hold queued messages. They belong to a stream that is read again, so they
  // are left alone.
  service.on('data', (lsn: string, message: unknown) =>
    replicationState.service === service ? handleDataMessage(lsn, message as Pgoutput.Message) : undefined,
  );

  service.on('error', (error: Error) => {
    log.error('CDC replication error', { err: error });
  });

  service.on('heartbeat', (lsn: string, _timestamp: number, shouldRespond: boolean) => {
    log.trace('Heartbeat received', { lsn, shouldRespond, wsConnected: wsClient.isConnected() });
    replicationState.lastKeepaliveLsn = lsn;

    // Deferred one tick so data messages from the same socket read reach their handlers before the idle check.
    // A busy worker replies with its last flushed position, never the keepalive's: that would move confirmed_flush_lsn past events still buffered or held while the API is down. Before the first ack, 0/0 leaves the slot untouched.
    setImmediate(async () => {
      const advanced = await acknowledgeIdlePosition();
      if (!advanced && shouldRespond) await service.acknowledge(replicationState.lastAckedLsn ?? '0/00000000');
    });
  });

  // The server drops a sender it has not heard from for `wal_sender_timeout`. While a flush holds the stream nothing
  // else is sent, so the last confirmed position is repeated on a timer. It confirms nothing new.
  const statusTimer = setInterval(() => {
    if (replicationState.service !== service) return clearInterval(statusTimer);
    void service.acknowledge(replicationState.lastAckedLsn ?? '0/00000000').catch(() => {});
  }, runtime.statusIntervalMs);
  statusTimer.unref?.();

  return service;
}

// Slot management

/**
 * Makes sure the slot exists and still holds its WAL. A slot the server invalidated (it passed
 * `max_slot_wal_keep_size` while nothing read it) cannot be read again: it is dropped and made anew.
 * @returns `created` when a slot had to be made. On a database with a history that is a lost case: what was written
 *   since the old slot's position is in no stream.
 */
export async function ensureReplicationSlot(): Promise<'present' | 'created' | 'unknown'> {
  try {
    const slot = (
      await cdcDb.execute<{ wal_status: string | null }>(sql`SELECT wal_status FROM pg_replication_slots WHERE slot_name = ${CDC_SLOT_NAME}`)
    ).rows[0];
    if (slot && slot.wal_status !== 'lost') return 'present';
    if (slot) {
      log.error(`Replication slot '${CDC_SLOT_NAME}' was invalidated: the server removed WAL it still needed`);
      await cdcDb.execute(sql`SELECT pg_drop_replication_slot(${CDC_SLOT_NAME})`);
    } else {
      log.info(`Replication slot '${CDC_SLOT_NAME}' not found, creating...`);
    }
    await cdcDb.execute(sql`SELECT pg_create_logical_replication_slot(${CDC_SLOT_NAME}, 'pgoutput')`);
    log.info(`Replication slot '${CDC_SLOT_NAME}' created`);
    return 'created';
  } catch (error) {
    log.warn('Could not verify/create replication slot', { err: error, slotName: CDC_SLOT_NAME });
    return 'unknown';
  }
}

/** One stale-slot drop per worker lifetime, so the retry loop cannot give up WAL again and again. */
let slotDropAttempted = false;

/**
 * Drops a slot whose WAL start predates its publication, after terminating its sender. Decoding can never proceed
 * from it, so what it held is lost: the next attempt makes a new slot and rebuilds the books. Runs once per worker
 * and only once the publication is confirmed to exist, which tells a stale slot from a missing publication.
 */
async function dropStaleReplicationSlot(): Promise<void> {
  if (slotDropAttempted) {
    log.warn(`Not dropping slot '${CDC_SLOT_NAME}' again: already done once this worker lifetime`);
    return;
  }
  try {
    const publicationCheck = await cdcDb.execute(sql`SELECT 1 FROM pg_publication WHERE pubname = ${CDC_PUBLICATION_NAME}`);
    if (publicationCheck.rows.length === 0) {
      log.warn(`Publication '${CDC_PUBLICATION_NAME}' does not exist; not dropping slot '${CDC_SLOT_NAME}'. Backing off until it appears.`);
      return;
    }

    slotDropAttempted = true;
    log.error(`Dropping replication slot '${CDC_SLOT_NAME}': it predates its publication and cannot be read`);
    await cdcDb.execute(sql`
      SELECT pg_terminate_backend(active_pid) FROM pg_replication_slots
      WHERE slot_name = ${CDC_SLOT_NAME} AND active_pid IS NOT NULL
    `);
    await cdcDb.execute(sql`
      SELECT pg_drop_replication_slot(${CDC_SLOT_NAME})
      WHERE EXISTS (SELECT 1 FROM pg_replication_slots WHERE slot_name = ${CDC_SLOT_NAME})
    `);
  } catch (error) {
    log.warn('Could not drop the stale replication slot', { err: error, slotName: CDC_SLOT_NAME });
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

/**
 * The worker hands every change to the API, so it consumes nothing while the API is away: a flush waits for the
 * socket and the changes stay in the WAL. This only keeps the status that health reports.
 */
export function setupBackpressure(): void {
  wsClient.setCallbacks({
    onConnect: () => {
      log.info('API reachable: the worker reads on');
      replicationState.markApiBack();
    },
    onDisconnect: () => {
      if (!wsClient.inGracePeriod()) log.warn('API away: flushes wait and the WAL keeps the changes');
      replicationState.markApiAway();
    },
  });
}

// Subscription loop

/** The steps of a subscription attempt that reach outside the loop, so a test can stand in for them. */
interface SubscriptionSteps {
  createService: () => LogicalReplicationService;
  checkSetup: () => Promise<string[]>;
  settle: (slotCreated: boolean) => Promise<void>;
}

/**
 * The lost cases, handled between two subscriptions: the WAL cannot bring the books back, so they are rebuilt from the
 * tables and every client refetches. A slot that had to be made on a database with a history, counters that are gone
 * (a truncate, a partial restore), a change that failed every read, or a rebuild on request.
 */
export async function settleLostCases(slotCreated: boolean): Promise<void> {
  if (slotCreated && (await hasHistory())) return rebuildBooks('lost_slot');
  if (await countersAreLost()) return rebuildBooks('lost_counters');

  const { failure, stuck } = replicationState;
  if (stuck && failure && rebuildAllowed()) return rebuildBooks('stuck', { position: failure.position, error: failure.error });

  // Read from the database, not from memory: a rebuild above answers a request too, and a worker that died after
  // giving up a backlog finds its own request here at its next start.
  if (await rebuildIsRequested()) return rebuildBooks('requested');
}

/**
 * Subscribes for as long as the worker runs. Every subscription is a new service with empty buffers, so it starts at
 * the slot's confirmed position: whatever an earlier subscription had received without acknowledging is delivered
 * again, and a flush records each event once however often it arrives.
 */
export async function subscribeWithReconnect(
  plugin: PgoutputPlugin,
  { createService = createReplicationService, checkSetup = checkReplicationSetup, settle = settleLostCases }: Partial<SubscriptionSteps> = {},
): Promise<void> {
  // Fast retries during a rolling-deploy slot handoff, then the normal cadence under sustained contention.
  let attempt = 0;
  while (!replicationState.stopping) {
    let service: LogicalReplicationService | null = null;
    try {
      // A subscription takes the slot: it waits for an API to hand the changes to.
      if (!wsClient.isConnected()) replicationState.markPaused();
      await wsClient.whenConnected();

      // Every attempt: dropping a database removes its slots, and no slot can be created while it is
      // unreachable. One catalog SELECT per attempt, and a no-op when another worker holds the slot.
      const slot = await ensureReplicationSlot();

      // A stream from a setup that does not match the worker would drop or misread changes without a sign.
      replicationState.setupProblems = await checkSetup();
      if (replicationState.setupProblems.length)
        throw new Error(`Replication setup does not match the worker: ${replicationState.setupProblems.join('; ')}`);

      await settle(slot === 'created');

      resetBuffers();
      service = createService();
      replicationState.service = service;

      log.info('Subscribing to replication slot...');
      replicationState.flushFailed = false;
      replicationState.status = wsClient.isConnected() ? 'active' : 'paused';
      await service.subscribe(plugin, CDC_SLOT_NAME);
      replicationState.markStopped();

      // The subscription ended without an error: a failed flush stopped it. The same events come next, so wait first:
      // longer with every failure in a row.
      if (replicationState.flushFailed && !replicationState.stopping) {
        const { failure, rereadDelayMs, stuck } = replicationState;
        log[stuck ? 'error' : 'warn'](stuck ? 'Stuck: the same position keeps failing, the WAL waits' : 'Reading again after a failed flush', {
          ...failure,
          rereadDelayMs,
        });
        await new Promise((resolve) => setTimeout(resolve, rereadDelayMs));
      }
    } catch (error) {
      if (replicationState.stopping) break;
      // The stream of this attempt is over, but its service can still hold a connection and queued messages.
      await service?.stop().catch(() => {});
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
      // A slot whose start predates its publication can never be read: it goes, and the next attempt handles the loss.
      if (isStalePublicationError(error)) await dropStaleReplicationSlot();
      await new Promise((resolve) => setTimeout(resolve, retryDelayMs));
    }
  }
}
