import type { WebSocket } from 'ws';
import type { DocContext } from '../constants';
import { YJS_CLEANUP_DELAY_MS } from '../constants';
import { deleteState, loadState, saveState } from '../data/storage';
import { log } from '../lib/pino';
import { materializeState } from './materialize';

interface CollabSession {
  ctx: DocContext;
  clients: Set<WebSocket>;
  cleanupTimer?: ReturnType<typeof setTimeout>;
  saveTimer?: ReturnType<typeof setTimeout>;
  pendingState?: Uint8Array;
  /** Tracks an in-flight saveState call so cleanup can await it before deleting. */
  savingPromise?: Promise<void>;
  /** Cached DB state from the first loadState call within a debounce window. */
  cachedDbState?: Uint8Array | null;
  /** Last blocks JSON accepted by the backend or loaded as the seed; enables skipping unchanged writes. */
  lastMaterializedJson?: string;
  /** Last client's context, which supplies the user id for the durable entity update. */
  lastEditor?: DocContext;
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

  collab = { ctx, clients: new Set([ws]) };
  collabSessions.set(key, collab);
  return collab;
}

/** When the last client leaves, a grace period runs before the stored state is deleted. */
export function leaveCollab(entityType: string, entityId: string, ws: WebSocket): void {
  const key = collabKey(entityType, entityId);
  const collab = collabSessions.get(key);
  if (!collab) return;

  collab.clients.delete(ws);

  if (collab.clients.size === 0) {
    const cleanup = async () => {
      if (collab.clients.size > 0) return;
      if (collab.saveTimer) clearTimeout(collab.saveTimer);

      if (collab.savingPromise) {
        try {
          await collab.savingPromise;
        } catch {
          // Save failed: continue to flush + delete
        }
      }

      // Flush any un-saved pendingState before deleting the DB row
      let finalState = collab.pendingState;
      if (finalState && finalState.length > 0) {
        try {
          await saveState(collab.ctx, finalState, collab.lastEditor?.userId ?? null);
        } catch (err) {
          log.error(`Failed to flush pending state for ${key}`, { err: err });
        }
        collab.pendingState = undefined;
      } else {
        try {
          finalState = (await loadState(collab.ctx)) ?? undefined;
        } catch {
          finalState = undefined;
        }
      }

      // Deletion waits for the final blocks to persist; a transient backend failure keeps the session row and retries.
      if (finalState && finalState.length > 0) {
        const result = await materializeState(collab, finalState);
        if (result === 'retry') {
          log.warn(`Materialize unavailable for ${key}: keeping session row, retrying cleanup`);
          collab.cleanupTimer = setTimeout(cleanup, YJS_CLEANUP_DELAY_MS);
          return;
        }
      }

      try {
        await deleteState(collab.ctx);
      } catch (err) {
        log.error(`Failed to delete state for ${key}`, { err: err });
      }

      collabSessions.delete(key);
    };

    collab.cleanupTimer = setTimeout(cleanup, YJS_CLEANUP_DELAY_MS);
  }
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
