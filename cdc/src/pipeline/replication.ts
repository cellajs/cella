import { sql } from 'drizzle-orm';
import { LogicalReplicationService, type Pgoutput, type PgoutputPlugin } from 'pg-logical-replication';
import { appConfig } from 'shared';
import { verifiedPostgresConnection } from 'shared/utils/postgres-tls';
import { findBooksRequest, requestBooks } from '#/modules/entities/sync-requests';
import { cdcSlotName, resourceLimits } from '../constants';
import { env } from '../env';
import { cdcDb, sslCa } from '../lib/db';
import { log } from '../lib/pino';
import { pushHealth } from '../network/health-reporter';
import { wsClient } from '../network/websocket-client';
import { metrics } from '../services/cdc-metrics';
import { replicationState } from '../services/replication-state';
import { checkReplicationSetup } from '../services/setup-check';
import { flushHasFailed, handleDataMessage, resetBuffers, scheduleIdleCheck } from './handle-message';
import { ensureBooksStateRestored, readLostCaseFacts, rebuildBooks, rebuildWasInterrupted } from './verify';

const { runtime } = resourceLimits;
const { walLagUnhealthyBytes } = resourceLimits.health;

/** The replication connection's string and verified TLS, matching the query connection's; the string asks for replication. */
function replicationConnection() {
  const { connectionString, ssl } = verifiedPostgresConnection(env.DATABASE_CDC_URL, sslCa);
  const replicationUrl = new URL(connectionString);
  if (!replicationUrl.searchParams.has('replication')) {
    replicationUrl.searchParams.set('replication', 'database');
  }
  return { connectionString: replicationUrl.toString(), ssl };
}

/**
 * The service of one subscription: its replication connection, the handlers of what the stream delivers, and the
 * timer that keeps Postgres from dropping a held stream. The loop makes a new one for every subscription.
 */
export function createReplicationService(): LogicalReplicationService {
  const service = new LogicalReplicationService(
    {
      // Certificate identity is pinned to the dialed host in production.
      ...replicationConnection(),
      application_name: `${appConfig.slug}-cdc-worker`,
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
  service.on('data', (lsn: string, message: Pgoutput.Message) =>
    replicationState.service === service ? handleDataMessage(lsn, message) : undefined,
  );

  // The stream is open: the slot is read once more and the API hears at once that the worker reads. The push at
  // connect came before any subscription, and the next one is up to 15 seconds away.
  service.on('start', () => {
    void metrics
      .pollLag()
      .then(pushHealth)
      .catch(() => {});
  });

  // The loop logs what ends a subscription, once. An emitter without a listener for `error` would throw it.
  service.on('error', (error: Error) => {
    log.debug('Replication connection error', { err: error });
  });

  // A keepalive tells how far Postgres has sent: an idle worker acknowledges that position. Checked once the current
  // turn is over, so data messages of the same socket read reach their handlers first.
  service.on('heartbeat', (lsn: string) => {
    replicationState.lastKeepaliveLsn = lsn;
    scheduleIdleCheck();
  });

  // Postgres drops a sender it has not heard from for `wal_sender_timeout`. While a flush holds the stream nothing
  // else is sent, so the last acknowledged position is repeated on a timer. It acknowledges nothing new, and before
  // the first acknowledgement 0/0 leaves the slot where it is.
  const statusTimer = setInterval(() => {
    if (replicationState.service !== service) return clearInterval(statusTimer);
    void service.acknowledge(replicationState.lastAckedLsn ?? '0/00000000').catch(() => {});
  }, runtime.statusIntervalMs);
  statusTimer.unref?.();

  return service;
}

/**
 * Makes sure the slot exists and still holds its WAL. A slot that cannot be read on is dropped and made anew: one
 * Postgres invalidated (it passed `max_slot_wal_keep_size`), and one that reached the WAL bound while the worker could
 * not get past a failure, so the WAL would fill the disk.
 * @returns `created` when a slot had to be made. On a database with a history that is a lost case: what was written
 *   since the old slot's position is in no stream. `held` when another worker still reads the slot, as during a
 *   deploy: its flushes go on, so nothing may be settled beside them. `unknown` when the slot could not be looked up.
 * @throws When a slot could not be made: the attempt fails, and nothing is settled while there is no slot.
 */
export async function ensureReplicationSlot(): Promise<'present' | 'held' | 'created' | 'unknown'> {
  try {
    const slot = (
      await cdcDb.execute<{ wal_status: string | null; active: boolean }>(
        sql`SELECT wal_status, active FROM pg_replication_slots WHERE slot_name = ${cdcSlotName}`,
      )
    ).rows[0];
    if (slot?.active) return 'held';
    const { failure, stalled } = replicationState;
    const atWalBound = stalled && metrics.lagBytes !== null && metrics.lagBytes >= walLagUnhealthyBytes;
    if (slot && slot.wal_status !== 'lost' && !atWalBound) return 'present';
    if (!slot) {
      log.info(`Replication slot '${cdcSlotName}' not found, creating...`);
    } else if (slot.wal_status === 'lost') {
      log.error(`Replication slot '${cdcSlotName}' was invalidated: Postgres removed WAL it still needed`);
    } else {
      log.error(`Replication slot '${cdcSlotName}' reached the WAL bound while the worker failed: it is dropped`, {
        ...failure,
        lagBytes: metrics.lagBytes,
      });
    }
    if (slot) await cdcDb.execute(sql`SELECT pg_drop_replication_slot(${cdcSlotName})`);
  } catch (error) {
    log.warn('Could not verify/create replication slot', { err: error, slotName: cdcSlotName });
    return 'unknown';
  }

  // The rebuild a new slot owes is asked for before the slot exists: a worker that stops before that rebuild commits
  // finds the request at its next start. It replaces a verify that waits: the rebuild recounts.
  if ((await readLostCaseFacts()).hasHistory) await requestBooks(cdcDb, 'rebuild');
  await cdcDb.execute(sql`SELECT pg_create_logical_replication_slot(${cdcSlotName}, 'pgoutput')`);
  // What was acknowledged and measured belongs to the old slot: the status timer would repeat it, and the bound read it.
  replicationState.lastAckedLsn = null;
  metrics.lagBytes = null;
  await metrics.pollLag();
  log.info(`Replication slot '${cdcSlotName}' created`);
  return 'created';
}

/** The steps of a subscription attempt that reach outside the loop, so a test can stand in for them. */
interface SubscriptionSteps {
  createService: () => LogicalReplicationService;
  checkSetup: () => Promise<string[]>;
  settle: (slotCreated: boolean) => Promise<void>;
}

/**
 * The lost cases, handled between two subscriptions: the WAL cannot bring the books back, so they are rebuilt from the
 * tables and every client refetches. A slot that had to be made on a database with a history, counters that are gone
 * (a truncate, a partial restore), a restart inside the fence of a rebuild, or a rebuild that was asked for while no
 * subscription could answer it.
 */
export async function settleLostCases(slotCreated: boolean): Promise<void> {
  await ensureBooksStateRestored();
  const { hasHistory, countersAreLost } = await readLostCaseFacts();
  if (slotCreated && hasHistory) {
    const { failure } = replicationState;
    return rebuildBooks('lost_slot', failure ? { positionFrom: failure.position, error: failure.error } : {});
  }
  if (countersAreLost) return rebuildBooks('lost_counters');
  if (rebuildWasInterrupted()) return rebuildBooks('interrupted');

  // Read from the database: a rebuild above answers a request too, and a worker whose rebuild for a new slot did not
  // commit finds its own request here.
  if ((await findBooksRequest(cdcDb)) === 'rebuild') return rebuildBooks('requested');
}

/**
 * Subscribes for as long as the worker runs. Every subscription is a new service with empty buffers, so it starts at
 * the slot's acknowledged position: whatever an earlier subscription had received without acknowledging is delivered
 * again, and a flush records each change once however often it arrives.
 */
export async function subscribeWithReconnect(
  plugin: PgoutputPlugin,
  { createService = createReplicationService, checkSetup = checkReplicationSetup, settle = settleLostCases }: Partial<SubscriptionSteps> = {},
): Promise<void> {
  while (!replicationState.stopping) {
    let service: LogicalReplicationService | null = null;
    try {
      // A subscription takes the slot: it waits for an API to hand the changes to.
      await wsClient.whenConnected();

      // A stream from a setup that does not match the worker would drop or misread changes without a sign. Checked
      // before the slot: a slot the worker makes ahead of a missing publication can never be read.
      replicationState.setupProblems = await checkSetup();
      if (replicationState.setupProblems.length)
        throw new Error(`Replication setup does not match the worker: ${replicationState.setupProblems.join('; ')}`);

      // Every attempt: dropping a database removes its slots, and no slot can be created while it is
      // unreachable. One catalog SELECT per attempt, and a no-op when another worker holds the slot.
      const slot = await ensureReplicationSlot();

      // First the buffers: a flush still in flight belongs to the subscription that ended, and what it holds is read
      // again. The lost cases are settled only by the worker that can take the slot: while another one holds it, the
      // subscribe below fails and this attempt is made again.
      await resetBuffers();
      if (slot !== 'held') await settle(slot === 'created');

      // A shutdown that came while this attempt prepared stops the service the loop held before: none is made after it.
      if (replicationState.stopping) break;
      service = createService();
      replicationState.service = service;

      log.info('Subscribing to replication slot...');
      replicationState.subscribed = true;
      try {
        await service.subscribe(plugin, cdcSlotName);
      } finally {
        replicationState.subscribed = false;
      }

      // The subscription ended without an error: a failed flush stopped it. The same changes come next, so wait first:
      // longer with every failure in a row.
      if (flushHasFailed() && !replicationState.stopping) {
        const { failure, rereadDelayMs, stalled } = replicationState;
        log[stalled ? 'error' : 'warn']('Reading again after a failed flush', { ...failure, rereadDelayMs });
        await new Promise((resolve) => setTimeout(resolve, rereadDelayMs));
      }
    } catch (error) {
      if (replicationState.stopping) break;
      // The stream of this attempt is over, but its service can still hold a connection and queued messages.
      await service?.stop().catch(() => {});
      // A failure like a failed flush, with the same waits: a slot another worker still holds during a deploy, a
      // connection refused, a setup that does not match. A failure the stream had shown keeps its position.
      replicationState.recordFailure(replicationState.failure?.position ?? null, error);
      const { rereadDelayMs, stalled } = replicationState;
      log[stalled ? 'error' : 'warn'](`Subscription to replication slot '${cdcSlotName}' failed, next attempt in ${rereadDelayMs / 1000}s`, {
        err: error,
      });
      await new Promise((resolve) => setTimeout(resolve, rereadDelayMs));
    }
  }
}
