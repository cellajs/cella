import * as decoding from 'lib0/decoding';
import * as encoding from 'lib0/encoding';
import type { WebSocket } from 'ws';
import * as Y from 'yjs';
import type { DocContext } from '../constants';
import { YJS_AWARENESS_RATE_LIMIT, YJS_SAVE_DEBOUNCE_MS } from '../constants';
import { loadEntityDescription } from '../data/entity-content';
import { createDoc, loadState, saveState } from '../data/storage';
import { descriptionToYUpdate } from '../lib/blocknote-seed';
import { log } from '../lib/pino';
import { materializeState, stateToBlocksJson } from './materialize';
import { broadcastToCollab, getCollab } from './session-manager';

const YMessage = { Sync: 0, Awareness: 1 } as const;
const YSync = { Step1: 0, Step2: 1, Update: 2 } as const;

const awarenessTimestamps = new WeakMap<WebSocket, number>();

/** Sync messages queued per client while entity verification is pending: replayed once verified, dropped if denied. */
const pendingBuffers = new WeakMap<WebSocket, { ctx: DocContext; messages: Uint8Array[] }>();

function bufferMessage(ws: WebSocket, ctx: DocContext, rawMessage: Uint8Array): void {
  let buf = pendingBuffers.get(ws);
  if (!buf) {
    buf = { ctx, messages: [] };
    pendingBuffers.set(ws, buf);
  }
  // Cap the queue to bound memory per connection.
  if (buf.messages.length < 100) {
    buf.messages.push(rawMessage);
  }
}

export function releaseBufferedMessages(ws: WebSocket): void {
  const buf = pendingBuffers.get(ws);
  if (!buf || buf.messages.length === 0) {
    pendingBuffers.delete(ws);
    return;
  }

  const { ctx, messages } = buf;
  pendingBuffers.delete(ws);

  for (const raw of messages) {
    handleMessage(ctx, ws, raw).catch((err) => {
      log.error(`Failed to apply buffered message for ${ctx.entityType}:${ctx.entityId}`, { err: err });
    });
  }
}

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

/** Falls back to the new update when the merge throws on corrupted state. */
function safeMerge(existing: Uint8Array, update: Uint8Array): Uint8Array {
  try {
    return Y.mergeUpdates([existing, update]);
  } catch {
    return update;
  }
}

/** Sync messages are gated on ctx.verified and buffered until entity verification completes; awareness is ephemeral and always allowed. */
export async function handleMessage(ctx: DocContext, ws: WebSocket, data: Uint8Array): Promise<void> {
  if (data.length < 2) return;

  const decoder = decoding.createDecoder(data);
  const messageType = decoding.readVarUint(decoder);

  if (messageType === YMessage.Sync) {
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
    const now = Date.now();
    const lastTime = awarenessTimestamps.get(ws) ?? 0;
    if (now - lastTime < 1000 / YJS_AWARENESS_RATE_LIMIT) return;
    awarenessTimestamps.set(ws, now);

    broadcastToCollab(ctx.entityType, ctx.entityId, data, ws);
  }
}

/** Answers a client state vector with the missing updates, diffed without instantiating a Y.Doc. */
async function handleSyncStep1(ctx: DocContext, ws: WebSocket, clientStateVector: Uint8Array): Promise<void> {
  const storedState = await loadState(ctx);

  // Merge un-flushed pendingState so a connecting client does not miss edits inside the debounce window.
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

  // The durable entity description anchors both the fresh-session seed and the materialize baseline below.
  let durableDescription: string | null | undefined;
  const getDurableDescription = async () => {
    if (durableDescription === undefined) durableDescription = await loadEntityDescription(ctx);
    return durableDescription;
  };

  // Fresh session: the server seeds the doc from the stored description so clients never seed it.
  if (!fullState && storedState === null) {
    const seed = descriptionToYUpdate(await getDurableDescription());
    await createDoc(ctx, seed);
    // A concurrent connector may have won the insert; adopt its row, since merging two seeds duplicates content.
    const canonical = await loadState(ctx);
    if (canonical && canonical.length > 0) fullState = canonical;
  }

  // Anchor the materialize baseline on the durable description, never on yjs_documents.state: the two stores can diverge, and a Y.Doc-anchored baseline would suppress the corrective write forever.
  const collabForBaseline = getCollab(ctx.entityType, ctx.entityId);
  if (collabForBaseline && !collabForBaseline.lastMaterializedJson) {
    const durableState = descriptionToYUpdate(await getDurableDescription());
    if (durableState) collabForBaseline.lastMaterializedJson = stateToBlocksJson(durableState) ?? undefined;
  }

  if (!fullState) {
    ws.send(encodeSyncStep2(Y.encodeStateAsUpdate(new Y.Doc())));
    return;
  }

  try {
    const diff = Y.diffUpdate(fullState, clientStateVector);
    ws.send(encodeSyncStep2(diff));
  } catch {
    // Corrupted state: fall back to the full state.
    ws.send(encodeSyncStep2(fullState));
  }
}

/** Merges a client update into stored state, broadcasts it to peers, and debounces the save. */
async function handleSyncUpdate(
  ctx: DocContext,
  ws: WebSocket,
  update: Uint8Array,
  rawMessage: Uint8Array,
): Promise<void> {
  broadcastToCollab(ctx.entityType, ctx.entityId, rawMessage, ws);

  const collab = getCollab(ctx.entityType, ctx.entityId);
  if (!collab) return;

  // The last writer in the save window supplies the user id for the durable entity update.
  collab.lastEditor = ctx;

  if (collab.pendingState && collab.pendingState.length > 0) {
    collab.pendingState = safeMerge(collab.pendingState, update);
  } else {
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
    collab.cachedDbState = undefined;

    const savePromise = saveState(ctx, snapshotToSave, collab.lastEditor?.userId ?? null);
    collab.savingPromise = savePromise;
    try {
      await savePromise;
      // Runs once per document per save window; a failure leaves the baseline stale so the next save converges it.
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
