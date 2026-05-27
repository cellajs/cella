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
 * Storage modes:
 * - **Offline mode** (`offlineAccess=true`): Uses scope `rq`,
 *   persists across browser restarts for full offline capability.
 * - **Session mode** (`offlineAccess=false`): Uses scope `s-<uuid>`,
 *   survives refresh but is cleaned up on tab close via `beforeunload`.
 *   Orphaned sessions (e.g. tab crash) are cleaned up on next app startup.
 */

import type { DehydratedState } from '@tanstack/react-query';
import type { PersistedClient, Persister } from '@tanstack/react-query-persist-client';
import { Dexie } from 'dexie';
import { appConfig } from 'shared';

type DehydratedQuery = DehydratedState['queries'][number];

const SESSION_KEY_PREFIX = 's-';
const SESSION_ID_STORAGE_KEY = `${appConfig.slug}-tab-session-id`;
const ORPHAN_MAX_AGE_MS = 2 * 60 * 60 * 1000; // 2 hours

// -- Record types ------------------------------------------------------------

interface PersistedQueryRecord {
  /** Compound key: `${scope}:${queryHash}` */
  id: string;
  scope: string;
  queryHash: string;
  queryKey: DehydratedQuery['queryKey'];
  state: DehydratedQuery['state'];
  dataUpdatedAt: number;
}

interface PersistedMetaRecord {
  /** Scope key: 'rq' or 's-<uuid>' */
  key: string;
  timestamp: number;
  buster: string;
  mutations: DehydratedState['mutations'];
  /** Context queries bundled directly in meta */
  contextQueries: DehydratedQuery[];
}

// -- Dexie database ----------------------------------------------------------

class QueryPersisterDB extends Dexie {
  queries!: Dexie.Table<PersistedQueryRecord, string>;
  meta!: Dexie.Table<PersistedMetaRecord, string>;

  constructor() {
    super(`${appConfig.slug}-query-persister`);

    // v1 — original single-blob table (kept for migration path)
    this.version(1).stores({ persist: 'key' });

    // v2 — per-query storage with scope + priority index (intermediate)
    this.version(2)
      .stores({
        persist: null,
        queries: 'id, scope, priority',
        meta: 'key',
      })
      .upgrade(async (tx) => {
        const oldTable = tx.table('persist');
        const oldRecords = await oldTable.toArray();
        if (oldRecords.length === 0) return;

        const queriesTable = tx.table('queries');
        const metaTable = tx.table('meta');

        for (const record of oldRecords) {
          const scope = record.key as string;
          const queries = (record.clientState as DehydratedState)?.queries ?? [];
          const mutations = (record.clientState as DehydratedState)?.mutations ?? [];

          await metaTable.put({
            key: scope,
            timestamp: record.timestamp as number,
            buster: record.buster as string,
            mutations,
            contextQueries: [],
          });

          if (queries.length > 0) {
            await queriesTable.bulkPut(
              queries.map((q) => ({
                id: `${scope}:${q.queryHash}`,
                scope,
                queryHash: q.queryHash,
                queryKey: q.queryKey,
                state: q.state,
                dataUpdatedAt: q.state.dataUpdatedAt,
                priority: isProductQuery(q.queryKey) ? 'product' : 'context',
              })),
            );
          }
        }
      });

    // v3 — bundle context queries into meta, drop priority index, shorten scope
    this.version(3)
      .stores({
        queries: 'id, scope', // Drop priority index
        meta: 'key',
      })
      .upgrade(async (tx) => {
        const queriesTable = tx.table<PersistedQueryRecord & { priority?: string }>('queries');
        const metaTable = tx.table<PersistedMetaRecord>('meta');

        // Collect all scopes from meta
        const allMeta = await metaTable.toArray();

        for (const meta of allMeta) {
          const oldScope = meta.key;
          // Remap scope: 'reactQuery' → 'rq', 'session-*' → 's-*'
          const newScope =
            oldScope === 'reactQuery'
              ? 'rq'
              : oldScope.startsWith('session-')
                ? `s-${oldScope.slice('session-'.length)}`
                : oldScope;

          const scopedQueries = await queriesTable.where('scope').equals(oldScope).toArray();

          // Separate context vs product
          const contextQueries: DehydratedQuery[] = [];
          const productToKeep: PersistedQueryRecord[] = [];
          const idsToDelete: string[] = [];

          for (const q of scopedQueries) {
            idsToDelete.push(q.id); // Delete all old records (old scope prefix)
            if (isProductQuery(q.queryKey)) {
              productToKeep.push({
                id: `${newScope}:${q.queryHash}`,
                scope: newScope,
                queryHash: q.queryHash,
                queryKey: q.queryKey,
                state: q.state,
                dataUpdatedAt: q.dataUpdatedAt,
              });
            } else {
              contextQueries.push({
                queryHash: q.queryHash,
                queryKey: q.queryKey,
                state: q.state,
              });
            }
          }

          // Delete old records, insert remapped product records
          if (idsToDelete.length > 0) await queriesTable.bulkDelete(idsToDelete);
          if (productToKeep.length > 0) await queriesTable.bulkPut(productToKeep);

          // Update meta with new scope and bundled context queries
          if (newScope !== oldScope) await metaTable.delete(oldScope);
          await metaTable.put({
            ...meta,
            key: newScope,
            contextQueries,
          });
        }
      });
  }
}

const queryDb = new QueryPersisterDB();

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

/**
 * Creates a hybrid IndexedDB persister for React Query.
 *
 * Product entity queries are stored as individual IDB records (incremental
 * diffing). Context queries are bundled into the meta record.
 */
function createIDBPersister(scope = 'rq') {
  /** In-memory change tracker: queryHash → last persisted dataUpdatedAt (product queries only) */
  const lastPersistedAt = new Map<string, number>();
  /** In-memory snapshot of last persisted context queries for diffing */
  let lastContextSnapshot = '';
  let pendingClient: PersistedClient | null = null;
  let timeoutId: ReturnType<typeof setTimeout> | null = null;

  async function flush() {
    const client = pendingClient;
    pendingClient = null;
    timeoutId = null;
    if (!client) return;

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
        await queryDb.transaction('rw', queryDb.queries, queryDb.meta, async () => {
          if (upserts.length > 0) await queryDb.queries.bulkPut(upserts);
          if (removals.length > 0) await queryDb.queries.bulkDelete(removals);
          await queryDb.meta.put({
            key: scope,
            timestamp: client.timestamp,
            buster: client.buster,
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
      try {
        const meta = await queryDb.meta.get(scope);
        if (!meta) return undefined;

        // Product queries from individual records
        const productRecords = await queryDb.queries.where('scope').equals(scope).toArray();

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
      try {
        await queryDb.transaction('rw', queryDb.queries, queryDb.meta, async () => {
          const ids = await queryDb.queries.where('scope').equals(scope).primaryKeys();
          await queryDb.queries.bulkDelete(ids);
          await queryDb.meta.delete(scope);
        });
        lastPersistedAt.clear();
        lastContextSnapshot = '';
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
      // Fire-and-forget — best effort during beforeunload
      queryDb
        .transaction('rw', queryDb.queries, queryDb.meta, async () => {
          const ids = await queryDb.queries.where('scope').equals(scope).primaryKeys();
          await queryDb.queries.bulkDelete(ids);
          await queryDb.meta.delete(scope);
        })
        .catch(() => {});
      lastPersistedAt.clear();
      lastContextSnapshot = '';
    },
  } satisfies Persister & { flush: () => Promise<void>; teardown: () => void };
}

/** Persistent offline persister — shared scope, survives browser restart. */
export const persister = createIDBPersister();

/** Session-scoped persister — per-tab scope, cleaned on tab close. */
export const sessionPersister = createIDBPersister(`${SESSION_KEY_PREFIX}${getTabSessionId()}`);

/**
 * Remove orphaned session records older than 2 hours.
 * Handles cases where `beforeunload` didn't fire (crash, mobile kill).
 * Also skips the current tab's session to avoid self-cleanup on refresh.
 * Call once on app startup (fire-and-forget).
 */
export async function cleanupOrphanedSessions(): Promise<void> {
  try {
    const cutoff = Date.now() - ORPHAN_MAX_AGE_MS;
    const currentSessionScope = `${SESSION_KEY_PREFIX}${getTabSessionId()}`;
    const allMeta = await queryDb.meta.toArray();
    const orphanScopes = allMeta
      .filter((m) => m.key.startsWith(SESSION_KEY_PREFIX) && m.key !== currentSessionScope && m.timestamp < cutoff)
      .map((m) => m.key);

    if (orphanScopes.length > 0) {
      await queryDb.transaction('rw', queryDb.queries, queryDb.meta, async () => {
        for (const orphanScope of orphanScopes) {
          const ids = await queryDb.queries.where('scope').equals(orphanScope).primaryKeys();
          await queryDb.queries.bulkDelete(ids);
          await queryDb.meta.delete(orphanScope);
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
