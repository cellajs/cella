import * as decoding from 'lib0/decoding';
import * as encoding from 'lib0/encoding';
import type { WebSocket } from 'ws';
import * as Y from 'yjs';
import { z } from 'zod';
import { maxLength } from '#/db/utils/constraints';
import { descriptionToSeedOrEmpty } from '#/modules/yjs/helpers/description-update';
import type { LogNotice, LogRow, YjsDocKey, YjsDocScope } from '#/modules/yjs/helpers/yjs-log';
import { classifyUpdate, mergeLog } from '#/modules/yjs/helpers/yjs-state';
import { docKey, yjsAwarenessMaxEntries, yjsAwarenessRateLimit, yjsCompactDebounceMs, yjsCompactMaxWaitMs, yjsMessageTypes } from '../constants';
import { appendUpdate, findDocument, findLog, seedDocument } from '../data/storage';
import { log } from '../lib/pino';
import type { SocketContext } from '../server/upgrade';
import { type CompactionResult, compactDocument } from './compaction';
import {
  broadcastToCollab,
  type CollabSession,
  claimAwarenessClient,
  endCollab,
  getCollab,
  getCollabs,
  leaveCollab,
  setUnseenRowHandler,
  withDocumentLock,
} from './session-manager';

/** y-protocols' sync subtypes: the handshake's two steps and a live update. */
const yjsSyncSubtypes = { Step1: 0, Step2: 1, Update: 2 } as const;

const savedFrame = encoding.encode((encoder) => encoding.writeVarUint(encoder, yjsMessageTypes.Saved));

/** Milliseconds between two awareness frames a socket relays. */
const awarenessWindowMs = 1000 / yjsAwarenessRateLimit;

/** A socket's awareness rate window: what it sent inside the window waits here and is relayed as one frame when the window ends. */
interface AwarenessWindow {
  /** When the socket last relayed a frame, epoch ms; 0 before its first. */
  relayedAt: number;
  /** The latest entry per client id among the frames held back. */
  held: Map<number, AwarenessEntry>;
  timer?: ReturnType<typeof setTimeout>;
}

const awarenessWindows = new WeakMap<WebSocket, AwarenessWindow>();

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

/** y-websocket's sync message: a Step1 carries a state vector, a Step2 or an Update a Yjs update. */
function encodeSync(subtype: (typeof yjsSyncSubtypes)[keyof typeof yjsSyncSubtypes], payload: Uint8Array): Uint8Array {
  const encoder = encoding.createEncoder();
  encoding.writeVarUint(encoder, yjsMessageTypes.Sync);
  encoding.writeVarUint(encoder, subtype);
  encoding.writeVarUint8Array(encoder, payload);
  return encoding.toUint8Array(encoder);
}

/**
 * The document's generation, sent before every Step1 answer: a client holding a document of another generation drops
 * it before it merges or replies.
 */
function encodeGeneration(generation: string): Uint8Array {
  const encoder = encoding.createEncoder();
  encoding.writeVarUint(encoder, yjsMessageTypes.Generation);
  encoding.writeVarString(encoder, generation);
  return encoding.toUint8Array(encoder);
}

/** Tells a socket that one more of its Step2 or Update frames was handled; a socket that closed meanwhile is told nothing. */
function sendSaved(ws: WebSocket): void {
  if (ws.readyState === ws.OPEN) ws.send(savedFrame);
}

/** Closes a socket whose frame the relay refuses: its client is broken or hostile, and nothing it sent reaches the log or a peer. */
export function refuseFrame(doc: YjsDocKey, userId: string, ws: WebSocket, reason = 'Malformed update'): void {
  log.warn(`${reason} refused for ${docKey(doc)}`, { userId });
  ws.close(4400, reason);
}

/** One entry of an awareness update, as y-protocols encodes it; `state` is its JSON text. */
interface AwarenessEntry {
  clientId: number;
  clock: number;
  state: string;
}

/** The entries of an awareness update; null, before any is decoded, for one with more than yjsAwarenessMaxEntries. */
function decodeAwarenessEntries(update: Uint8Array): AwarenessEntry[] | null {
  const decoder = decoding.createDecoder(update);
  const count = decoding.readVarUint(decoder);
  if (count > yjsAwarenessMaxEntries) return null;
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

/**
 * Presence a peer may receive: a removal, or a state whose `user` (absent until the editor mounts) has a name and a
 * `#rrggbb` colour. Every peer's editor writes the colour into a `style` attribute and the selection's `cssText`, so any
 * other value would paint over their page or load an image from it.
 */
const presenceStateSchema = z.union([
  z.null(),
  z.object({ user: z.object({ name: z.string().max(maxLength.field), color: z.string().regex(/^#[0-9a-f]{6}$/i) }).optional() }),
]);

/** Whether an entry's JSON state is presence a peer may render. */
function isRelayablePresence(state: string): boolean {
  try {
    return presenceStateSchema.safeParse(JSON.parse(state)).success;
  } catch {
    return false;
  }
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
  encoding.writeVarUint(encoder, yjsMessageTypes.Awareness);
  encoding.writeVarUint8Array(encoder, encoding.toUint8Array(update));
  return encoding.toUint8Array(encoder);
}

/**
 * Relays the entries a socket may announce, to every socket of the session, and starts the socket's rate window when
 * any was relayed. Presence for another user's client would move or remove their cursor, so it is left out, as is a
 * state outside presenceStateSchema, and a frame of such entries alone (y-websocket re-sends every change it applies)
 * relays nothing and starts no window.
 */
function relayAwareness(
  ctx: SocketContext,
  collab: CollabSession,
  ws: WebSocket,
  rate: AwarenessWindow,
  entries: AwarenessEntry[],
  frame?: Uint8Array,
): void {
  const relayed: AwarenessEntry[] = [];
  for (const entry of entries) {
    if (!isRelayablePresence(entry.state)) continue;
    const verdict = claimAwarenessClient(collab, ws, ctx.userId, { clientId: entry.clientId, clock: entry.clock, removes: entry.state === 'null' });
    if (verdict === 'refuse') {
      refuseFrame(collab.scope, ctx.userId, ws, 'Too many awareness clients');
      return;
    }
    if (verdict === 'relay') relayed.push(entry);
  }
  if (relayed.length === 0) return;
  rate.relayedAt = Date.now();
  // The sender receives its relayed entries too: y-websocket closes a socket that received nothing for 30 s, and an
  // editor alone on its document receives nothing else. An entry at the clock the sender holds changes nothing there.
  broadcastToCollab(collab, frame && relayed.length === entries.length ? frame : encodeAwarenessMessage(relayed));
}

/**
 * Holds a socket's entries until its rate window ends: per client the latest state, since only that one matters to a
 * peer. The position a quick series of cursor moves ends on, an editor's first cursor and a removal right after a move
 * all arrive inside a window, so dropping them would leave peers with a stale cursor until the client's 15 s renewal.
 */
function holdAwareness(
  ctx: SocketContext,
  collab: CollabSession,
  ws: WebSocket,
  rate: AwarenessWindow,
  entries: AwarenessEntry[],
  waitMs: number,
): void {
  for (const entry of entries) {
    const owner = collab.awarenessOwners.get(entry.clientId);
    if (owner && owner.userId !== ctx.userId) continue;
    const held = rate.held.get(entry.clientId);
    if (held ? held.clock <= entry.clock : rate.held.size < yjsAwarenessMaxEntries) rate.held.set(entry.clientId, entry);
  }
  if (rate.held.size === 0) return;
  rate.timer ??= setTimeout(() => {
    rate.timer = undefined;
    const latest = [...rate.held.values()];
    rate.held.clear();
    // The socket closed, or its session ended under it, while its entries waited.
    if (ws.readyState !== ws.OPEN || !getCollab(collab.scope)?.clients.has(ws)) return;
    relayAwareness(ctx, collab, ws, rate, latest);
  }, waitMs);
}

/**
 * Applies one frame. Sync frames reach this only through the socket's serial queue, after entity
 * authorization, so they run in arrival order; awareness is ephemeral, relayed only from an
 * authorized open socket, at most yjsAwarenessRateLimit frames a second per socket. Both act in
 * the socket's authorized scope.
 */
export async function handleMessage(ctx: SocketContext, ws: WebSocket, data: Uint8Array): Promise<void> {
  if (data.length < 2) return;
  const { scope } = ctx;

  const decoder = decoding.createDecoder(data);
  const messageType = readMessageType(decoder);
  if (messageType === null) return refuseFrame(scope ?? ctx.requested, ctx.userId, ws, 'Malformed frame');
  if (!scope) return;
  const collab = getCollab(scope);
  // The session ended under the socket while this frame waited in its queue: its document was retired, the socket is
  // closing with 1013, and what it sent belongs to a generation its next handshake drops, so none of it reaches the
  // log, a peer or a newer session of the document.
  if (!collab?.clients.has(ws)) return;

  if (messageType === yjsMessageTypes.Sync) {
    let syncType: number;
    let payload: Uint8Array;
    try {
      syncType = decoding.readVarUint(decoder);
      payload = decoding.readVarUint8Array(decoder);
    } catch {
      refuseFrame(scope, ctx.userId, ws);
      return;
    }

    if (syncType === yjsSyncSubtypes.Step1) {
      log.trace(`Sync step 1 from ${docKey(scope)}`, { bytes: data.length });
      await handleSyncStep1(ctx, collab, ws, payload);
    } else if (syncType === yjsSyncSubtypes.Step2) {
      ctx.awaitingReply = false;
      if (await handleSyncUpdate(collab, ctx.userId, ws, payload, data)) sendSaved(ws);
    } else if (syncType === yjsSyncSubtypes.Update) {
      // Sent before the client read the relay's answer: its reply carries what the relay lacks, and a client about to
      // drop its document for another generation must log nothing of it. The update counts as handled, and the reply
      // that carries it gets a `Saved` of its own.
      if (ctx.awaitingReply || (await handleSyncUpdate(collab, ctx.userId, ws, payload, data))) sendSaved(ws);
    }
  } else if (messageType === yjsMessageTypes.Awareness) {
    if (ws.readyState !== ws.OPEN) return;
    let entries: AwarenessEntry[] | null;
    try {
      entries = decodeAwarenessEntries(decoding.readVarUint8Array(decoder));
    } catch {
      refuseFrame(scope, ctx.userId, ws, 'Malformed awareness');
      return;
    }
    // A frame with more entries than a client announces reaches no peer and holds no client.
    if (!entries) return;

    let rate = awarenessWindows.get(ws);
    if (!rate) {
      rate = { relayedAt: 0, held: new Map() };
      awarenessWindows.set(ws, rate);
    }
    const waitMs = rate.relayedAt + awarenessWindowMs - Date.now();
    if (waitMs <= 0 && !rate.timer) relayAwareness(ctx, collab, ws, rate, entries, data);
    else holdAwareness(ctx, collab, ws, rate, entries, Math.max(waitMs, 0));
  }
}

/**
 * Takes a socket out of its session and removes the presence it held from the sockets that stay: a null state for each
 * of its clients, one clock past the last relayed, which y-protocols applies like the client's own removal, so peers
 * drop its cursor at once, without waiting for their 30 s timeout. A client another socket of its user took over stays.
 */
export function handleLeave(doc: YjsDocKey, ws: WebSocket): void {
  const rate = awarenessWindows.get(ws);
  if (rate) {
    clearTimeout(rate.timer);
    rate.timer = undefined;
    rate.held.clear();
  }
  const released = leaveCollab(doc, ws);
  const collab = getCollab(doc);
  if (!collab || released.length === 0) return;
  broadcastToCollab(collab, encodeAwarenessMessage(released.map(({ clientId, clock }) => ({ clientId, clock: clock + 1, state: 'null' }))));
}

/**
 * The seed of a new document: its stored description, and one empty paragraph for none. A description that does not
 * convert is logged and seeds the empty document too: the session opens, and the next write replaces the description.
 */
function seedFrom(scope: YjsDocScope): (description: string | null) => Uint8Array {
  return (description) =>
    descriptionToSeedOrEmpty(description, (err) =>
      log.warn(`The description of ${docKey(scope)} does not convert: seeding an empty document`, { err }),
    );
}

/**
 * Broadcasts the rows the session's sockets lack, oldest first, as sync updates, and counts them seen; returns how many
 * it sent. A row Yjs cannot decode, or one that carries nothing, reaches no socket. `exclude` is a socket whose
 * handshake answer carries the rows already.
 */
function relayRows(collab: CollabSession, rows: readonly LogRow[], exclude?: WebSocket): number {
  let relayed = 0;
  for (const row of rows) {
    if (collab.seen.has(row.id)) continue;
    collab.seen.add(row.id);
    if (classifyUpdate(row.payload) !== 'update') continue;
    broadcastToCollab(collab, encodeSync(yjsSyncSubtypes.Update, row.payload), exclude);
    relayed++;
  }
  return relayed;
}

/**
 * The document as the session knows it: the document row (seeded on first sight, under a new generation) plus every
 * logged update that merges; compaction discards the rest. The read is the handshake's catch-up too: rows the
 * session's other sockets lack reach them, and `ws`, whose answer carries the whole document, is skipped. Null once
 * the document was retired under the session (its row gone, or reseeded by another relay) or its entity is gone: the
 * session ends, and its sockets reconnect.
 */
async function loadDocumentState(collab: CollabSession, ws?: WebSocket): Promise<{ state: Uint8Array | null; generation: string } | null> {
  const { scope } = collab;
  let document = await findDocument(scope);
  if (collab.generation !== null && document?.generation !== collab.generation) {
    endCollab(collab);
    return null;
  }
  // Fresh document: the server seeds it from the stored description, so clients never seed it.
  document ??= await seedDocument(scope, seedFrom(scope));
  // Deleted since the socket was authorized: its reconnect is told so.
  if (!document) {
    endCollab(collab);
    return null;
  }
  const { state, accepted } = mergeLog(document.base, document.rows);
  if (collab.generation === null) {
    // The session's first load: no socket of it holds any of the document yet, and every handshake answers with all of it.
    for (const row of accepted) collab.seen.add(row.id);
  } else if (relayRows(collab, accepted, ws) > 0) {
    scheduleCompaction(collab);
  }
  collab.generation = document.generation;
  return { state, generation: document.generation };
}

/**
 * Tells the client the document's generation, answers its state vector with what it lacks, then asks for what the
 * relay lacks: y-websocket answers a Step1 with a Step2 on its own, so structs the client holds and the relay never
 * received (a lost frame, a reconnect) are uploaded and logged like any update. Until that reply, the socket's
 * updates are dropped. What peers broadcast from this Step1 until the answer is sent follows the answer
 * (`CollabSession.handshakes`); on every early return it is dropped, and the socket's next handshake carries it.
 */
async function handleSyncStep1(ctx: SocketContext, collab: CollabSession, ws: WebSocket, clientStateVector: Uint8Array): Promise<void> {
  // A socket that closed while this frame waited has no one to answer.
  if (ws.readyState !== ws.OPEN) return;
  const held: Uint8Array[] = [];
  collab.handshakes.set(ws, held);
  try {
    const doc = await withDocumentLock(collab, () => loadDocumentState(collab, ws));
    if (!doc || ws.readyState !== ws.OPEN) return;

    ws.send(encodeGeneration(doc.generation));
    ctx.awaitingReply = true;
    if (!doc.state) {
      ws.send(encodeSync(yjsSyncSubtypes.Step2, Y.encodeStateAsUpdate(new Y.Doc())));
      ws.send(encodeSync(yjsSyncSubtypes.Step1, Y.encodeStateVector(new Y.Doc())));
    } else {
      try {
        ws.send(encodeSync(yjsSyncSubtypes.Step2, Y.diffUpdate(doc.state, clientStateVector)));
        ws.send(encodeSync(yjsSyncSubtypes.Step1, Y.encodeStateVectorFromUpdate(doc.state)));
      } catch {
        // Corrupted state: fall back to the full state and skip the pull.
        ws.send(encodeSync(yjsSyncSubtypes.Step2, doc.state));
        ctx.awaitingReply = false;
      }
    }
    for (const frame of held) ws.send(frame);
  } finally {
    collab.handshakes.delete(ws);
  }
}

/**
 * Logs the update durably under its sender, in the generation the session loaded, then broadcasts it to peers and
 * schedules compaction; one Yjs cannot decode closes its sender. A document retired or reseeded since takes no update:
 * the session ends, and its sockets reconnect. True once the update is logged, or carried nothing: its sender may be
 * told it is saved. The row counts as seen before its append commits, so its own notification relays nothing.
 */
async function handleSyncUpdate(collab: CollabSession, userId: string, ws: WebSocket, update: Uint8Array, rawMessage: Uint8Array): Promise<boolean> {
  const kind = classifyUpdate(update);
  // A client's Step2 reply carries nothing when it holds nothing the relay lacks.
  if (kind === 'empty') return true;
  // Logged, it would break every later merge of the document.
  if (kind === 'malformed') {
    refuseFrame(collab.scope, userId, ws);
    return false;
  }

  // Before any handshake loaded the document, the update takes the generation a handshake would load; none, when the
  // document was retired under the session meanwhile, which has ended.
  const generation = collab.generation ?? (await withDocumentLock(collab, () => loadDocumentState(collab)))?.generation;
  if (!generation) return false;
  const appended = await appendUpdate(collab.scope, userId, update, generation, (id) => collab.seen.add(id));
  // The update was classified above and fits in one frame, so the append logged it, or found the document retired or
  // reseeded under the session: `no-document` or `stale-generation`.
  if (appended.status !== 'appended') {
    endCollab(collab);
    return false;
  }
  // The session ended while the append ran: its peers are gone, no timer may run on it, and its generation is void.
  if (getCollab(collab.scope) !== collab) return false;
  broadcastToCollab(collab, rawMessage, ws);
  scheduleCompaction(collab);
  return true;
}

/**
 * Relays every log row of the session's generation its sockets lack (an outside write, or another relay's append),
 * and schedules compaction for them. Runs on the document lock, after any handshake or compaction in flight, and a
 * call while one waits there joins it: its read comes later, so a burst of notifications costs at most one read
 * behind the running one. A session that has not loaded its document has nothing to relay; one whose document is
 * gone or reseeded ends.
 */
export function relayUnseen(collab: CollabSession): Promise<void> {
  if (collab.queuedCatchUp) return collab.queuedCatchUp;
  const run = withDocumentLock(collab, async () => {
    collab.queuedCatchUp = undefined;
    const { generation, scope } = collab;
    if (generation === null || getCollab(scope) !== collab) return;
    const rows = await findLog(scope, generation);
    if (getCollab(scope) !== collab) return;
    if (!rows) endCollab(collab);
    else if (relayRows(collab, rows) > 0) scheduleCompaction(collab);
  });
  collab.queuedCatchUp = run;
  return run;
}

/** Starts a catch-up that nothing awaits: a failure is logged, and the next notification, touch or handshake retries. */
function catchUp(collab: CollabSession): void {
  relayUnseen(collab).catch((err) => log.warn(`Relaying the log of ${docKey(collab.scope)} failed`, { err }));
}

// A live stamp that finds a row the session never relayed means a notification was missed.
setUnseenRowHandler(catchUp);

/**
 * Acts on a notification of the Yjs log channel. A retired document's session ends at once with 1013: its entity was
 * deleted, and each socket's reconnect is closed with 4410. A notice holding any row the session has not relayed is
 * caught up, not only one whose newest row is new: rows of one batch can commit out of id order, so an earlier read may
 * have relayed the newest while an older one was uncommitted. The relay's own appends are counted seen before they
 * commit, so its own batched notices cost nothing. A document without a session on this relay is left alone.
 */
export function onLogNotice(notice: LogNotice): void {
  const collab = getCollab(notice);
  if (!collab) return;
  if ('retired' in notice) endCollab(collab);
  else if (notice.logIds.some((id) => !collab.seen.has(id))) catchUp(collab);
}

/** Catches every session up, after the log listener (re)connects: what was notified while it was down never arrives. */
export function relayUnseenEverywhere(): void {
  for (const collab of getCollabs()) catchUp(collab);
}

/**
 * One compaction per quiet window; a new update restarts the wait, up to a deadline yjsCompactMaxWaitMs after the
 * first update since the last run, so someone typing without pause still reaches viewers and the row.
 */
function scheduleCompaction(collab: CollabSession): void {
  if (collab.compactTimer) clearTimeout(collab.compactTimer);
  const now = Date.now();
  collab.compactDueAt ??= now + yjsCompactMaxWaitMs;
  collab.compactTimer = setTimeout(
    () => {
      collab.compactTimer = undefined;
      void runCompaction(collab);
    },
    Math.max(0, Math.min(yjsCompactDebounceMs, collab.compactDueAt - now)),
  );
}

/**
 * Compacts under the document lock, relaying first the rows of the window the session's sockets lack; a thrown error
 * counts as retryable and leaves the log in place. A retired document ends the session. The deadline clears as the run
 * starts, whatever its outcome: an update from then on may be logged after the run reads the log, and its window takes
 * a deadline of its own.
 */
export async function runCompaction(collab: CollabSession): Promise<CompactionResult> {
  collab.compactDueAt = undefined;
  return withDocumentLock(collab, async () => {
    try {
      const result = await compactDocument(collab.scope, collab.generation, {
        // Rows a missed notification left unrelayed reach the sockets before they fold into the base.
        read: (rows) => relayRows(collab, rows),
        removed: (ids) => {
          for (const id of ids) collab.seen.delete(id);
        },
      });
      if (result === 'retired') endCollab(collab);
      return result;
    } catch (err) {
      log.error(`Compaction failed for ${docKey(collab.scope)}`, { err });
      return 'retry';
    }
  });
}
