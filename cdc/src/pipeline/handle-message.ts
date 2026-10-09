import type { Pgoutput } from 'pg-logical-replication';
import { RESOURCE_LIMITS } from '../constants';
import { log } from '../lib/pino';
import { wsClient } from '../network/websocket-client';
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
 */
async function sendAck(lsn: string): Promise<void> {
  if (!(await replicationState.service?.acknowledge(lsn))) return;
  replicationState.lastAckedLsn = lsn;
  replicationState.heldAckLsn = null;
}

/** Acknowledgment is held while the WebSocket is disconnected. */
async function acknowledgeLsn(lsn: string): Promise<void> {
  if (wsClient.isConnected()) {
    await sendAck(lsn);
  } else {
    replicationState.heldAckLsn = lsn;
    log.debug('Holding LSN acknowledgment - WebSocket disconnected', { lsn });
  }
}

/** Accumulates events across transactions for micro-batching. */
const flushBuffer = new FlushBuffer(processFlush, acknowledgeLsn, RESOURCE_LIMITS.buffers.flushWindowMs);

/** A failed flush ends the subscription: the next one starts at the slot's confirmed position and delivers its events again. */
flushBuffer.onFailed = () => {
  replicationState.flushFailed = true;
  void replicationState.service?.stop();
};

/** Cascade suppression within a single transaction. */
const txBuffer = new TransactionBuffer((events) => flushBuffer.enqueue(events));

/** Data messages whose handler has not returned yet. */
let inFlightMessages = 0;

/**
 * The LSN of the last change received and its position among the changes at that LSN. One WAL record can hold several
 * rows (a COPY writes a page of them at once), and each of those arrives with the record's LSN.
 */
const lastChange = { lsn: '', ordinal: 0 };

/**
 * Confirms the latest keepalive position once every received message is applied and acknowledged.
 * Data acks stop at the last published row, so an idle worker would otherwise pin the slot while
 * unpublished WAL grows behind it. Transactions committed before a keepalive were streamed ahead of
 * it, so its position is safe whenever nothing is in flight or withheld.
 * @returns true when the keepalive position was acknowledged.
 */
export async function acknowledgeIdlePosition(): Promise<boolean> {
  const { lastKeepaliveLsn, lastAckedLsn, heldAckLsn } = replicationState;
  const busy = inFlightMessages > 0 || txBuffer.isBuffering || !flushBuffer.isIdle;
  if (!lastKeepaliveLsn || heldAckLsn || busy || !wsClient.isConnected()) return false;

  // The client reports lsn + 1 as flushed: one byte back confirms the keepalive position itself, never a byte of the next commit record.
  const position = lsnToBigInt(lastKeepaliveLsn) - 1n;
  if (position <= (lastAckedLsn ? lsnToBigInt(lastAckedLsn) : 0n)) return false;

  await sendAck(formatLsn(position));
  return true;
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
 * Sends the acknowledgment withheld while the WebSocket was down. Without it the slot stays pinned
 * until the next published change, and the idle check never runs past a held position.
 */
export async function releaseHeldAck(): Promise<void> {
  const { heldAckLsn } = replicationState;
  if (heldAckLsn && wsClient.isConnected()) await sendAck(heldAckLsn);
  await acknowledgeIdlePosition();
}

/**
 * Acknowledges a message the worker has nothing to do for, when no earlier event is still waiting: a position
 * confirmed past a buffered event would lose that event in a crash. The next flush or idle check covers it otherwise.
 */
async function acknowledgeSkipped(lsn: string): Promise<void> {
  if (flushBuffer.isIdle && !txBuffer.hasPendingEvents) await acknowledgeLsn(lsn);
}

/** Buffers events between BEGIN and COMMIT, suppressing child deletes cascaded from a channel delete. */
export async function handleDataMessage(lsn: string, msg: Pgoutput.Message): Promise<void> {
  inFlightMessages += 1;
  try {
    await applyDataMessage(lsn, msg);
  } finally {
    inFlightMessages -= 1;
    if (inFlightMessages === 0) scheduleIdleCheck();
  }
}

async function applyDataMessage(lsn: string, msg: Pgoutput.Message): Promise<void> {
  const { tag } = msg;

  if (tag === 'begin') {
    const beginMsg = msg as Pgoutput.MessageBegin;

    // How long ago the transaction committed is how far the worker is behind. Health reports it; every change is
    // recorded the same way whatever the lag.
    const committedAt = commitTimeMs(beginMsg);
    if (committedAt !== null) replicationState.updateLag(Date.now() - committedAt);

    txBuffer.onBegin(beginMsg);
    return;
  }

  if (tag === 'commit') {
    try {
      await txBuffer.onCommit();
    } catch (error) {
      log.error('Error processing transaction commit', { err: error });
    }
    return;
  }

  // Skips relation, origin, type and other non-DML messages.
  if (!isDmlMessage(msg)) return;

  const tableName = msg.relation?.name;

  // Counted for every change, kept or not, so a change has the same ordinal on every delivery.
  lastChange.ordinal = lsn === lastChange.lsn ? lastChange.ordinal + 1 : 0;
  lastChange.lsn = lsn;

  try {
    log.trace('CDC message received', { lsn, tag, table: tableName });

    const parseResult = parseMessage(msg);
    if (!parseResult) {
      await acknowledgeSkipped(lsn);
      return;
    }

    replicationState.markEvent();

    await txBuffer.onEvent(lsn, parseResult, lastChange.ordinal);
  } catch (error) {
    log.error('Error processing CDC message - LSN NOT acknowledged', { err: error });
  }
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
  lastChange.lsn = '';
  lastChange.ordinal = 0;
}
