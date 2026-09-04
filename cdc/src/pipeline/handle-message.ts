import type { Pgoutput } from 'pg-logical-replication';
import { RESOURCE_LIMITS } from '../constants';
import { log } from '../lib/pino';
import { wsClient } from '../network/websocket-client';
import { FlushBuffer } from '../services/flush-buffer';
import { replicationState } from '../services/replication-state';
import { TransactionBuffer } from '../services/transaction-buffer';

// PostgreSQL epoch: 2000-01-01T00:00:00Z in Unix ms
const PG_EPOCH_MS = 946684800000n;

import { runPostCatchupRecovery } from '../services/catchup-recovery';
import { parseMessage } from './parse-message';
import { processEvents } from './process-events';

// Message helpers

type DmlMessage = Pgoutput.MessageInsert | Pgoutput.MessageUpdate | Pgoutput.MessageDelete;

function isDmlMessage(msg: Pgoutput.Message): msg is DmlMessage {
  return msg.tag === 'insert' || msg.tag === 'update' || msg.tag === 'delete';
}

/** New row for INSERT/UPDATE, old row for DELETE. */
function getMessageRow(msg: DmlMessage): Record<string, unknown> | null {
  const row = 'new' in msg ? msg.new : 'old' in msg ? msg.old : null;
  return row && typeof row === 'object' ? (row as Record<string, unknown>) : null;
}

/**
 * Seeded rows are recognized by the id prefix '00000000-' (mockUuid) or 'gen-'. Only inserts are
 * skipped: updates and deletes to seeded rows must still be tracked.
 */
function isSeededInsert(msg: DmlMessage): boolean {
  if (msg.tag !== 'insert' || !replicationState.catchingUp) return false;
  const id = getMessageRow(msg)?.id;
  return typeof id === 'string' && (id.startsWith('00000000-') || id.startsWith('gen-'));
}

/** Sends the standby status update and records it, so heartbeats can repeat the last flushed position. */
async function sendAck(lsn: string): Promise<void> {
  await replicationState.service?.acknowledge(lsn);
  replicationState.lastAckedLsn = lsn;
}

/** Acknowledgment is held while the WebSocket is disconnected. */
async function acknowledgeLsn(lsn: string): Promise<void> {
  if (wsClient.isConnected()) {
    await sendAck(lsn);
  } else {
    log.debug('Holding LSN acknowledgment - WebSocket disconnected', { lsn });
  }
}

/** Accumulates events across transactions for micro-batching. */
const flushBuffer = new FlushBuffer(processEvents, acknowledgeLsn, RESOURCE_LIMITS.buffers.flushWindowMs);

/** Cascade suppression within a single transaction. */
const txBuffer = new TransactionBuffer((events) => flushBuffer.enqueue(events));

/** Buffers events between BEGIN and COMMIT, suppressing child deletes cascaded from a channel delete. */
export async function handleDataMessage(lsn: string, msg: Pgoutput.Message): Promise<void> {
  const { tag } = msg;

  if (tag === 'begin') {
    const beginMsg = msg as Pgoutput.MessageBegin;

    if (beginMsg.commitTime) {
      const wasCatchingUp = replicationState.catchingUp;
      const commitTimeMs = Number(beginMsg.commitTime.valueOf() / 1000n) + Number(PG_EPOCH_MS);
      const lagMs = Date.now() - commitTimeMs;
      const stillCatchingUp = replicationState.updateLag(lagMs);

      // Catchup to live transition.
      if (wasCatchingUp && !stillCatchingUp) {
        await flushBuffer.drain();
        runPostCatchupRecovery();
      }
    }

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

  if (isSeededInsert(msg)) {
    if (wsClient.isConnected()) await sendAck(lsn);
    return;
  }

  try {
    log.trace('CDC message received', { lsn, tag, table: tableName });

    const parseResult = parseMessage(msg);
    if (!parseResult) {
      await acknowledgeLsn(lsn);
      return;
    }

    replicationState.markEvent();

    await txBuffer.onEvent(lsn, parseResult);
  } catch (error) {
    log.error('Error processing CDC message - LSN NOT acknowledged', { err: error });
  }
}

/** Called during graceful shutdown. */
export async function drainBuffers(): Promise<void> {
  await flushBuffer.drain();
}
