import type { WebSocket } from 'ws';
import type { DocKey, DocScope } from '../constants';
import { YJS_AWARENESS_MAX_CLIENTS, YJS_CLEANUP_DELAY_MS, YJS_CLEANUP_MAX_ATTEMPTS } from '../constants';
import { deleteDoc } from '../data/storage';
import { log } from '../lib/pino';
import { compactDocument } from './compaction';

export interface CollabSession {
  /** The document as its entity row places it; compaction, materialize and cleanup act in it as the system, never as a joiner. */
  scope: DocScope;
  clients: Set<WebSocket>;
  /** Awareness client id → the socket holding it and its user; no other user's socket relays that id. Up to YJS_AWARENESS_MAX_CLIENTS per socket. */
  awarenessOwners: Map<number, { ws: WebSocket; userId: string }>;
  /** Document lock: seeding, compaction and cleanup run one at a time through this chain. */
  chain: Promise<unknown>;
  cleanupTimer?: ReturnType<typeof setTimeout>;
  compactTimer?: ReturnType<typeof setTimeout>;
}

const collabSessions = new Map<string, CollabSession>();

/** Keyed by tenant, type and id, so no session is shared across tenants. */
function collabKey({ tenantId, entityType, entityId }: DocKey): string {
  return `${tenantId}:${entityType}:${entityId}`;
}

export function getCollab(doc: DocKey): CollabSession | undefined {
  return collabSessions.get(collabKey(doc));
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

/**
 * Registers an authorized client for a document and cancels pending cleanup when reconnecting. `scope` is the one
 * authorization read from the entity row, so every joiner of a document brings the same one and the first opens the
 * session in it.
 */
export function joinCollab(scope: DocScope, ws: WebSocket): CollabSession {
  const key = collabKey(scope);
  let collab = collabSessions.get(key);

  if (collab) {
    if (collab.cleanupTimer) {
      clearTimeout(collab.cleanupTimer);
      collab.cleanupTimer = undefined;
    }
    collab.clients.add(ws);
    return collab;
  }

  collab = { scope, clients: new Set([ws]), awarenessOwners: new Map(), chain: Promise.resolve() };
  collabSessions.set(key, collab);
  return collab;
}

/**
 * When the last client leaves, a grace period runs before the log is compacted and the session rows
 * are deleted. Rows go once the log is written or empty, or the entity is gone: a retryable failure
 * keeps them and retries, up to YJS_CLEANUP_MAX_ATTEMPTS, and a permanent refusal or the last failed
 * attempt keeps them for the next session or the startup sweep. A socket that joins while cleanup
 * runs keeps the session and its rows: the session leaves the map only while it has no client, so the
 * relay always finds a joined socket's session.
 */
export function leaveCollab(doc: DocKey, ws: WebSocket): void {
  const key = collabKey(doc);
  const collab = collabSessions.get(key);
  if (!collab) return;

  collab.clients.delete(ws);
  for (const [clientId, owner] of collab.awarenessOwners) {
    if (owner.ws === ws) collab.awarenessOwners.delete(clientId);
  }
  if (collab.clients.size > 0) return;

  let attempts = 0;
  const cleanup = async () => {
    collab.cleanupTimer = undefined;
    if (collab.clients.size > 0) return;
    if (collab.compactTimer) {
      clearTimeout(collab.compactTimer);
      collab.compactTimer = undefined;
    }
    attempts++;

    const outcome = await withDocLock(collab, async (): Promise<'rejoined' | 'retry' | 'kept' | 'done'> => {
      if (collab.clients.size > 0) return 'rejoined';

      let result: Awaited<ReturnType<typeof compactDocument>>;
      try {
        result = await compactDocument(collab.scope);
      } catch (err) {
        log.error(`Cleanup compaction failed for ${key}`, { err });
        result = 'retry';
      }
      // A socket joined while the compaction wrote: its session goes on with the rows.
      if (collab.clients.size > 0) return 'rejoined';
      // An unwritten log keeps the rows: they hold edits the entity has not received. A gone entity's rows go.
      if (result === 'retry') return 'retry';
      if (result === 'permanent') return 'kept';

      try {
        await deleteDoc(collab.scope);
      } catch (err) {
        log.error(`Failed to delete session rows for ${key}`, { err });
      }
      return 'done';
    });

    if (outcome === 'rejoined' || collab.clients.size > 0) return;
    if (outcome === 'retry') {
      if (attempts < YJS_CLEANUP_MAX_ATTEMPTS) {
        log.warn(`Materialize unavailable for ${key}: keeping session rows, retrying cleanup`);
        collab.cleanupTimer = setTimeout(cleanup, YJS_CLEANUP_DELAY_MS);
        return;
      }
      log.error(`Materialize failed ${attempts} times for ${key}: keeping session rows for the next session or sweep`);
    }
    if (outcome === 'kept') log.warn(`Materialize refused for ${key}: keeping session rows for the next session`);
    collabSessions.delete(key);
  };

  collab.cleanupTimer = setTimeout(cleanup, YJS_CLEANUP_DELAY_MS);
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
 * YJS_AWARENESS_MAX_CLIENTS. A removal takes nothing and frees a client the socket holds: y-websocket re-sends every
 * change it applies, including the removal of each peer it timed out.
 */
export function claimAwarenessClient(
  collab: CollabSession,
  ws: WebSocket,
  userId: string,
  entry: { clientId: number; removes: boolean },
): 'relay' | 'drop' | 'refuse' {
  const owner = collab.awarenessOwners.get(entry.clientId);
  if (owner && owner.userId !== userId) return 'drop';
  if (entry.removes) {
    if (owner?.ws === ws) collab.awarenessOwners.delete(entry.clientId);
    return 'relay';
  }
  if (owner?.ws === ws) return 'relay';
  if (heldClientCount(collab, ws) < YJS_AWARENESS_MAX_CLIENTS) {
    collab.awarenessOwners.set(entry.clientId, { ws, userId });
    return 'relay';
  }
  // A client another socket of this user holds stays with it; a free one would grow the session past the cap.
  return owner ? 'relay' : 'refuse';
}

export function broadcastToCollab(doc: DocKey, message: Uint8Array, exclude?: WebSocket): void {
  const collab = getCollab(doc);
  if (!collab) return;

  for (const client of collab.clients) {
    if (client !== exclude && client.readyState === client.OPEN) {
      client.send(message);
    }
  }
}
