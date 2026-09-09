import * as decoding from 'lib0/decoding';
import * as encoding from 'lib0/encoding';
import type { WebSocket } from 'ws';
import * as Y from 'yjs';
import type { DocContext } from '../constants';
import { YJS_AWARENESS_RATE_LIMIT, YJS_COMPACT_DEBOUNCE_MS } from '../constants';
import { loadEntityDescription } from '../data/entity-content';
import { appendUpdate, ensureDoc, loadBase, readLog } from '../data/storage';
import { descriptionToYUpdate } from '../lib/blocknote-seed';
import { log } from '../lib/pino';
import { type CompactionResult, compactDocument } from './compaction';
import { isEmptyUpdate, mergeState } from './document-state';
import { broadcastToCollab, type CollabSession, getCollab, withDocLock } from './session-manager';

export const YMessage = { Sync: 0, Awareness: 1 } as const;
const YSync = { Step1: 0, Step2: 1, Update: 2 } as const;

const awarenessTimestamps = new WeakMap<WebSocket, number>();

/** Message type of a raw frame, without decoding the rest; null for a frame too short to carry one. */
export function peekMessageType(data: Uint8Array): number | null {
  if (data.length < 2) return null;
  return decoding.readVarUint(decoding.createDecoder(data));
}

function encodeSyncStep2(update: Uint8Array): Uint8Array {
  const encoder = encoding.createEncoder();
  encoding.writeVarUint(encoder, YMessage.Sync);
  encoding.writeVarUint(encoder, YSync.Step2);
  encoding.writeVarUint8Array(encoder, update);
  return encoding.toUint8Array(encoder);
}

function encodeSyncStep1(stateVector: Uint8Array): Uint8Array {
  const encoder = encoding.createEncoder();
  encoding.writeVarUint(encoder, YMessage.Sync);
  encoding.writeVarUint(encoder, YSync.Step1);
  encoding.writeVarUint8Array(encoder, stateVector);
  return encoding.toUint8Array(encoder);
}

/**
 * Applies one frame. Sync frames reach this only through the socket's serial queue, after entity
 * verification, so they run in arrival order; awareness is ephemeral, allowed before verification
 * and rate limited per client.
 */
export async function handleMessage(ctx: DocContext, ws: WebSocket, data: Uint8Array): Promise<void> {
  if (data.length < 2) return;

  const decoder = decoding.createDecoder(data);
  const messageType = decoding.readVarUint(decoder);

  if (messageType === YMessage.Sync) {
    if (!ctx.verified) return;

    const syncType = decoding.readVarUint(decoder);

    if (syncType === YSync.Step1) {
      log.trace(`Sync step 1 from ${ctx.entityType}:${ctx.entityId}`, { bytes: data.length });
      const clientStateVector = decoding.readVarUint8Array(decoder);
      await handleSyncStep1(ctx, ws, clientStateVector);
    } else if (syncType === YSync.Step2 || syncType === YSync.Update) {
      const update = decoding.readVarUint8Array(decoder);
      await handleSyncUpdate(ctx, ws, update, data);
    }
  } else if (messageType === YMessage.Awareness) {
    const now = Date.now();
    const lastTime = awarenessTimestamps.get(ws) ?? 0;
    if (now - lastTime < 1000 / YJS_AWARENESS_RATE_LIMIT) return;
    awarenessTimestamps.set(ws, now);

    broadcastToCollab(ctx.entityType, ctx.entityId, data, ws);
  }
}

/** The document as the relay knows it: the session row (seeded on first sight) plus every logged update, merged once. */
async function loadDocumentState(ctx: DocContext): Promise<Uint8Array | null> {
  let base = await loadBase(ctx);
  if (base === null) {
    // Fresh session: the server seeds from the stored description, so clients never seed it.
    base = await ensureDoc(ctx, descriptionToYUpdate(await loadEntityDescription(ctx)));
  }
  const rows = await readLog(ctx);
  return mergeState(
    base,
    rows.map((row) => row.payload),
  );
}

/**
 * Answers a client state vector with what it lacks, then asks for what the relay lacks: y-websocket
 * answers a Step1 with a Step2 on its own, so structs the client holds and the relay never received
 * (a lost frame, a reconnect) are uploaded and logged like any update.
 */
async function handleSyncStep1(ctx: DocContext, ws: WebSocket, clientStateVector: Uint8Array): Promise<void> {
  const collab = getCollab(ctx.entityType, ctx.entityId);
  const state = collab ? await withDocLock(collab, () => loadDocumentState(ctx)) : await loadDocumentState(ctx);

  if (!state) {
    ws.send(encodeSyncStep2(Y.encodeStateAsUpdate(new Y.Doc())));
    ws.send(encodeSyncStep1(Y.encodeStateVector(new Y.Doc())));
    return;
  }

  try {
    ws.send(encodeSyncStep2(Y.diffUpdate(state, clientStateVector)));
    ws.send(encodeSyncStep1(Y.encodeStateVectorFromUpdate(state)));
  } catch {
    // Corrupted state: fall back to the full state and skip the pull.
    ws.send(encodeSyncStep2(state));
  }
}

/** Logs the update durably, then broadcasts it to peers and schedules compaction. */
async function handleSyncUpdate(
  ctx: DocContext,
  ws: WebSocket,
  update: Uint8Array,
  rawMessage: Uint8Array,
): Promise<void> {
  // A client's Step2 reply carries nothing when it holds nothing the relay lacks.
  if (isEmptyUpdate(update)) return;

  const collab = getCollab(ctx.entityType, ctx.entityId);
  if (!collab) return;

  await appendUpdate(ctx, update);
  broadcastToCollab(ctx.entityType, ctx.entityId, rawMessage, ws);
  scheduleCompaction(collab);
}

/** One compaction per quiet window; a new update restarts the wait. */
export function scheduleCompaction(collab: CollabSession): void {
  if (collab.compactTimer) clearTimeout(collab.compactTimer);
  collab.compactTimer = setTimeout(() => {
    collab.compactTimer = undefined;
    void runCompaction(collab);
  }, YJS_COMPACT_DEBOUNCE_MS);
}

/** Compacts under the document lock; a thrown error counts as retryable and leaves the log in place. */
export async function runCompaction(collab: CollabSession): Promise<CompactionResult> {
  return withDocLock(collab, async () => {
    try {
      return await compactDocument(collab.ctx);
    } catch (err) {
      log.error(`Compaction failed for ${collab.ctx.entityType}:${collab.ctx.entityId}`, { err });
      return 'retry';
    }
  });
}
