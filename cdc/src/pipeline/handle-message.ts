import type { Pgoutput } from 'pg-logical-replication';
import { RESOURCE_LIMITS } from '../constants';
import { log } from '../lib/pino';
import { fence } from '../services/fence';
import { FlushBuffer } from '../services/flush-buffer';
import { replicationState } from '../services/replication-state';
import { TransactionBuffer } from '../services/transaction-buffer';
import { commitTimeMs } from '../utils/commit-time';
import { formatLsn, lsnToBigInt } from '../utils/lsn';
import { parseMessage } from './parse-message';
import { processFlush } from './process-events';

// Message helpers

type DmlMessage = Pgoutput.MessageInsert | Pgoutput.MessageUpdate | Pgoutput.MessageDelete;

function isDmlMessage(msg: Pgoutput.Message): msg is DmlMessage {
  return msg.tag === 'insert' || msg.tag === 'update' || msg.tag === 'delete';
}

/**
 * Sends the standby status update and records it, so heartbeats can repeat the last flushed position. A service that
 * has stopped sends nothing, and then nothing is recorded: the position is still unconfirmed.
 * @returns Whether the position was sent.
 */
async function acknowledgeLsn(lsn: string): Promise<boolean> {
  // After a failure nothing more is confirmed on this subscription: a later position would pass the change that failed.
  if (replicationState.flushFailed) return false;
  if (!(await replicationState.service?.acknowledge(lsn))) return false;
  replicationState.lastAckedLsn = lsn;
  return true;
}

/** Accumulates events across transactions for micro-batching. */
const flushBuffer = new FlushBuffer(
  processFlush,
  async (lsn) => {
    await acknowledgeLsn(lsn);
  },
  RESOURCE_LIMITS.buffers.flushWindowMs,
);

/**
 * The one way a failure is handled: the subscription ends without an acknowledgement, and the next one starts at the
 * slot's confirmed position and delivers the same events again.
 */
flushBuffer.onFailed = (error, position) => {
  replicationState.recordFailure(position, error);
  void replicationState.service?.stop();
};

flushBuffer.onFlushed = () => replicationState.clearFailure();

/** Cascade suppression within a single transaction. */
const txBuffer = new TransactionBuffer((events) => flushBuffer.enqueue(events));

/** Prefix of the logical message a count from the tables writes right after its snapshot. */
export const FENCE_MARKER_PREFIX = 'sync-fence';

/** Data messages whose handler has not returned yet. */
let inFlightMessages = 0;

/** How many changes of the open transaction were received, kept or not: a change's index in its transaction. */
let changesInTransaction = 0;

/**
 * Confirms the latest keepalive position once every received message is applied and acknowledged.
 * Data acks stop at the last published row, so an idle worker would otherwise pin the slot while
 * unpublished WAL grows behind it. Transactions committed before a keepalive were streamed ahead of
 * it, so its position is safe whenever nothing is in flight.
 * @returns true when the keepalive position was acknowledged.
 */
export async function acknowledgeIdlePosition(): Promise<boolean> {
  const { lastKeepaliveLsn, lastAckedLsn } = replicationState;
  const busy = inFlightMessages > 0 || txBuffer.isBuffering || !flushBuffer.isIdle;
  if (!lastKeepaliveLsn || busy) return false;

  // The client reports lsn + 1 as flushed: one byte back confirms the keepalive position itself, never a byte of the next commit record.
  const position = lsnToBigInt(lastKeepaliveLsn) - 1n;
  if (position <= (lastAckedLsn ? lsnToBigInt(lastAckedLsn) : 0n)) return false;

  return acknowledgeLsn(formatLsn(position));
}

/**
 * Runs the idle check once the current turn is over. The replication client parses a whole socket read at once and
 * queues its data messages, so right after one handler returns the next messages can still wait in that queue while
 * the worker looks idle. They all reach their handlers before a callback of the check phase runs.
 */
const scheduleIdleCheck = (): void => {
  setImmediate(() => void acknowledgeIdlePosition());
};

flushBuffer.onDrained = scheduleIdleCheck;

/**
 * Acknowledges a message the worker has nothing to do for, when no earlier event is still waiting: a position
 * confirmed past a buffered event would lose that event in a crash. The next flush or idle check covers it otherwise.
 */
async function acknowledgeSkipped(lsn: string): Promise<void> {
  if (flushBuffer.isIdle && !txBuffer.hasPendingEvents) await acknowledgeLsn(lsn);
}

/** Buffers events between BEGIN and COMMIT, suppressing child deletes cascaded from a channel delete. */
export async function handleDataMessage(lsn: string, msg: Pgoutput.Message): Promise<void> {
  // After a failure this subscription is over: what the service still delivers is read again by the next one.
  if (replicationState.flushFailed) return;
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
  const { tag } = msg;

  if (tag === 'begin') {
    const beginMsg = msg as Pgoutput.MessageBegin;

    // How long ago the transaction committed is how far the worker is behind.
    const committedAt = commitTimeMs(beginMsg);
    if (committedAt !== null) replicationState.lagMs = Date.now() - committedAt;

    changesInTransaction = 0;
    txBuffer.onBegin(beginMsg);
    return;
  }

  if (tag === 'commit') {
    await txBuffer.onCommit();
    return;
  }

  if (tag === 'message') {
    const { prefix, content } = msg as Pgoutput.MessageMessage;
    if (prefix === FENCE_MARKER_PREFIX) {
      // The marker was written right after a count's snapshot. Once everything before it is recorded, the stream has
      // passed that snapshot.
      await flushBuffer.flush();
      if (!replicationState.flushFailed) fence.markerArrived(new TextDecoder().decode(content));
    }
    await acknowledgeSkipped(lsn);
    return;
  }

  // Skips relation, origin, type and other non-DML messages.
  if (!isDmlMessage(msg)) return;

  // Counted for every change, kept or not, so a change has the same index on every delivery.
  const index = changesInTransaction;
  changesInTransaction += 1;

  log.trace('CDC message received', { lsn, tag, table: msg.relation?.name });

  const parseResult = parseMessage(msg);
  if (!parseResult) {
    await acknowledgeSkipped(lsn);
    return;
  }

  replicationState.markEvent();

  await txBuffer.onEvent(lsn, parseResult, index);
}

/**
 * Runs `fn` exactly between two flushes: what it reads holds every flush before it and none after it, and the next
 * flush waits until it resolved.
 */
export function runBetweenFlushes<T>(fn: () => Promise<T>): Promise<T> {
  return flushBuffer.exclusive(fn);
}

/** Called during graceful shutdown. */
export async function drainBuffers(): Promise<void> {
  await flushBuffer.drain();
}

/**
 * Before every subscription: what was buffered is delivered again from the slot's confirmed position. The keepalive
 * position goes too: it belongs to the stream that ended, and can lie past what that stream never recorded.
 */
export function resetBuffers(): void {
  txBuffer.reset();
  flushBuffer.reset();
  replicationState.lastKeepaliveLsn = null;
  changesInTransaction = 0;
}
