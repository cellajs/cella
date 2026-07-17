import type { Pgoutput } from 'pg-logical-replication';

import { log } from '../lib/pino';

import { replicationState } from '../services/replication-state';
import { TransactionBuffer } from '../services/transaction-buffer';
import { FlushBuffer } from '../services/flush-buffer';
import { wsClient } from '../network/websocket-client';
import { RESOURCE_LIMITS } from '../constants';

// PostgreSQL epoch: 2000-01-01T00:00:00Z in Unix ms
const PG_EPOCH_MS = 946684800000n;

import { parseMessage } from './parse-message';
import { processEvents } from './process-events';
import { runPostCatchupRecovery } from '../services/catchup-recovery';

// Message helpers

/** Narrowed DML message type. */
type DmlMessage = Pgoutput.MessageInsert | Pgoutput.MessageUpdate | Pgoutput.MessageDelete;

/** Type guard for DML messages. */
function isDmlMessage(msg: Pgoutput.Message): msg is DmlMessage {
  return msg.tag === 'insert' || msg.tag === 'update' || msg.tag === 'delete';
}

/**
 * Extract row data from a DML message (new for INSERT/UPDATE, old for DELETE).
 */
function getMessageRow(msg: DmlMessage): Record<string, unknown> | null {
  const row = 'new' in msg ? msg.new : 'old' in msg ? msg.old : null;
  return row && typeof row === 'object' ? (row as Record<string, unknown>) : null;
}

/**
 * Check if a message is a seeded INSERT during catch-up and should be skipped.
 * Detects seeded entities by UUID prefix '00000000-' (from mockUuid in script context)
 * or the supported nanoid prefix 'gen-'.
 * Only skips inserts; updates/deletes to seeded entities must still be tracked.
 */
function isSeededInsert(msg: DmlMessage): boolean {
  if (msg.tag !== 'insert' || !replicationState.catchingUp) return false;
  const id = getMessageRow(msg)?.id;
  return typeof id === 'string' && (id.startsWith('00000000-') || id.startsWith('gen-'));
}

/**
 * Acknowledge LSN if WebSocket is connected, otherwise log a hold.
 */
async function acknowledgeLsn(lsn: string): Promise<void> {
  if (wsClient.isConnected()) {
    await replicationState.service?.acknowledge(lsn);
  } else {
    log.debug(`Holding LSN acknowledgment - WebSocket disconnected`, { lsn });
  }
}

// Buffers

/** Flush buffer: accumulates events across transactions for micro-batching */
const flushBuffer = new FlushBuffer(processEvents, acknowledgeLsn, RESOURCE_LIMITS.buffers.flushWindowMs);

/** Transaction buffer: cascade suppression within a single transaction */
const txBuffer = new TransactionBuffer((events) => flushBuffer.enqueue(events));

// Message handling

/**
 * Handle incoming replication data message.
 * Transaction-aware: buffers events between BEGIN and COMMIT, suppresses
 * cascaded child deletes when a channel entity (project/org) is deleted.
 */
export async function handleDataMessage(lsn: string, msg: Pgoutput.Message): Promise<void> {
  const { tag } = msg;

  // Transaction boundary: BEGIN
  if (tag === 'begin') {
    const beginMsg = msg as Pgoutput.MessageBegin;

    // Detect WAL lag from commit timestamp for catchup mode
    if (beginMsg.commitTime) {
      const wasCatchingUp = replicationState.catchingUp;
      const commitTimeMs = Number(beginMsg.commitTime.valueOf() / 1000n) + Number(PG_EPOCH_MS);
      const lagMs = Date.now() - commitTimeMs;
      const stillCatchingUp = replicationState.updateLag(lagMs);

      // catchup → live transition: run post-catchup recovery
      if (wasCatchingUp && !stillCatchingUp) {
        await flushBuffer.drain();
        runPostCatchupRecovery();
      }
    }

    txBuffer.onBegin(beginMsg);
    return;
  }

  // Transaction boundary: COMMIT; analyze and flush buffered events
  if (tag === 'commit') {
    try {
      await txBuffer.onCommit();
    } catch (error) {
      log.error('Error processing transaction commit', { err: error });
    }
    return;
  }

  // Skip non-DML messages (relation, origin, type, etc.)
  if (!isDmlMessage(msg)) return;

  const tableName = msg.relation?.name;

  // Early exit for seeded inserts during catch-up (UUID prefix '00000000-' or nanoid 'gen-').
  if (isSeededInsert(msg)) {
    if (wsClient.isConnected()) await replicationState.service?.acknowledge(lsn);
    return;
  }

  try {
    log.trace(`CDC message received`, { lsn, tag, table: tableName });

    const parseResult = parseMessage(msg);
    if (!parseResult) {
      await acknowledgeLsn(lsn);
      return;
    }

    replicationState.markEvent();

    // Buffer the event (or process immediately if no active transaction)
    await txBuffer.onEvent(lsn, parseResult);
  } catch (error) {
    log.error(`Error processing CDC message - LSN NOT acknowledged`, { err: error });
  }
}

/**
 * Drain all buffered events. Called during graceful shutdown.
 */
export async function drainBuffers(): Promise<void> {
  await flushBuffer.drain();
}
