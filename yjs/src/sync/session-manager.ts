import type { WebSocket } from 'ws';
import type { DocKey, DocScope } from '../constants';
import { YJS_CLEANUP_DELAY_MS } from '../constants';
import { deleteDoc } from '../data/storage';
import { log } from '../lib/pino';
import { compactDocument } from './compaction';

export interface CollabSession {
  /** The document as its entity row places it; compaction, materialize and cleanup act in it as the system, never as a joiner. */
  scope: DocScope;
  clients: Set<WebSocket>;
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

  collab = { scope, clients: new Set([ws]), chain: Promise.resolve() };
  collabSessions.set(key, collab);
  return collab;
}

/**
 * When the last client leaves, a grace period runs before the log is compacted and the session rows
 * are deleted. Rows go once the log is written or empty, or the entity is gone: a retryable failure
 * keeps them and retries, a permanent refusal keeps them for the next session or the startup sweep.
 */
export function leaveCollab(doc: DocKey, ws: WebSocket): void {
  const key = collabKey(doc);
  const collab = collabSessions.get(key);
  if (!collab) return;

  collab.clients.delete(ws);
  if (collab.clients.size > 0) return;

  const cleanup = async () => {
    collab.cleanupTimer = undefined;
    if (collab.clients.size > 0) return;
    if (collab.compactTimer) {
      clearTimeout(collab.compactTimer);
      collab.compactTimer = undefined;
    }

    const outcome = await withDocLock(collab, async (): Promise<'rejoined' | 'retry' | 'kept' | 'done'> => {
      if (collab.clients.size > 0) return 'rejoined';

      let result: Awaited<ReturnType<typeof compactDocument>>;
      try {
        result = await compactDocument(collab.scope);
      } catch (err) {
        log.error(`Cleanup compaction failed for ${key}`, { err });
        result = 'retry';
      }
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

    if (outcome === 'rejoined') return;
    if (outcome === 'retry') {
      log.warn(`Materialize unavailable for ${key}: keeping session rows, retrying cleanup`);
      collab.cleanupTimer = setTimeout(cleanup, YJS_CLEANUP_DELAY_MS);
      return;
    }
    if (outcome === 'kept') log.warn(`Materialize refused for ${key}: keeping session rows for the next session`);
    collabSessions.delete(key);
  };

  collab.cleanupTimer = setTimeout(cleanup, YJS_CLEANUP_DELAY_MS);
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
