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
  /** Pending state to save */
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

/**
 * Get the active collab session for a document, if it exists. Used for broadcasting updates to peers.
 */
export function getCollab(entityType: string, entityId: string): CollabSession | undefined {
  return collabSessions.get(collabKey(entityType, entityId));
}

/** 
 * Number of active collaborative editing sessions.
 */
export function getActiveDocumentCount(): number {
  return collabSessions.size;
}

/** 
 * Total WebSocket clients across all sessions.
 */
export function getActiveClientCount(): number {
  let count = 0;
  for (const session of collabSessions.values()) {
    count += session.clients.size;
  }
  return count;
}

/** 
 * Registers a WebSocket client for a document. Cancels pending cleanup if reconnecting.
 */
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

/** 
 * Removes a client. When the last client leaves, starts a grace period before deleting stored state.
 */
export function leaveCollab(entityType: string, entityId: string, ws: WebSocket): void {
  const key = collabKey(entityType, entityId);
  const collab = collabSessions.get(key);
  if (!collab) return;

  collab.clients.delete(ws);

  if (collab.clients.size === 0) {
    const cleanup = async () => {
      if (collab.clients.size > 0) return;
      if (collab.saveTimer) clearTimeout(collab.saveTimer);

      // Wait for any in-flight save to complete before continuing
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

        // Delete after final blocks persist, or after a permanent failure that cannot converge.
        // Retry transient backend failures while retaining the session row.
      if (finalState && finalState.length > 0) {
        const result = await materializeState(collab, finalState);
        if (result === 'retry') {
          log.warn(`Materialize unavailable for ${key} — keeping session row, retrying cleanup`);
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

/**
 * Broadcast a message to all clients in the same collab session, excluding the sender if specified.
 * Used for forwarding document updates from one client to all others.
 */
export function broadcastToCollab(entityType: string, entityId: string, message: Uint8Array, exclude?: WebSocket): void {
  const collab = getCollab(entityType, entityId);
  if (!collab) return;

  for (const client of collab.clients) {
    if (client !== exclude && client.readyState === client.OPEN) {
      client.send(message);
    }
  }
}
