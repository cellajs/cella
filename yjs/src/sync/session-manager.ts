import type { WebSocket } from 'ws';
import type { DocKey, DocScope } from '../constants';
import { YJS_AWARENESS_MAX_CLIENTS, YJS_CLEANUP_DELAY_MS, YJS_CLEANUP_MAX_ATTEMPTS, YJS_LIVE_TOUCH_MS } from '../constants';
import { deleteDoc, touchDoc } from '../data/storage';
import { log } from '../lib/pino';
import { type CompactionResult, compactDocument } from './compaction';

export interface CollabSession {
  /** The document as its entity row places it; compaction, materialize and cleanup act in it as the system, never as a joiner. */
  scope: DocScope;
  clients: Set<WebSocket>;
  /** Awareness client id → the socket holding it, its user and the last clock relayed for it; no other user's socket relays that id. Up to YJS_AWARENESS_MAX_CLIENTS per socket. */
  awarenessOwners: Map<number, { ws: WebSocket; userId: string; clock: number }>;
  /** Document lock: seeding, compaction and finishing (cleanup or the startup sweep) run one at a time through this chain. */
  chain: Promise<unknown>;
  /** The generation of the document row the session loaded at its first handshake, null before. A row gone or of another generation since was retired: the session ends. */
  generation: string | null;
  /**
   * Log rows the session's sockets hold: rows it appended, relayed or loaded into a handshake. A row outside it (an
   * outside write, another relay's append) is relayed once, by `relayUnseen`; compaction drops the rows it removes.
   */
  seen: Set<number>;
  /** A catch-up queued on the document lock that has not started yet: a later call joins it, since its read comes after. */
  queuedCatchUp?: Promise<void>;
  cleanupTimer?: ReturnType<typeof setTimeout>;
  compactTimer?: ReturnType<typeof setTimeout>;
  /** When the armed compaction runs at the latest: YJS_COMPACT_MAX_WAIT_MS after the first update since the last run started. */
  compactDueAt?: number;
  /** Stamps the session row live every YJS_LIVE_TOUCH_MS while the session lasts. */
  liveTimer: ReturnType<typeof setInterval>;
}

const collabSessions = new Map<string, CollabSession>();

/** Keyed by tenant, type and id, so no session is shared across tenants. */
function collabKey({ tenantId, entityType, entityId }: DocKey): string {
  return `${tenantId}:${entityType}:${entityId}`;
}

export function getCollab(doc: DocKey): CollabSession | undefined {
  return collabSessions.get(collabKey(doc));
}

/** Every session this relay holds, for a catch-up after its notifications may have been missed. */
export function getCollabs(): CollabSession[] {
  return [...collabSessions.values()];
}

export function getActiveDocumentCount(): number {
  return collabSessions.size;
}

export function getActiveClientCount(): number {
  let count = 0;
  for (const session of collabSessions.values()) {
    count += session.clients.size;
  }
  return count;
}

/** Runs `fn` after every earlier locked task on the document has settled; a failed task releases the lock like a successful one. */
export function withDocLock<T>(collab: CollabSession, fn: () => Promise<T>): Promise<T> {
  const run = collab.chain.then(fn, fn);
  collab.chain = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

/** What the live stamp runs when the log holds a row the session never relayed: the relay's catch-up, set by sync/relay.ts. */
let onUnseenRow: (collab: CollabSession) => void = () => undefined;

export function setUnseenRowHandler(handler: (collab: CollabSession) => void): void {
  onUnseenRow = handler;
}

/**
 * Stamps the document row live; a failed stamp is logged, and the next one comes a beat later. A row that is gone once
 * the session has loaded it was retired: the session ends, and its sockets reconnect, to be told the entity is gone. A
 * newest log row the session never relayed means a notification was missed: the catch-up relays it.
 */
function markLive(collab: CollabSession): void {
  const loaded = collab.generation !== null;
  touchDoc(collab.scope).then(
    ({ exists, lastLogId }) => {
      if (!exists && loaded) endCollab(collab);
      else if (loaded && lastLogId !== null && !collab.seen.has(lastLogId)) onUnseenRow(collab);
    },
    (err) => log.warn(`Marking ${collabKey(collab.scope)} live failed`, { err }),
  );
}

/**
 * Opens the document's session in `scope`. It stamps its row live at once and every YJS_LIVE_TOUCH_MS while it lasts,
 * so the startup sweep of another relay generation never takes it for an orphan, however long it idles.
 */
function openCollab(scope: DocScope, clients: WebSocket[]): CollabSession {
  const collab: CollabSession = {
    scope,
    clients: new Set(clients),
    awarenessOwners: new Map(),
    chain: Promise.resolve(),
    generation: null,
    seen: new Set(),
    // A session never keeps the process alive at shutdown.
    liveTimer: setInterval(() => markLive(collab), YJS_LIVE_TOUCH_MS).unref(),
  };
  collabSessions.set(collabKey(scope), collab);
  markLive(collab);
  return collab;
}

/**
 * Registers an authorized client for a document and cancels pending cleanup when reconnecting. `scope` is the one
 * authorization read from the entity row, so every joiner of a document brings the same one and the first opens the
 * session in it.
 */
export function joinCollab(scope: DocScope, ws: WebSocket): CollabSession {
  const collab = collabSessions.get(collabKey(scope));
  if (!collab) return openCollab(scope, [ws]);

  if (collab.cleanupTimer) {
    clearTimeout(collab.cleanupTimer);
    collab.cleanupTimer = undefined;
  }
  collab.clients.add(ws);
  return collab;
}

/** Takes a session out of the map, when it is still the one there, and clears its timers: none may later run on it. */
function dropCollab(key: string, collab: CollabSession): void {
  clearTimeout(collab.cleanupTimer);
  clearTimeout(collab.compactTimer);
  clearInterval(collab.liveTimer);
  collab.cleanupTimer = undefined;
  collab.compactTimer = undefined;
  collab.compactDueAt = undefined;
  if (collabSessions.get(key) === collab) collabSessions.delete(key);
}

/**
 * Ends a session whose document was retired (its entity deleted) or reseeded under another generation: every socket
 * closes with 1013 and reconnects. A deleted entity's reconnect is closed with 4410; any other reconnect opens a fresh
 * session, which tells each client the generation it finds. The session leaves the map at once, so no later task of it
 * reaches a newer one.
 */
export function endCollab(collab: CollabSession): void {
  const key = collabKey(collab.scope);
  if (collabSessions.get(key) !== collab) return;
  dropCollab(key, collab);
  log.info(`Document ${key} was retired: ending its session`);
  for (const ws of collab.clients) ws.close(1013, 'Document retired');
}

/** How finishing a session ended: a socket joined it, the backend did not take its log yet or refused it, or its log is written or gone. */
type FinishOutcome = 'joined' | 'retry' | 'kept' | 'done';

/** A socket joined since the finish started: it is still in the session, or its leave armed a newer cleanup. */
const joinedSince = (collab: CollabSession) => collab.clients.size > 0 || collab.cleanupTimer !== undefined;

/**
 * Finishes a session no socket holds, under the document lock: compacts its log once more, which deletes the log rows
 * it wrote. The document row stays, so a client whose document survived the session merges into the same history when
 * it returns; it goes only with the entity (`gone`). An unwritten log keeps its rows: they hold edits the entity has
 * not received. A socket that joins meanwhile keeps the session.
 */
async function finishCollab(key: string, collab: CollabSession): Promise<FinishOutcome> {
  const outcome = await withDocLock(collab, async (): Promise<FinishOutcome> => {
    if (joinedSince(collab)) return 'joined';

    let result: CompactionResult;
    try {
      result = await compactDocument(collab.scope, collab.generation);
    } catch (err) {
      log.error(`Final compaction failed for ${key}`, { err });
      result = 'retry';
    }
    // A socket joined while the compaction wrote: its session goes on with the rows.
    if (joinedSince(collab)) return 'joined';
    if (result === 'retry') return 'retry';
    if (result === 'permanent') return 'kept';
    if (result === 'gone') {
      try {
        await deleteDoc(collab.scope);
      } catch (err) {
        log.error(`Failed to delete the rows of ${key}`, { err });
      }
    }
    return 'done';
  });
  return joinedSince(collab) ? 'joined' : outcome;
}

/**
 * Finishes the log of a document the startup sweep found unwritten, as a cleanup does. The session it opens for it has
 * no socket but sits in the map, so a socket that joins meanwhile joins it: its handshake waits for the document lock,
 * and it keeps the session. The session is forgotten unless a socket joined; a document that already has a session
 * here is left to it.
 */
export async function finishOrphan(scope: DocScope): Promise<FinishOutcome> {
  if (getCollab(scope)) return 'joined';
  const collab = openCollab(scope, []);
  const outcome = await finishCollab(collabKey(scope), collab);
  if (outcome !== 'joined') dropCollab(collabKey(scope), collab);
  return outcome;
}

/** An awareness client a socket held when it left, at the last clock relayed for it. */
export interface ReleasedClient {
  clientId: number;
  clock: number;
}

/**
 * Takes a socket out of its session and frees the awareness clients it held, which it returns so its peers can drop
 * them. When the last client leaves, a grace period runs before the session is finished: its log compacted and forgotten.
 * A retryable failure keeps the log and retries, up to YJS_CLEANUP_MAX_ATTEMPTS, and a permanent refusal or the last
 * failed attempt keeps it for the next session or the startup sweep. A socket that joins while cleanup runs keeps the
 * session; when it leaves again first, the cleanup its leave arms takes over, so what it logged is compacted too. A
 * session leaves the map only while it has no client and no timer armed on it, so the relay always finds a joined
 * socket's session.
 */
export function leaveCollab(doc: DocKey, ws: WebSocket): ReleasedClient[] {
  const key = collabKey(doc);
  const collab = collabSessions.get(key);
  // Only a client of the live session leaves it: a socket that never joined it, or left it already, changes nothing.
  if (!collab?.clients.delete(ws)) return [];
  const released: ReleasedClient[] = [];
  for (const [clientId, owner] of collab.awarenessOwners) {
    if (owner.ws !== ws) continue;
    collab.awarenessOwners.delete(clientId);
    released.push({ clientId, clock: owner.clock });
  }
  if (collab.clients.size > 0) return released;

  let attempts = 0;
  const cleanup = async () => {
    collab.cleanupTimer = undefined;
    if (collabSessions.get(key) !== collab || collab.clients.size > 0) return;
    if (collab.compactTimer) {
      clearTimeout(collab.compactTimer);
      collab.compactTimer = undefined;
    }
    collab.compactDueAt = undefined;
    attempts++;

    const outcome = await finishCollab(key, collab);
    if (outcome === 'joined') return;
    if (outcome === 'retry') {
      if (attempts < YJS_CLEANUP_MAX_ATTEMPTS) {
        log.warn(`Materialize unavailable for ${key}: keeping the log, retrying cleanup`);
        collab.cleanupTimer = setTimeout(cleanup, YJS_CLEANUP_DELAY_MS);
        return;
      }
      log.error(`Materialize failed ${attempts} times for ${key}: keeping the log for the next session or sweep`);
    }
    if (outcome === 'kept') log.warn(`Materialize refused for ${key}: keeping the log for the next session`);
    dropCollab(key, collab);
  };

  collab.cleanupTimer = setTimeout(cleanup, YJS_CLEANUP_DELAY_MS);
  return released;
}

/** How many awareness clients a socket holds in its session. */
function heldClientCount(collab: CollabSession, ws: WebSocket): number {
  let held = 0;
  for (const owner of collab.awarenessOwners.values()) if (owner.ws === ws) held++;
  return held;
}

/**
 * Decides one awareness entry from a socket of `userId`: `relay` it, `drop` it (another user's socket holds its client),
 * or `refuse` the socket, which announced more clients than it may hold. An announcement takes a client no socket holds,
 * or one another socket of the same user holds (a reconnect takes its client over), while the socket holds fewer than
 * YJS_AWARENESS_MAX_CLIENTS, and the client keeps the highest clock relayed for it. A removal takes nothing and frees a
 * client the socket holds: y-websocket re-sends every change it applies, including the removal of each peer it timed out.
 */
export function claimAwarenessClient(
  collab: CollabSession,
  ws: WebSocket,
  userId: string,
  entry: { clientId: number; clock: number; removes: boolean },
): 'relay' | 'drop' | 'refuse' {
  const owner = collab.awarenessOwners.get(entry.clientId);
  if (owner && owner.userId !== userId) return 'drop';
  if (entry.removes) {
    if (owner?.ws === ws) collab.awarenessOwners.delete(entry.clientId);
    return 'relay';
  }
  const clock = Math.max(owner?.clock ?? 0, entry.clock);
  if (owner?.ws !== ws && heldClientCount(collab, ws) < YJS_AWARENESS_MAX_CLIENTS) {
    collab.awarenessOwners.set(entry.clientId, { ws, userId, clock });
    return 'relay';
  }
  // A free client would grow the session past the cap; one this socket or another socket of its user holds stays there.
  if (!owner) return 'refuse';
  owner.clock = clock;
  return 'relay';
}

/** Sends a frame to every open socket of the session but `exclude`: a sync update skips its sender, awareness reaches it too. */
export function broadcastToCollab(collab: CollabSession, message: Uint8Array, exclude?: WebSocket): void {
  for (const client of collab.clients) {
    if (client !== exclude && client.readyState === client.OPEN) {
      client.send(message);
    }
  }
}
