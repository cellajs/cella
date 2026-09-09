import type { WebSocket } from 'ws';
import type { DocContext } from '../constants';
import { YJS_CLEANUP_DELAY_MS } from '../constants';
import { deleteDoc } from '../data/storage';
import { log } from '../lib/pino';
import { compactDocument } from './compaction';

export interface CollabSession {
  ctx: DocContext;
  clients: Set<WebSocket>;
  /** Document lock: seeding, compaction and cleanup run one at a time through this chain. */
  chain: Promise<unknown>;
  cleanupTimer?: ReturnType<typeof setTimeout>;
  compactTimer?: ReturnType<typeof setTimeout>;
}

const collabSessions = new Map<string, CollabSession>();

function collabKey(entityType: string, entityId: string): string {
  return `${entityType}:${entityId}`;
}

export function getCollab(entityType: string, entityId: string): CollabSession | undefined {
  return collabSessions.get(collabKey(entityType, entityId));
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

/** Registers a client for a document and cancels pending cleanup when reconnecting. */
export function joinCollab(ctx: DocContext, ws: WebSocket): CollabSession {
  const key = collabKey(ctx.entityType, ctx.entityId);
  let collab = collabSessions.get(key);

  if (collab) {
    if (collab.cleanupTimer) {
      clearTimeout(collab.cleanupTimer);
      collab.cleanupTimer = undefined;
    }
    collab.clients.add(ws);
    return collab;
  }

  collab = { ctx, clients: new Set([ws]), chain: Promise.resolve() };
  collabSessions.set(key, collab);
  return collab;
}

/** When the last client leaves, a grace period runs before the log is compacted and the session rows are deleted. */
export function leaveCollab(entityType: string, entityId: string, ws: WebSocket): void {
  const key = collabKey(entityType, entityId);
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

    const outcome = await withDocLock(collab, async (): Promise<'rejoined' | 'retry' | 'done'> => {
      if (collab.clients.size > 0) return 'rejoined';

      let result: Awaited<ReturnType<typeof compactDocument>>;
      try {
        result = await compactDocument(collab.ctx);
      } catch (err) {
        log.error(`Cleanup compaction failed for ${key}`, { err });
        result = 'retry';
      }
      // A transient backend failure keeps the rows: the log is durable, so the retry loses nothing.
      if (result === 'retry') return 'retry';

      try {
        await deleteDoc(collab.ctx);
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
    collabSessions.delete(key);
  };

  collab.cleanupTimer = setTimeout(cleanup, YJS_CLEANUP_DELAY_MS);
}

export function broadcastToCollab(
  entityType: string,
  entityId: string,
  message: Uint8Array,
  exclude?: WebSocket,
): void {
  const collab = getCollab(entityType, entityId);
  if (!collab) return;

  for (const client of collab.clients) {
    if (client !== exclude && client.readyState === client.OPEN) {
      client.send(message);
    }
  }
}
