/**
 * React Query IndexedDB Persister — hybrid per-query + bundled storage
 *
 * UNIVERSAL PATTERN - Part of the offline persistence layer.
 *
 * Product entity queries (task, label, attachment, page, …) are stored as
 * individual IDB records for incremental diffing — only changed queries are
 * written. Context queries (me, organization, members, …) are bundled into
 * the meta record since they are few, small, and all needed at startup.
 *
 * Owner-aware facade (decision 1d): records live in the per-user `appdb`
 * (`~/query/app-db`), resolved live on every op. While signed out no DB is bound,
 * so the persister is a no-op (`restoreClient`→undefined ⇒ in-memory cache,
 * `persistClient`→skip). The provider therefore stays mounted at root; persistence
 * simply follows the user. Scope no longer carries the owner (the DB name does):
 *
 * - **Offline mode** (`offlineAccess=true`): scope `rq`, survives browser restart.
 * - **Session mode** (`offlineAccess=false`): scope `s-<uuid>`, survives refresh,
 *   cleaned on tab close via `beforeunload`; orphans swept on next startup.
 */

import type { DehydratedState } from '@tanstack/react-query';
import type { PersistedClient, Persister } from '@tanstack/react-query-persist-client';
import { appConfig } from 'shared';
import { type AppDatabase, getAppDb, type PersistedQueryRecord } from '~/query/app-db';

type DehydratedQuery = DehydratedState['queries'][number];

const SESSION_KEY_PREFIX = 's-';
const SESSION_ID_STORAGE_KEY = `${appConfig.slug}-tab-session-id`;
const ORPHAN_MAX_AGE_MS = 2 * 60 * 60 * 1000; // 2 hours

// -- Query classification ----------------------------------------------------

const productEntitySet = new Set<string>(appConfig.productEntityTypes);

function isProductQuery(queryKey: unknown): boolean {
  const key = queryKey as unknown[];
  const entity = Array.isArray(key) ? key[0] : undefined;
  return typeof entity === 'string' && productEntitySet.has(entity);
}

// -- Session ID management ---------------------------------------------------

function getTabSessionId(): string {
  let id = sessionStorage.getItem(SESSION_ID_STORAGE_KEY);
  if (!id) {
    id = crypto.randomUUID();
    sessionStorage.setItem(SESSION_ID_STORAGE_KEY, id);
  }
  return id;
}

// -- Persister factory -------------------------------------------------------

/**
 * Throttle interval for IDB writes. PersistQueryClientProvider fires on every
 * cache event (added/removed/updated) with no built-in throttle, which causes
 * excessive dehydrate + IDB write cycles during high-frequency updates like
 * virtual scroll re-renders. This batches writes to at most one per interval.
 */
const PERSIST_THROTTLE_MS = 1000;

/** In-memory change trackers per persister, reset on owner (DB) rebind. */
const trackerResets: Array<() => void> = [];

/**
 * Creates a hybrid IndexedDB persister for React Query, backed by the live `appdb`.
 *
 * Product entity queries are stored as individual IDB records (incremental
 * diffing). Context queries are bundled into the meta record. All ops no-op while
 * no per-user DB is bound (signed out).
 */
function createIDBPersister(scope = 'rq') {
  /** In-memory change tracker: queryHash → last persisted dataUpdatedAt (product queries only) */
  const lastPersistedAt = new Map<string, number>();
  /** In-memory snapshot of last persisted context queries for diffing */
  let lastContextSnapshot = '';
  let pendingClient: PersistedClient | null = null;
  let timeoutId: ReturnType<typeof setTimeout> | null = null;

  function resetTracker() {
    lastPersistedAt.clear();
    lastContextSnapshot = '';
  }
  trackerResets.push(resetTracker);

  /** Remove all records for this scope (used for cold session scopes + rollback deploys). */
  async function clearScope(db: AppDatabase) {
    await db.transaction('rw', db.queries, db.meta, async () => {
      const ids = await db.queries.where('scope').equals(scope).primaryKeys();
      await db.queries.bulkDelete(ids);
      await db.meta.delete(scope);
    });
    resetTracker();
  }

  /**
   * Cache-bust on a breaking schema change: wipe cached query DATA (product
   * records + bundled context queries) but KEEP queued mutations so offline
   * edits replay (and quarantine to failed_sync if they then 4xx). Advances the
   * stored clientCacheVersion. See info/SCHEMA_EVOLUTION.md.
   */
  async function bustQueriesKeepMutations(db: AppDatabase) {
    await db.transaction('rw', db.queries, db.meta, async () => {
      const ids = await db.queries.where('scope').equals(scope).primaryKeys();
      await db.queries.bulkDelete(ids);
      const existing = await db.meta.get(scope);
      if (existing) {
        await db.meta.put({ ...existing, contextQueries: [], clientCacheVersion: appConfig.clientCacheVersion });
      }
    });
    resetTracker();
  }

  async function flush() {
    const client = pendingClient;
    pendingClient = null;
    timeoutId = null;
    if (!client) return;

    const db = getAppDb();
    if (!db) return;

    try {
      const { queries, mutations } = client.clientState;

      // Partition into product vs context
      const productQueries: DehydratedQuery[] = [];
      const contextQueries: DehydratedQuery[] = [];
      for (const q of queries) {
        if (isProductQuery(q.queryKey)) productQueries.push(q);
        else contextQueries.push(q);
      }

      // 1. Diff product queries: collect only changed
      const upserts: PersistedQueryRecord[] = [];
      const currentHashes = new Set<string>();

      for (const q of productQueries) {
        currentHashes.add(q.queryHash);
        const prev = lastPersistedAt.get(q.queryHash);
        if (prev === q.state.dataUpdatedAt) continue;

        upserts.push({
          id: `${scope}:${q.queryHash}`,
          scope,
          queryHash: q.queryHash,
          queryKey: q.queryKey,
          state: q.state,
          dataUpdatedAt: q.state.dataUpdatedAt,
        });
        lastPersistedAt.set(q.queryHash, q.state.dataUpdatedAt);
      }

      // 2. Detect removals: tracked product queries no longer in dehydrated state
      const removals: string[] = [];
      for (const hash of lastPersistedAt.keys()) {
        if (!currentHashes.has(hash)) {
          removals.push(`${scope}:${hash}`);
          lastPersistedAt.delete(hash);
        }
      }

      // 3. Diff context queries by a lightweight snapshot
      const contextSnapshot = JSON.stringify(contextQueries.map((q) => [q.queryHash, q.state.dataUpdatedAt]));
      const contextChanged = contextSnapshot !== lastContextSnapshot;

      // 4. Batch write in a single IDB transaction
      const hasProductChanges = upserts.length > 0 || removals.length > 0;
      if (hasProductChanges || contextChanged) {
        await db.transaction('rw', db.queries, db.meta, async () => {
          if (upserts.length > 0) await db.queries.bulkPut(upserts);
          if (removals.length > 0) await db.queries.bulkDelete(removals);
          await db.meta.put({
            key: scope,
            timestamp: client.timestamp,
            buster: client.buster,
            clientCacheVersion: appConfig.clientCacheVersion,
            mutations,
            contextQueries,
          });
        });
        lastContextSnapshot = contextSnapshot;

        console.debug(
          `[QueryPersister] Wrote ${upserts.length} product changed, removed ${removals.length}, ` +
            `${contextChanged ? `${contextQueries.length} context bundled` : 'context unchanged'} (${scope})`,
        );
      }
    } catch (error) {
      console.error('[QueryPersister] Failed to persist client:', error);
    }
  }

  return {
    persistClient: async (client: PersistedClient) => {
      if (!getAppDb()) return; // Signed out → in-memory only
      pendingClient = client;
      if (!timeoutId) {
        timeoutId = setTimeout(flush, PERSIST_THROTTLE_MS);
      }
    },

    /** Force-flush any pending throttled write immediately. */
    flush: async () => {
      if (timeoutId) {
        clearTimeout(timeoutId);
        timeoutId = null;
      }
      await flush();
    },

    restoreClient: async (): Promise<PersistedClient | undefined> => {
      const db = getAppDb();
      if (!db) return undefined; // Signed out → in-memory cache
      try {
        let meta = await db.meta.get(scope);
        if (!meta) return undefined;

        // Cache-bust on breaking schema change: a mismatch between the persisted
        // version and appConfig.clientCacheVersion wipes cached query data (keeping
        // queued mutations). A missing version (pre-feature build) seeds without
        // wiping. See info/SCHEMA_EVOLUTION.md.
        const persistedVersion = meta.clientCacheVersion ?? appConfig.clientCacheVersion;
        if (persistedVersion !== appConfig.clientCacheVersion) {
          if (scope.startsWith(SESSION_KEY_PREFIX)) {
            // Session scopes are cold — wipe entirely rather than salvage.
            await clearScope(db);
            return undefined;
          }
          await bustQueriesKeepMutations(db);
          meta = (await db.meta.get(scope)) ?? meta;
        }

        // Product queries from individual records
        const productRecords = await db.queries.where('scope').equals(scope).toArray();

        // Populate change tracker for subsequent writes
        for (const q of productRecords) {
          lastPersistedAt.set(q.queryHash, q.dataUpdatedAt);
        }

        // Merge product records + context queries from meta
        const allQueries: DehydratedQuery[] = [
          ...productRecords.map((q) => ({
            queryHash: q.queryHash,
            queryKey: q.queryKey,
            state: q.state,
          })),
          ...(meta.contextQueries ?? []),
        ];

        // Seed the context snapshot for diffing on next write
        lastContextSnapshot = JSON.stringify(
          (meta.contextQueries ?? []).map((q) => [q.queryHash, q.state.dataUpdatedAt]),
        );

        return {
          timestamp: meta.timestamp,
          buster: meta.buster,
          clientState: {
            queries: allQueries,
            mutations: meta.mutations ?? [],
          },
        };
      } catch (error) {
        console.error('[QueryPersister] Failed to restore client:', error);
        return undefined;
      }
    },

    removeClient: async () => {
      const db = getAppDb();
      if (!db) {
        resetTracker();
        return;
      }
      try {
        await db.transaction('rw', db.queries, db.meta, async () => {
          const ids = await db.queries.where('scope').equals(scope).primaryKeys();
          await db.queries.bulkDelete(ids);
          await db.meta.delete(scope);
        });
        resetTracker();
      } catch (error) {
        console.error('[QueryPersister] Failed to remove client:', error);
      }
    },

    /** Cancel any pending throttled write and remove the scoped records. */
    teardown: () => {
      pendingClient = null;
      if (timeoutId) {
        clearTimeout(timeoutId);
        timeoutId = null;
      }
      const db = getAppDb();
      // Fire-and-forget — best effort during beforeunload
      db?.transaction('rw', db.queries, db.meta, async () => {
        const ids = await db.queries.where('scope').equals(scope).primaryKeys();
        await db.queries.bulkDelete(ids);
        await db.meta.delete(scope);
      }).catch(() => {});
      resetTracker();
    },
  } satisfies Persister & { flush: () => Promise<void>; teardown: () => void };
}

/** Persistent offline persister — scope `rq`, survives browser restart. */
export const persister = createIDBPersister('rq');

/** Session-scoped persister — per-tab scope, cleaned on tab close. */
export const sessionPersister = createIDBPersister(`${SESSION_KEY_PREFIX}${getTabSessionId()}`);

/** Reset persister change trackers (called on owner rebind so they match the freshly bound DB). */
export function resetPersisters(): void {
  for (const reset of trackerResets) reset();
}

/**
 * Remove orphaned session records older than 2 hours.
 * Handles cases where `beforeunload` didn't fire (crash, mobile kill).
 * Also skips the current tab's session to avoid self-cleanup on refresh.
 * Call once on app startup (fire-and-forget). No-ops while signed out.
 */
export async function cleanupOrphanedSessions(): Promise<void> {
  const db = getAppDb();
  if (!db) return;
  try {
    const cutoff = Date.now() - ORPHAN_MAX_AGE_MS;
    const currentSessionScope = `${SESSION_KEY_PREFIX}${getTabSessionId()}`;
    const allMeta = await db.meta.toArray();
    const orphanScopes = allMeta
      .filter((m) => m.key.startsWith(SESSION_KEY_PREFIX) && m.key !== currentSessionScope && m.timestamp < cutoff)
      .map((m) => m.key);

    if (orphanScopes.length > 0) {
      await db.transaction('rw', db.queries, db.meta, async () => {
        for (const orphanScope of orphanScopes) {
          const ids = await db.queries.where('scope').equals(orphanScope).primaryKeys();
          await db.queries.bulkDelete(ids);
          await db.meta.delete(orphanScope);
        }
      });
      console.debug(`[QueryPersister] Cleaned up ${orphanScopes.length} orphaned session(s)`);
    }
  } catch (error) {
    // Non-critical — orphans will be cleaned up next time
    console.debug('[QueryPersister] Orphan cleanup failed:', error);
  }
}

// Best-effort cleanup of session cache on tab close.
// Uses teardown() to cancel any pending throttled flush before deleting,
// preventing the race where flush() re-creates the record after deletion.
window.addEventListener('beforeunload', () => {
  sessionPersister.teardown();
});
