import * as decoding from 'lib0/decoding';
import * as encoding from 'lib0/encoding';
import type { WebSocket } from 'ws';
import * as Y from 'yjs';
import type { DocKey, DocScope, SocketContext } from '../constants';
import { YJS_AWARENESS_MAX_ENTRIES, YJS_AWARENESS_RATE_LIMIT, YJS_COMPACT_DEBOUNCE_MS } from '../constants';
import { loadEntityDescription } from '../data/entity-content';
import { appendUpdate, ensureDoc, loadBase, readLog } from '../data/storage';
import { descriptionToYUpdate } from '../lib/blocknote-seed';
import { log } from '../lib/pino';
import { type CompactionResult, compactDocument } from './compaction';
import { classifyUpdate, mergeLog } from './document-state';
import {
  broadcastToCollab,
  type CollabSession,
  claimAwarenessClient,
  endCollab,
  getCollab,
  withDocLock,
} from './session-manager';

/** Message types on the socket: y-websocket's sync and awareness, and the relay's own `Generation`, which must match the frontend's yjs-connections.ts. */
export const YMessage = { Sync: 0, Awareness: 1, Generation: 4 } as const;
const YSync = { Step1: 0, Step2: 1, Update: 2 } as const;

const awarenessTimestamps = new WeakMap<WebSocket, number>();

/** The frame's leading varint; null when it is cut short or out of range, on which lib0 throws. */
function readMessageType(decoder: decoding.Decoder): number | null {
  try {
    return decoding.readVarUint(decoder);
  } catch {
    return null;
  }
}

/** Message type of a raw frame, without decoding the rest; null for a frame that carries none a decoder accepts. */
export function peekMessageType(data: Uint8Array): number | null {
  return readMessageType(decoding.createDecoder(data));
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

/** The document's generation, sent before every Step1 answer: a client holding a document of another generation drops it before it merges or replies. */
function encodeGeneration(generation: string): Uint8Array {
  const encoder = encoding.createEncoder();
  encoding.writeVarUint(encoder, YMessage.Generation);
  encoding.writeVarString(encoder, generation);
  return encoding.toUint8Array(encoder);
}

/** Closes a socket whose frame the relay refuses: its client is broken or hostile, and nothing it sent reaches the log or a peer. */
export function refuseFrame(doc: DocKey, userId: string, ws: WebSocket, reason = 'Malformed update'): void {
  log.warn(`${reason} refused for ${doc.entityType}:${doc.entityId}`, { userId });
  ws.close(4400, reason);
}

/** One entry of an awareness update, as y-protocols encodes it; `state` is its JSON text. */
interface AwarenessEntry {
  clientId: number;
  clock: number;
  state: string;
}

/** The entries of an awareness update; null, before any is decoded, for one with more than YJS_AWARENESS_MAX_ENTRIES. */
function decodeAwarenessEntries(update: Uint8Array): AwarenessEntry[] | null {
  const decoder = decoding.createDecoder(update);
  const count = decoding.readVarUint(decoder);
  if (count > YJS_AWARENESS_MAX_ENTRIES) return null;
  const entries: AwarenessEntry[] = [];
  for (let i = 0; i < count; i++) {
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
  const messageType = readMessageType(decoder);
  if (messageType === null) return refuseFrame(scope ?? ctx.requested, ctx.userId, ws, 'Malformed frame');

  if (messageType === YMessage.Sync) {
    if (!scope) return;

    let syncType: number;
    let payload: Uint8Array;
    try {
      syncType = decoding.readVarUint(decoder);
      payload = decoding.readVarUint8Array(decoder);
    } catch {
      refuseFrame(scope, ctx.userId, ws);
      return;
    }

    if (syncType === YSync.Step1) {
      log.trace(`Sync step 1 from ${scope.entityType}:${scope.entityId}`, { bytes: data.length });
      await handleSyncStep1(ctx, scope, ws, payload);
    } else if (syncType === YSync.Step2) {
      ctx.awaitingReply = false;
      await handleSyncUpdate(scope, ctx.userId, ws, payload, data);
    } else if (syncType === YSync.Update) {
      // Sent before the client read the relay's answer: its reply carries what the relay lacks, and a client about to
      // drop its document for another generation must log nothing of it.
      if (ctx.awaitingReply) return;
      await handleSyncUpdate(scope, ctx.userId, ws, payload, data);
    }
  } else if (messageType === YMessage.Awareness) {
    if (!scope || ws.readyState !== ws.OPEN) return;
    const collab = getCollab(scope);
    if (!collab?.clients.has(ws)) return;
    const now = Date.now();
    const lastTime = awarenessTimestamps.get(ws) ?? 0;
    if (now - lastTime < 1000 / YJS_AWARENESS_RATE_LIMIT) return;
    awarenessTimestamps.set(ws, now);

    let entries: AwarenessEntry[] | null;
    try {
      entries = decodeAwarenessEntries(decoding.readVarUint8Array(decoder));
    } catch {
      refuseFrame(scope, ctx.userId, ws, 'Malformed awareness');
      return;
    }
    // A frame with more entries than a client announces reaches no peer and holds no client.
    if (!entries) return;
    // Presence for another user's client would move or remove their cursor.
    const relayed: AwarenessEntry[] = [];
    for (const entry of entries) {
      const verdict = claimAwarenessClient(collab, ws, ctx.userId, {
        clientId: entry.clientId,
        removes: entry.state === 'null',
      });
      if (verdict === 'refuse') return refuseFrame(scope, ctx.userId, ws, 'Too many awareness clients');
      if (verdict === 'relay') relayed.push(entry);
    }
    if (relayed.length === 0) return;
    broadcastToCollab(scope, relayed.length === entries.length ? data : encodeAwarenessMessage(relayed), ws);
  }
}

/**
 * The document as the session knows it: the document row (seeded on first sight, under a new generation) plus every
 * logged update that merges; compaction discards the rest. Null once the document was retired under the session (its
 * row gone, or reseeded by another relay): the session ends, and its sockets reconnect into one that seeds afresh.
 */
async function loadDocumentState(
  collab: CollabSession,
): Promise<{ state: Uint8Array | null; generation: string } | null> {
  const { scope } = collab;
  let base = await loadBase(scope);
  if (collab.generation !== null && base?.generation !== collab.generation) {
    endCollab(collab);
    return null;
  }
  // Fresh document: the server seeds from the stored description, so clients never seed it.
  base ??= await ensureDoc(scope, descriptionToYUpdate(await loadEntityDescription(scope)));
  collab.generation = base.generation;
  return { state: mergeLog(base.state, await readLog(scope)).state, generation: base.generation };
}

/**
 * Tells the client the document's generation, answers its state vector with what it lacks, then asks for what the
 * relay lacks: y-websocket answers a Step1 with a Step2 on its own, so structs the client holds and the relay never
 * received (a lost frame, a reconnect) are uploaded and logged like any update. Until that reply, the socket's
 * updates are dropped.
 */
async function handleSyncStep1(
  ctx: SocketContext,
  scope: DocScope,
  ws: WebSocket,
  clientStateVector: Uint8Array,
): Promise<void> {
  // A socket that closed while this frame waited has no one to answer.
  if (ws.readyState !== ws.OPEN) return;
  const collab = getCollab(scope);
  if (!collab?.clients.has(ws)) return endSocket(scope, ws);
  const doc = await withDocLock(collab, () => loadDocumentState(collab));
  if (!doc || ws.readyState !== ws.OPEN) return;

  ws.send(encodeGeneration(doc.generation));
  ctx.awaitingReply = true;
  if (!doc.state) {
    ws.send(encodeSyncStep2(Y.encodeStateAsUpdate(new Y.Doc())));
    ws.send(encodeSyncStep1(Y.encodeStateVector(new Y.Doc())));
    return;
  }

  try {
    ws.send(encodeSyncStep2(Y.diffUpdate(doc.state, clientStateVector)));
    ws.send(encodeSyncStep1(Y.encodeStateVectorFromUpdate(doc.state)));
  } catch {
    // Corrupted state: fall back to the full state and skip the pull.
    ws.send(encodeSyncStep2(doc.state));
    ctx.awaitingReply = false;
  }
}

/** Closes a socket whose session ended under it (its document retired): it reconnects and handshakes again, and what it holds that is still valid comes with its reply. */
function endSocket(scope: DocScope, ws: WebSocket): void {
  log.warn(`No session for ${scope.entityType}:${scope.entityId}: socket asked to reconnect`);
  ws.close(1013, 'Session ended');
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
  if (kind === 'malformed') return refuseFrame(scope, userId, ws);

  const collab = getCollab(scope);
  // A socket of an ended session must not log into a newer session of its document: the update may be of a retired
  // generation, and one still valid comes with the reply of its next handshake.
  if (!collab?.clients.has(ws)) return endSocket(scope, ws);

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

/** Compacts under the document lock; a thrown error counts as retryable and leaves the log in place. A retired document ends the session. */
export async function runCompaction(collab: CollabSession): Promise<CompactionResult> {
  return withDocLock(collab, async () => {
    try {
      const result = await compactDocument(collab.scope);
      if (result === 'retired') endCollab(collab);
      return result;
    } catch (err) {
      log.error(`Compaction failed for ${collab.scope.entityType}:${collab.scope.entityId}`, { err });
      return 'retry';
    }
  });
}
