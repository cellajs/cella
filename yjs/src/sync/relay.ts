import * as decoding from 'lib0/decoding';
import * as encoding from 'lib0/encoding';
import type { WebSocket } from 'ws';
import * as Y from 'yjs';
import type { DocScope, SocketContext } from '../constants';
import { YJS_AWARENESS_RATE_LIMIT, YJS_COMPACT_DEBOUNCE_MS } from '../constants';
import { loadEntityDescription } from '../data/entity-content';
import { appendUpdate, ensureDoc, loadBase, readLog } from '../data/storage';
import { descriptionToYUpdate } from '../lib/blocknote-seed';
import { log } from '../lib/pino';
import { type CompactionResult, compactDocument } from './compaction';
import { classifyUpdate, mergeLog } from './document-state';
import { broadcastToCollab, type CollabSession, claimAwarenessClient, getCollab, withDocLock } from './session-manager';

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

/** Closes a socket whose frame no decoder accepts: its client is broken or hostile, and nothing it sent reaches the log or a peer. */
function refuseMalformed(scope: DocScope, userId: string, ws: WebSocket, reason = 'Malformed update'): void {
  log.warn(`${reason} refused for ${scope.entityType}:${scope.entityId}`, { userId });
  ws.close(4400, reason);
}

/** One entry of an awareness update, as y-protocols encodes it; `state` is its JSON text. */
interface AwarenessEntry {
  clientId: number;
  clock: number;
  state: string;
}

function decodeAwarenessEntries(update: Uint8Array): AwarenessEntry[] {
  const decoder = decoding.createDecoder(update);
  const entries: AwarenessEntry[] = [];
  for (let count = decoding.readVarUint(decoder); count > 0; count--) {
    entries.push({
      clientId: decoding.readVarUint(decoder),
      clock: decoding.readVarUint(decoder),
      state: decoding.readVarString(decoder),
    });
  }
  return entries;
}

function encodeAwarenessMessage(entries: AwarenessEntry[]): Uint8Array {
  const update = encoding.createEncoder();
  encoding.writeVarUint(update, entries.length);
  for (const { clientId, clock, state } of entries) {
    encoding.writeVarUint(update, clientId);
    encoding.writeVarUint(update, clock);
    encoding.writeVarString(update, state);
  }
  const encoder = encoding.createEncoder();
  encoding.writeVarUint(encoder, YMessage.Awareness);
  encoding.writeVarUint8Array(encoder, encoding.toUint8Array(update));
  return encoding.toUint8Array(encoder);
}

/**
 * Applies one frame. Sync frames reach this only through the socket's serial queue, after entity
 * authorization, so they run in arrival order; awareness is ephemeral, relayed only from an
 * authorized open socket and rate limited per client. Both act in the socket's authorized scope.
 */
export async function handleMessage(ctx: SocketContext, ws: WebSocket, data: Uint8Array): Promise<void> {
  if (data.length < 2) return;
  const { scope } = ctx;

  const decoder = decoding.createDecoder(data);
  const messageType = decoding.readVarUint(decoder);

  if (messageType === YMessage.Sync) {
    if (!scope) return;

    let syncType: number;
    let payload: Uint8Array;
    try {
      syncType = decoding.readVarUint(decoder);
      payload = decoding.readVarUint8Array(decoder);
    } catch {
      refuseMalformed(scope, ctx.userId, ws);
      return;
    }

    if (syncType === YSync.Step1) {
      log.trace(`Sync step 1 from ${scope.entityType}:${scope.entityId}`, { bytes: data.length });
      await handleSyncStep1(scope, ws, payload);
    } else if (syncType === YSync.Step2 || syncType === YSync.Update) {
      await handleSyncUpdate(scope, ctx.userId, ws, payload, data);
    }
  } else if (messageType === YMessage.Awareness) {
    if (!scope || ws.readyState !== ws.OPEN) return;
    const collab = getCollab(scope);
    if (!collab) return;
    const now = Date.now();
    const lastTime = awarenessTimestamps.get(ws) ?? 0;
    if (now - lastTime < 1000 / YJS_AWARENESS_RATE_LIMIT) return;
    awarenessTimestamps.set(ws, now);

    let entries: AwarenessEntry[];
    try {
      entries = decodeAwarenessEntries(decoding.readVarUint8Array(decoder));
    } catch {
      refuseMalformed(scope, ctx.userId, ws, 'Malformed awareness');
      return;
    }
    // Presence for another user's client would show a cursor under their name, or remove theirs.
    const own = entries.filter((entry) => claimAwarenessClient(collab, ws, ctx.userId, entry.clientId));
    if (own.length === 0) return;
    broadcastToCollab(scope, own.length === entries.length ? data : encodeAwarenessMessage(own), ws);
  }
}

/** The document as the relay knows it: the session row (seeded on first sight) plus every logged update that merges; compaction discards the rest. */
async function loadDocumentState(scope: DocScope): Promise<Uint8Array | null> {
  let base = await loadBase(scope);
  if (base === null) {
    // Fresh session: the server seeds from the stored description, so clients never seed it.
    base = await ensureDoc(scope, descriptionToYUpdate(await loadEntityDescription(scope)));
  }
  return mergeLog(base, await readLog(scope)).state;
}

/**
 * Answers a client state vector with what it lacks, then asks for what the relay lacks: y-websocket
 * answers a Step1 with a Step2 on its own, so structs the client holds and the relay never received
 * (a lost frame, a reconnect) are uploaded and logged like any update.
 */
async function handleSyncStep1(scope: DocScope, ws: WebSocket, clientStateVector: Uint8Array): Promise<void> {
  // A socket that closed while this frame waited has no one to answer.
  if (ws.readyState !== ws.OPEN) return;
  const collab = getCollab(scope);
  const state = collab ? await withDocLock(collab, () => loadDocumentState(scope)) : await loadDocumentState(scope);

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

/** Logs the update durably under its sender, then broadcasts it to peers and schedules compaction; one Yjs cannot decode closes its sender. */
async function handleSyncUpdate(
  scope: DocScope,
  userId: string,
  ws: WebSocket,
  update: Uint8Array,
  rawMessage: Uint8Array,
): Promise<void> {
  const kind = classifyUpdate(update);
  // A client's Step2 reply carries nothing when it holds nothing the relay lacks.
  if (kind === 'empty') return;
  // Logged, it would break every later merge of the document.
  if (kind === 'malformed') return refuseMalformed(scope, userId, ws);

  const collab = getCollab(scope);
  if (!collab) {
    // A joined socket always finds its session. Should it not, the update is still logged, and the socket reconnects
    // into a live session, where its handshake uploads anything else it holds.
    await appendUpdate(scope, userId, update);
    log.warn(`No session for ${scope.entityType}:${scope.entityId}: update logged, socket asked to reconnect`);
    ws.close(1013, 'Session ended');
    return;
  }

  await appendUpdate(scope, userId, update);
  broadcastToCollab(scope, rawMessage, ws);
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
      return await compactDocument(collab.scope);
    } catch (err) {
      log.error(`Compaction failed for ${collab.scope.entityType}:${collab.scope.entityId}`, { err });
      return 'retry';
    }
  });
}
