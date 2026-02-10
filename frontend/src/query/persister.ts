/**
 * React Query IndexedDB Persister
 *
 * UNIVERSAL PATTERN - Part of the offline persistence layer.
 *
 * All React Query cache is stored in IndexedDB using Dexie, providing
 * unlimited storage for both session and offline modes:
 *
 * - **Offline mode** (`offlineAccess=true`): Uses a shared `reactQuery` key
 *   that persists across browser restarts for full offline capability.
 * - **Session mode** (`offlineAccess=false`): Uses a per-tab `session-<uuid>` key
 *   that survives refresh but is cleaned up on tab close via `beforeunload`.
 *   Orphaned sessions (e.g. tab crash) are cleaned up on next app startup.
 */
import * as Sentry from '@sentry/react';
import type { PersistedClient, Persister } from '@tanstack/react-query-persist-client';
import { Dexie } from 'dexie';
import { appConfig } from 'shared';

const SESSION_KEY_PREFIX = 'session-';
const SESSION_ID_STORAGE_KEY = `${appConfig.slug}-tab-session-id`;
const ORPHAN_MAX_AGE_MS = 24 * 60 * 60 * 1000; // 24 hours

interface PersistedRecord {
  key: string;
  timestamp: number;
  clientState: PersistedClient['clientState'];
  buster: string;
}

/**
 * Dexie database for React Query cache persistence.
 */
class QueryPersisterDB extends Dexie {
  persist!: Dexie.Table<PersistedRecord, string>;

  constructor() {
    super(`${appConfig.slug}-query-persister`);
    this.version(1).stores({ persist: 'key' });
  }
}

const queryDb = new QueryPersisterDB();

/**
 * Get or create a stable session ID for the current tab.
 * Stored in sessionStorage so it survives refresh but dies on tab close.
 */
function getTabSessionId(): string {
  let id = sessionStorage.getItem(SESSION_ID_STORAGE_KEY);
  if (!id) {
    id = crypto.randomUUID();
    sessionStorage.setItem(SESSION_ID_STORAGE_KEY, id);
  }
  return id;
}

/**
 * Creates an IndexedDB persister for React Query using Dexie.
 * Used for both session-scoped and persistent (offline) cache storage.
 */
function createIDBPersister(idbValidKey: string = 'reactQuery') {
  return {
    persistClient: async (client: PersistedClient) => {
      try {
        await queryDb.persist.put(
          {
            key: idbValidKey,
            timestamp: client.timestamp,
            clientState: client.clientState,
            buster: client.buster,
          },
          idbValidKey,
        );
      } catch (error) {
        Sentry.captureException(error);
        console.error('[QueryPersister] Failed to persist client:', error);
      }
    },
    restoreClient: async () => {
      try {
        const persisted = await queryDb.persist.get(idbValidKey);
        if (persisted) {
          return {
            timestamp: persisted.timestamp,
            clientState: persisted.clientState,
            buster: persisted.buster,
          } as PersistedClient;
        }
        return undefined;
      } catch (error) {
        Sentry.captureException(error);
        console.error('[QueryPersister] Failed to restore client:', error);
        return undefined;
      }
    },
    removeClient: async () => {
      try {
        await queryDb.persist.delete(idbValidKey);
      } catch (error) {
        Sentry.captureException(error);
        console.error('[QueryPersister] Failed to remove client:', error);
      }
    },
  } satisfies Persister;
}

/** Persistent offline persister — shared key, survives browser restart. */
export const persister = createIDBPersister();

/** Session-scoped persister — per-tab key, cleaned on tab close. */
export const sessionPersister = createIDBPersister(`${SESSION_KEY_PREFIX}${getTabSessionId()}`);

/**
 * Remove orphaned session records older than 24 hours.
 * Handles cases where `beforeunload` didn't fire (crash, mobile kill).
 * Call once on app startup (fire-and-forget).
 */
export async function cleanupOrphanedSessions(): Promise<void> {
  try {
    const cutoff = Date.now() - ORPHAN_MAX_AGE_MS;
    const allRecords = await queryDb.persist.toArray();
    const orphanKeys = allRecords
      .filter((r) => r.key.startsWith(SESSION_KEY_PREFIX) && r.timestamp < cutoff)
      .map((r) => r.key);

    if (orphanKeys.length > 0) {
      await queryDb.persist.bulkDelete(orphanKeys);
      console.debug(`[QueryPersister] Cleaned up ${orphanKeys.length} orphaned session(s)`);
    }
  } catch (error) {
    // Non-critical — orphans will be cleaned up next time
    console.debug('[QueryPersister] Orphan cleanup failed:', error);
  }
}

// Best-effort cleanup of session cache on tab close
window.addEventListener('beforeunload', () => {
  sessionPersister.removeClient();
});
