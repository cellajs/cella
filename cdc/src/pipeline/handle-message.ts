import type { Pgoutput } from 'pg-logical-replication';
import { resourceLimits } from '../constants';
import { log } from '../lib/pino';
import { fence, fenceMarkerPrefix } from '../services/fence';
import { FlushBuffer } from '../services/flush-buffer';
import { replicationState } from '../services/replication-state';
import { TransactionBuffer } from '../services/transaction-buffer';
import { lsnToBigInt } from '../utils/lsn';
import { type DmlMessage, parseMessage } from './parse-message';
import { processFlush } from './process-flush';

function isDmlMessage(msg: Pgoutput.Message): msg is DmlMessage {
  return msg.tag === 'insert' || msg.tag === 'update' || msg.tag === 'delete';
}

/**
 * Acknowledges a position to the slot and keeps it, so the status timer can repeat it. A service that has stopped
 * sends nothing, and then nothing is kept: the position is still unacknowledged.
 * @returns Whether the position was sent.
 */
async function acknowledgeLsn(lsn: string): Promise<boolean> {
  // After a failure nothing more is acknowledged on this subscription: a later position would pass the change that failed.
  if (flushBuffer.failed) return false;
  if (!(await replicationState.service?.acknowledge(lsn))) return false;
  replicationState.lastAckedLsn = lsn;
  return true;
}

/** Collects the changes of committed source transactions into flushes. */
const flushBuffer = new FlushBuffer(
  processFlush,
  async (position) => {
    // The flush is recorded, and once its position went out whatever failed before is behind the worker. A flush that
    // ends after a later message failed acknowledges nothing, and that failure goes on counting.
    if (await acknowledgeLsn(position)) replicationState.clearFailure();
  },
  resourceLimits.buffers.flushWindowMs,
);

/**
 * The one way a failure is handled: the subscription ends without an acknowledgement, and the next one starts at the
 * slot's acknowledged position and delivers the same changes again.
 */
flushBuffer.onFailed = (error, position) => {
  replicationState.recordFailure(position, error);
  void replicationState.service?.stop();
};

/** Holds a source transaction until its commit and suppresses what a cascade wrote. */
const txBuffer = new TransactionBuffer((events) => flushBuffer.enqueue(events));

/** Data messages whose handler has not returned yet. */
let inFlightMessages = 0;

/** How many changes of the open transaction were received, kept or not: a change's index in its transaction. */
let changesInTransaction = 0;

/** Counts the subscriptions, so a handler that outlives its own can tell. */
let subscriptionCount = 0;

/**
 * Acknowledges the latest keepalive position once every received message is recorded and acknowledged. A flush
 * acknowledges the commit of its last source transaction, so an idle worker would hold the slot there while WAL
 * without changes of tracked tables grows behind it: a marker, a transaction whose rows the worker drops. Source
 * transactions committed before a keepalive were streamed ahead of it, so its position is safe whenever nothing is
 * in flight.
 * @returns true when the keepalive position was acknowledged.
 */
async function acknowledgeIdlePosition(): Promise<boolean> {
  const { lastKeepaliveLsn, lastAckedLsn } = replicationState;
  const busy = inFlightMessages > 0 || txBuffer.isBuffering || !flushBuffer.isIdle;
  if (!lastKeepaliveLsn || busy) return false;

  // The keepalive position is the end of what Postgres has sent, acknowledged as it is: never a byte of the next commit record.
  if (lsnToBigInt(lastKeepaliveLsn) <= (lastAckedLsn ? lsnToBigInt(lastAckedLsn) : 0n)) return false;

  return acknowledgeLsn(lastKeepaliveLsn);
}

/**
 * Runs the idle check once the current turn is over. The replication client parses a whole socket read at once and
 * queues its data messages, so right after one handler returns the next messages can still wait in that queue while
 * the worker looks idle. They all reach their handlers before a callback of the check phase runs.
 */
export function scheduleIdleCheck(): void {
  setImmediate(() => void acknowledgeIdlePosition());
}

flushBuffer.onDrained = scheduleIdleCheck;

/** Whether the subscription ended on a failure: the loop then waits before it reads the same changes again. */
export function flushHasFailed(): boolean {
  return flushBuffer.failed;
}

/** Buffers the changes of a source transaction between its BEGIN and COMMIT, and hands the survivors to a flush. */
export async function handleDataMessage(lsn: string, msg: Pgoutput.Message): Promise<void> {
  // After a failure this subscription is over: what the service still delivers is read again by the next one.
  if (flushBuffer.failed) return;
  inFlightMessages += 1;
  try {
    await applyDataMessage(lsn, msg);
  } catch (error) {
    // A message the worker cannot handle fails like a flush it cannot record: nothing past it is acknowledged.
    flushBuffer.fail(error, lsn);
  } finally {
    inFlightMessages -= 1;
    if (inFlightMessages === 0) scheduleIdleCheck();
  }
}

async function applyDataMessage(lsn: string, msg: Pgoutput.Message): Promise<void> {
  switch (msg.tag) {
    case 'begin': {
      changesInTransaction = 0;
      const committedAt = txBuffer.onBegin(msg);
      // How long ago the source transaction committed is how far the worker is behind.
      if (committedAt !== null) replicationState.lagMs = Date.now() - committedAt;
      return;
    }
    case 'commit':
      await txBuffer.onCommit(msg.commitEndLsn);
      return;
    case 'message': {
      if (msg.prefix !== fenceMarkerPrefix) return;
      // The marker was written right after a recount's snapshot. Once everything before it is recorded, the stream has
      // passed that snapshot. A subscription that ended meanwhile dropped what was pending: its marker is read again.
      const subscription = subscriptionCount;
      await flushBuffer.flush();
      if (!flushBuffer.failed && subscription === subscriptionCount) fence.markerArrived(new TextDecoder().decode(msg.content));
      return;
    }
  }

  // Skips relation, origin, type and other non-DML messages.
  if (!isDmlMessage(msg)) return;

  // Counted for every change, kept or not, so a change has the same index on every delivery.
  const index = changesInTransaction;
  changesInTransaction += 1;

  log.trace('CDC message received', { lsn, tag: msg.tag, table: msg.relation.name });

  // A change the parser drops leaves nothing to record. The idle acknowledgement moves the slot past it.
  const parseResult = parseMessage(msg);
  if (!parseResult) return;

  replicationState.lastEventAt = new Date();

  await txBuffer.onEvent(lsn, parseResult, index);
}

/**
 * Runs `fn` exactly between two flushes: what it reads holds every flush before it and none after it, and the next
 * flush waits until it resolved.
 */
export function runBetweenFlushes<T>(fn: () => Promise<T>): Promise<T> {
  return flushBuffer.exclusive(fn);
}

/** At shutdown: records what is pending while the subscription can still acknowledge it. */
export async function drainBuffers(): Promise<void> {
  await flushBuffer.flush();
}

/**
 * Before every subscription: what was buffered is delivered again from the slot's acknowledged position. Resolves
 * once the flush in flight has ended, so nothing of the subscription that ended is recorded beside what follows. The
 * keepalive position goes too: it belongs to the stream that ended, and can lie past what that stream never recorded.
 */
export async function resetBuffers(): Promise<void> {
  subscriptionCount += 1;
  txBuffer.reset();
  await flushBuffer.reset();
  replicationState.lastKeepaliveLsn = null;
  changesInTransaction = 0;
}
