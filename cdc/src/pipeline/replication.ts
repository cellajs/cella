import { sql } from 'drizzle-orm';
import { LogicalReplicationService, type Pgoutput, type PgoutputPlugin } from 'pg-logical-replication';
import { appConfig } from 'shared';
import { findBooksRequest, requestBooks } from '#/modules/entities/sync-requests';
import { CDC_SLOT_NAME, RESOURCE_LIMITS } from '../constants';
import { env } from '../env';
import { buildVerifiedSsl, cdcDb, stripSslParams } from '../lib/db';
import { log } from '../lib/pino';
import { wsClient } from '../network/websocket-client';
import { replicationState } from '../services/replication-state';
import { checkReplicationSetup } from '../services/setup-check';
import { formatLsn, lsnToBigInt } from '../utils/lsn';
import { flushHasFailed, handleDataMessage, resetBuffers, scheduleIdleCheck } from './handle-message';
import { isStalePublicationError } from './replication-errors';
import { ensureBooksStateRestored, readLostCaseFacts, rebuildAllowed, rebuildBooks, rebuildWasInterrupted } from './verify';

const { reconnection, runtime, slotTakeover } = RESOURCE_LIMITS;

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

/**
 * The service of one subscription: its replication connection, the handlers of what the stream delivers, and the
 * timer that keeps Postgres from dropping a held stream. The loop makes a new one for every subscription.
 */
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
 * Makes sure the slot exists and still holds its WAL. A slot Postgres invalidated (it passed
 * `max_slot_wal_keep_size` while nothing read it) cannot be read again: it is dropped and made anew.
 * @returns `created` when a slot had to be made. On a database with a history that is a lost case: what was written
 *   since the old slot's position is in no stream. `held` when another worker still reads the slot, as during a
 *   deploy: its flushes go on, so nothing may be settled beside them.
 */
export async function ensureReplicationSlot(): Promise<'present' | 'held' | 'created' | 'unknown'> {
  try {
    const slot = (
      await cdcDb.execute<{ wal_status: string | null; active: boolean }>(
        sql`SELECT wal_status, active FROM pg_replication_slots WHERE slot_name = ${CDC_SLOT_NAME}`,
      )
    ).rows[0];
    if (slot?.active) return 'held';
    if (slot && slot.wal_status !== 'lost') return 'present';
    if (slot) {
      log.error(`Replication slot '${CDC_SLOT_NAME}' was invalidated: Postgres removed WAL it still needed`);
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

/**
 * Drops a slot whose WAL start predates its publication, after terminating its sender. Decoding can never proceed
 * from it, so what it held is lost: the next attempt makes a new slot and rebuilds the books. The setup check has
 * found the publication before any subscription, so the error means the slot is older, not that the publication is
 * missing. At most once per rebuild interval, like every position the worker gives up.
 */
async function dropStaleReplicationSlot(): Promise<void> {
  if (!rebuildAllowed()) {
    log.warn(`Not dropping slot '${CDC_SLOT_NAME}' yet: the books were rebuilt a moment ago`);
    return;
  }
  try {
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

/** The steps of a subscription attempt that reach outside the loop, so a test can stand in for them. */
interface SubscriptionSteps {
  createService: () => LogicalReplicationService;
  checkSetup: () => Promise<string[]>;
  settle: (slotCreated: boolean) => Promise<void>;
}

/**
 * Gives up the backlog of a stuck worker: the slot moves to the current position, and what it had not recorded is
 * read no more. Moving the slot is no part of any transaction, so the rebuild is asked for first: a worker that dies
 * between the move and the rebuild finds the request at its next start.
 * @returns The position the slot moved to.
 */
async function giveUpBacklog(): Promise<string | null> {
  await requestBooks(cdcDb, 'rebuild');
  const advanced = await cdcDb.execute<{ position: string }>(
    sql`SELECT (pg_replication_slot_advance(${CDC_SLOT_NAME}, pg_current_wal_lsn())).end_lsn::text AS position`,
  );
  const position = advanced.rows[0]?.position ?? null;
  // The status timer of the next subscription repeats what was acknowledged last: that is the slot's new position now,
  // never one behind it. One byte back, because an acknowledgement reports the byte after its position.
  if (position) replicationState.lastAckedLsn = formatLsn(lsnToBigInt(position) - 1n);
  return position;
}

/**
 * The lost cases, handled between two subscriptions: the WAL cannot bring the books back, so they are rebuilt from the
 * tables and every client refetches. A slot that had to be made on a database with a history, counters that are gone
 * (a truncate, a partial restore), a restart inside the fence of a rebuild, a change that failed every read, or a
 * rebuild that was asked for while no subscription could answer it.
 */
export async function settleLostCases(slotCreated: boolean): Promise<void> {
  await ensureBooksStateRestored();
  const { hasHistory, countersAreLost } = await readLostCaseFacts();
  if (slotCreated && hasHistory) return rebuildBooks('lost_slot');
  if (countersAreLost) return rebuildBooks('lost_counters');
  if (rebuildWasInterrupted()) return rebuildBooks('interrupted');

  const { failure, stuck } = replicationState;
  if (stuck && failure && rebuildAllowed()) {
    const positionTo = await giveUpBacklog();
    return rebuildBooks('stuck', { positionFrom: failure.position, positionTo, error: failure.error });
  }

  // Read from the database: a rebuild above answers a request too, and a worker that died after giving up a backlog
  // finds its own request here at its next start.
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
  // Attempts that ended in an error: the first ones are tried again soon, for the slot a rolling deploy hands over.
  let attempt = 0;
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
        await service.subscribe(plugin, CDC_SLOT_NAME);
      } finally {
        replicationState.subscribed = false;
      }
      // A subscription that ran ends the row of failed attempts: the next handover gets its quick attempts again.
      attempt = 0;

      // The subscription ended without an error: a failed flush stopped it. The same changes come next, so wait first:
      // longer with every failure in a row.
      if (flushHasFailed() && !replicationState.stopping) {
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
      const delayMs = inHandoffWindow ? slotTakeover.retryDelayMs : reconnection.retryDelayMs;
      const takeover = inHandoffWindow ? ` (slot-takeover ${attempt}/${slotTakeover.maxAttempts})` : '';
      log.warn(`Subscription error, next attempt in ${delayMs / 1000}s${takeover}`, { err: error });
      // A slot whose start predates its publication can never be read: it goes, and the next attempt handles the loss.
      if (isStalePublicationError(error)) await dropStaleReplicationSlot();
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
}
