import * as decoding from 'lib0/decoding';
import * as encoding from 'lib0/encoding';
import type { WebSocket } from 'ws';
import * as Y from 'yjs';
import type { DocContext } from '../constants';
import { YJS_AWARENESS_RATE_LIMIT, YJS_SAVE_DEBOUNCE_MS } from '../constants';
import { log } from '../lib/pino';
import { loadEntityDescription } from '../data/entity-content';
import { createDoc, loadState, saveState } from '../data/storage';
import { descriptionToYUpdate } from '../lib/blocknote-seed';
import { materializeState, stateToBlocksJson } from './materialize';
import { broadcastToCollab, getCollab } from './session-manager';

// y-protocols message types
const YMessage = { Sync: 0, Awareness: 1 } as const;
const YSync = { Step1: 0, Step2: 1, Update: 2 } as const;

const awarenessTimestamps = new WeakMap<WebSocket, number>();

/**
 * Per-client message buffer: queues all sync messages (reads and writes) while entity verification is pending.
 * Once verified, the buffer is flushed. If denied, it's discarded.
 */
const pendingBuffers = new WeakMap<WebSocket, { ctx: DocContext; messages: Uint8Array[] }>();

/** Queue a message for later replay, or drop if buffer is too large (safety limit). */
function bufferMessage(ws: WebSocket, ctx: DocContext, rawMessage: Uint8Array): void {
  let buf = pendingBuffers.get(ws);
  if (!buf) {
    buf = { ctx, messages: [] };
    pendingBuffers.set(ws, buf);
  }
  // Safety: cap buffer at 100 messages (~200KB typical) to prevent memory issues
  if (buf.messages.length < 100) {
    buf.messages.push(rawMessage);
  }
}

/** Flush queued messages after entity verification succeeds. Replays them through handleMessage. */
export function flushPendingBuffer(ws: WebSocket): void {
  const buf = pendingBuffers.get(ws);
  if (!buf || buf.messages.length === 0) {
    pendingBuffers.delete(ws);
    return;
  }

  const { ctx, messages } = buf;
  pendingBuffers.delete(ws);

  for (const raw of messages) {
    handleMessage(ctx, ws, raw).catch((err) => {
      log.error(`Failed to flush buffered message for ${ctx.entityType}:${ctx.entityId}`, { err: err });
    });
  }
}

/** Discard queued messages (entity verification failed or client disconnected). */
export function discardPendingBuffer(ws: WebSocket): void {
  const buf = pendingBuffers.get(ws);
  if (buf) {
    log.debug(`Discarding ${buf.messages.length} buffered messages for ${buf.ctx.entityType}:${buf.ctx.entityId}`);
  }
  pendingBuffers.delete(ws);
}

function encodeSyncStep2(update: Uint8Array): Uint8Array {
  const encoder = encoding.createEncoder();
  encoding.writeVarUint(encoder, YMessage.Sync);
  encoding.writeVarUint(encoder, YSync.Step2);
  encoding.writeVarUint8Array(encoder, update);
  return encoding.toUint8Array(encoder);
}

/** Merge two updates, falling back to the new update if merging fails (e.g. corrupted state). */
function safeMerge(existing: Uint8Array, update: Uint8Array): Uint8Array {
  try {
    return Y.mergeUpdates([existing, update]);
  } catch {
    return update;
  }
}

/**
 * Handle an incoming WebSocket message from a client. Routes based on y-protocols message type.
 * All sync messages (reads and writes) are gated on ctx.verified — buffered until async
 * entity verification completes. Awareness (cursors) is always allowed since it's ephemeral.
 */
export async function handleMessage(ctx: DocContext, ws: WebSocket, data: Uint8Array): Promise<void> {
  if (data.length < 2) return;

  const decoder = decoding.createDecoder(data);
  const messageType = decoding.readVarUint(decoder);

  if (messageType === YMessage.Sync) {
    // Gate all sync messages (reads + writes) until entity access is verified
    if (!ctx.verified) {
      bufferMessage(ws, ctx, data);
      return;
    }

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
    // Awareness (cursor positions) is always allowed — it's ephemeral and read-like
    const now = Date.now();
    const lastTime = awarenessTimestamps.get(ws) ?? 0;
    if (now - lastTime < 1000 / YJS_AWARENESS_RATE_LIMIT) return;
    awarenessTimestamps.set(ws, now);

    broadcastToCollab(ctx.entityType, ctx.entityId, data, ws);
  }
}

/**
 * Client sends state vector, server responds with missing updates.
 * Uses Y.diffUpdate to compute the diff without instantiating a full Y.Doc.
 * Merges any un-flushed pendingState so the client doesn't miss recent edits.
 */
async function handleSyncStep1(ctx: DocContext, ws: WebSocket, clientStateVector: Uint8Array): Promise<void> {
  const storedState = await loadState(ctx);

  // Merge in-memory pendingState (un-flushed updates within the debounce window)
  // so the connecting client receives the most up-to-date state.
  const collab = getCollab(ctx.entityType, ctx.entityId);
  const pending = collab?.pendingState;

  let fullState: Uint8Array | null = null;
  if (storedState && storedState.length > 0 && pending && pending.length > 0) {
    fullState = safeMerge(storedState, pending);
  } else if (pending && pending.length > 0) {
    fullState = pending;
  } else if (storedState && storedState.length > 0) {
    fullState = storedState;
  }

  // No row in DB and no pending state — fresh session. Seed the doc from the
  // entity's stored description server-side, so clients never seed (no client
  // seed race, no undo-history pollution, no markContentAsSent handshake).
  if (!fullState && storedState === null) {
    const description = await loadEntityDescription(ctx);
    const seed = descriptionToYUpdate(description);
    await createDoc(ctx, seed);
    // Re-load the canonical row: a concurrent connector (this or another instance)
    // may have won the insert with its own seed — merging two independently
    // generated seeds would duplicate content, so everyone adopts the winner's.
    const canonical = await loadState(ctx);
    if (canonical && canonical.length > 0) fullState = canonical;
  }

  // Initialize the materialization diff baseline from the state the session starts with
  // (seed or stored row), so seed-only sessions and unchanged rejoins never POST.
  const collabForBaseline = getCollab(ctx.entityType, ctx.entityId);
  if (collabForBaseline && !collabForBaseline.lastMaterializedJson && fullState && fullState.length > 0) {
    collabForBaseline.lastMaterializedJson = stateToBlocksJson(fullState) ?? undefined;
  }

  // No content to diff against — send empty doc update
  if (!fullState) {
    ws.send(encodeSyncStep2(Y.encodeStateAsUpdate(new Y.Doc())));
    return;
  }

  try {
    const diff = Y.diffUpdate(fullState, clientStateVector);
    ws.send(encodeSyncStep2(diff));
  } catch {
    // If diffUpdate fails (corrupted state), send full state
    ws.send(encodeSyncStep2(fullState));
  }
}

/** Client sends document updates. Merge into stored state and broadcast to peers. Saves are debounced. */
async function handleSyncUpdate(ctx: DocContext, ws: WebSocket, update: Uint8Array, rawMessage: Uint8Array): Promise<void> {
  broadcastToCollab(ctx.entityType, ctx.entityId, rawMessage, ws);

  const collab = getCollab(ctx.entityType, ctx.entityId);
  if (!collab) return;

  // Last writer in the save window — attribution for the debounced save + materialization
  collab.lastEditor = ctx;

  if (collab.pendingState && collab.pendingState.length > 0) {
    collab.pendingState = safeMerge(collab.pendingState, update);
  } else {
    // Use cached DB state within the debounce window to avoid redundant reads
    if (collab.cachedDbState === undefined) {
      collab.cachedDbState = await loadState(ctx);
    }
    const dbState = collab.cachedDbState;
    collab.pendingState = dbState && dbState.length > 0 ? safeMerge(dbState, update) : update;
  }

  if (collab.saveTimer) clearTimeout(collab.saveTimer);
  collab.saveTimer = setTimeout(async () => {
    if (!collab.pendingState) return;
    const snapshotToSave = collab.pendingState;
    collab.pendingState = undefined;
    // Clear cached DB state — next window should re-fetch
    collab.cachedDbState = undefined;

    const savePromise = saveState(ctx, snapshotToSave, collab.lastEditor?.userId ?? null);
    collab.savingPromise = savePromise;
    try {
      await savePromise;
      // Materialize the saved state into the entity's durable record (single writer:
      // one call per doc per save window, regardless of how many clients are typing).
      // A 'retry' failure leaves the diff baseline stale — the next save window or the
      // gated session cleanup converges it.
      await materializeState(collab, snapshotToSave);
    } catch (err) {
      log.error(`Failed to save state for ${ctx.entityType}:${ctx.entityId}`, { err: err });
      // Merge the failed snapshot with any new updates that arrived during the await
      collab.pendingState = collab.pendingState ? safeMerge(snapshotToSave, collab.pendingState) : snapshotToSave;
    } finally {
      if (collab.savingPromise === savePromise) {
        collab.savingPromise = undefined;
      }
    }
  }, YJS_SAVE_DEBOUNCE_MS);
}
