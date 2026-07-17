import type { DehydratedState } from '@tanstack/react-query';
import type { PersistedClient, Persister } from '@tanstack/react-query-persist-client';
import { appConfig } from 'shared';
import { currentSchemaVersion } from 'shared/schema-evolution';
import { reportCriticalError } from '~/lib/tracing';
import { type AppDatabase, getAppDb, type PersistedQueryRecord } from '~/query/app-db';
import { entityTypeOf, migrateMutations, migrateQueryState } from '~/query/cache-migration';
import { isBundleStale, markBundleStale } from '~/query/schema-version-guard';

type DehydratedQuery = DehydratedState['queries'][number];

const SESSION_KEY_PREFIX = 's-';
const SESSION_ID_STORAGE_KEY = `${appConfig.slug}-tab-session-id`;
const ORPHAN_MAX_AGE_MS = 2 * 60 * 60 * 1000; // 2 hours

// Query classification

const productEntitySet = new Set<string>(appConfig.productEntityTypes);

function isProductQuery(queryKey: unknown): boolean {
  const key = queryKey as unknown[];
  const entity = Array.isArray(key) ? key[0] : undefined;
  return typeof entity === 'string' && productEntitySet.has(entity);
}

// Session ID management

function getTabSessionId(): string {
  let id = sessionStorage.getItem(SESSION_ID_STORAGE_KEY);
  if (!id) {
    id = crypto.randomUUID();
    sessionStorage.setItem(SESSION_ID_STORAGE_KEY, id);
  }
  return id;
}

// Persister factory

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
 * Hybrid IndexedDB persister for React Query, backed by the live `appdb`: product entity queries
 * are individual IDB records (incremental diffing), context queries are bundled into the meta
 * record. All ops no-op while no per-user DB is bound (signed out).
 */
function createIDBPersister(scope = 'rq') {
  /** In-memory change tracker: queryHash → last persisted dataUpdatedAt (product queries only) */
  const lastPersistedAt = new Map<string, number>();
  /** In-memory snapshot of last persisted context queries for diffing */
  let lastChannelSnapshot = '';
  let pendingClient: PersistedClient | null = null;
  let timeoutId: ReturnType<typeof setTimeout> | null = null;

  function resetTracker() {
    lastPersistedAt.clear();
    lastChannelSnapshot = '';
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
   * stored clientCacheVersion.
   */
  async function bustQueriesKeepMutations(db: AppDatabase) {
    await db.transaction('rw', db.queries, db.meta, async () => {
      const ids = await db.queries.where('scope').equals(scope).primaryKeys();
      await db.queries.bulkDelete(ids);
      const existing = await db.meta.get(scope);
      if (existing) {
        await db.meta.put({ ...existing, channelQueries: [], clientCacheVersion: appConfig.clientCacheVersion });
      }
    });
    resetTracker();
  }

  /** Chunk size for the lens boot-migration pass (records per Dexie transaction). */
  const MIGRATION_CHUNK_SIZE = 200;

  /**
   * Boot-time lens migration: rewrite cached product entity rows, bundled
   * context queries, and queued mutation variables from the persisted schema
   * ordinal up to the bundle's currentSchemaVersion, locally with no refetch.
   * Chunked; the pointer only advances in the final meta transaction, so a
   * crash mid-pass resumes idempotently.
   */
  async function migrateScopeToCurrent(db: AppDatabase, fromVersion: number) {
    const records = await db.queries.where('scope').equals(scope).toArray();
    for (let i = 0; i < records.length; i += MIGRATION_CHUNK_SIZE) {
      const chunk = records.slice(i, i + MIGRATION_CHUNK_SIZE);
      // Rewrites are computed before the write: Dexie transactions auto-commit
      // on non-Dexie awaits, and the lens chain (doba) is async.
      const rewritten: PersistedQueryRecord[] = [];
      for (const record of chunk) {
        const entityType = entityTypeOf(record.queryKey);
        if (!entityType) continue;
        rewritten.push({ ...record, state: await migrateQueryState(entityType, record.state, fromVersion) });
      }
      if (rewritten.length > 0) await db.queries.bulkPut(rewritten);
    }

    const meta = await db.meta.get(scope);
    if (!meta) return;
    const channelQueries: typeof meta.channelQueries = [];
    for (const q of meta.channelQueries ?? []) {
      const entityType = entityTypeOf(q.queryKey);
      channelQueries.push(entityType ? { ...q, state: await migrateQueryState(entityType, q.state, fromVersion) } : q);
    }
    const mutations = migrateMutations(meta.mutations ?? [], fromVersion);
    // Final write advances the pointer atomically with the last rewritten data.
    await db.meta.put({ ...meta, channelQueries, mutations, schemaVersion: currentSchemaVersion });
    console.debug(`[QueryPersister] Lens migration v${fromVersion} → v${currentSchemaVersion} complete (${scope})`);
  }

  /** Cross-tab mutual exclusion for the migration pass (Web Locks when available). */
  async function withMigrationLock(fn: () => Promise<void>) {
    if (typeof navigator !== 'undefined' && 'locks' in navigator) {
      await navigator.locks.request(`cache-migration:${scope}`, fn);
    } else {
      await fn();
    }
  }

  async function flush() {
    const client = pendingClient;
    pendingClient = null;
    timeoutId = null;
    if (!client) return;

    if (isBundleStale()) return;

    const db = getAppDb();
    if (!db) return;

    try {
      // Disk-side guard: another tab may have migrated the store forward since
      // this bundle booted (broadcast can race the first write).
      const existing = await db.meta.get(scope);
      if ((existing?.schemaVersion ?? 0) > currentSchemaVersion) {
        markBundleStale();
        console.debug(`[QueryPersister] Store is at a newer schema version — persisting disabled (${scope})`);
        return;
      }

      const { queries, mutations } = client.clientState;

      const productQueries: DehydratedQuery[] = [];
      const channelQueries: DehydratedQuery[] = [];
      for (const q of queries) {
        if (isProductQuery(q.queryKey)) productQueries.push(q);
        else channelQueries.push(q);
      }

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

      const removals: string[] = [];
      for (const hash of lastPersistedAt.keys()) {
        if (!currentHashes.has(hash)) {
          removals.push(`${scope}:${hash}`);
          lastPersistedAt.delete(hash);
        }
      }

      // Diff context queries by a lightweight snapshot
      const channelSnapshot = JSON.stringify(channelQueries.map((q) => [q.queryHash, q.state.dataUpdatedAt]));
      const channelChanged = channelSnapshot !== lastChannelSnapshot;

      const hasProductChanges = upserts.length > 0 || removals.length > 0;
      if (hasProductChanges || channelChanged) {
        await db.transaction('rw', db.queries, db.meta, async () => {
          if (upserts.length > 0) await db.queries.bulkPut(upserts);
          if (removals.length > 0) await db.queries.bulkDelete(removals);
          await db.meta.put({
            key: scope,
            timestamp: client.timestamp,
            buster: client.buster,
            clientCacheVersion: appConfig.clientCacheVersion,
            schemaVersion: currentSchemaVersion,
            mutations,
            channelQueries,
          });
        });
        lastChannelSnapshot = channelSnapshot;

        console.debug(
          `[QueryPersister] Wrote ${upserts.length} product changed, removed ${removals.length}, ` +
            `${channelChanged ? `${channelQueries.length} context bundled` : 'context unchanged'} (${scope})`,
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
        // version and appConfig.clientCacheVersion wipes cached query data
        // (keeping queued mutations). A missing version seeds without wiping.
        const persistedVersion = meta.clientCacheVersion ?? appConfig.clientCacheVersion;
        if (persistedVersion !== appConfig.clientCacheVersion) {
          if (scope.startsWith(SESSION_KEY_PREFIX)) {
            // Session scopes are cold, so wipe them entirely.
            await clearScope(db);
            return undefined;
          }
          await bustQueriesKeepMutations(db);
          meta = (await db.meta.get(scope)) ?? meta;
        }

        // Lens boot migration: a persisted schema ordinal behind the bundle is
        // rewritten locally (cached rows + queued mutations, no refetch). A
        // missing ordinal seeds as current; genuinely old caches are covered by
        // the clientCacheVersion bust above.
        const pointer = meta.schemaVersion ?? currentSchemaVersion;
        if (pointer !== currentSchemaVersion) {
          if (scope.startsWith(SESSION_KEY_PREFIX)) {
            // Session scopes are cold, so wipe them.
            await clearScope(db);
            return undefined;
          }
          if (pointer > currentSchemaVersion) {
            // Disk is ahead (another tab migrated forward, or a rollback deploy):
            // stop persisting and let the PWA update flow replace this bundle.
            markBundleStale();
            return undefined;
          }
          await withMigrationLock(async () => {
            // Re-read after acquiring the lock; another tab may have migrated.
            const fresh = await db.meta.get(scope);
            const freshPointer = fresh?.schemaVersion ?? currentSchemaVersion;
            if (freshPointer < currentSchemaVersion) await migrateScopeToCurrent(db, freshPointer);
          });
          meta = (await db.meta.get(scope)) ?? meta;
        }

        const productRecords = await db.queries.where('scope').equals(scope).toArray();

        for (const q of productRecords) {
          lastPersistedAt.set(q.queryHash, q.dataUpdatedAt);
        }

        const allQueries: DehydratedQuery[] = [
          ...productRecords.map((q) => ({
            queryHash: q.queryHash,
            queryKey: q.queryKey,
            state: q.state,
          })),
          ...(meta.channelQueries ?? []),
        ];

        // Seed the context snapshot for diffing on next write
        lastChannelSnapshot = JSON.stringify(
          (meta.channelQueries ?? []).map((q) => [q.queryHash, q.state.dataUpdatedAt]),
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
        reportCriticalError('persister.restore_failed', error);
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
      // Fire-and-forget; best effort during beforeunload
      db?.transaction('rw', db.queries, db.meta, async () => {
        const ids = await db.queries.where('scope').equals(scope).primaryKeys();
        await db.queries.bulkDelete(ids);
        await db.meta.delete(scope);
      }).catch(() => {});
      resetTracker();
    },
  } satisfies Persister & { flush: () => Promise<void>; teardown: () => void };
}

/** Persistent offline persister: scope `rq`, survives browser restart. */
export const persister = createIDBPersister('rq');

/** Session-scoped persister: per-tab scope, cleaned on tab close. */
export const sessionPersister = createIDBPersister(`${SESSION_KEY_PREFIX}${getTabSessionId()}`);

/** Reset persister change trackers (called on owner rebind so they match the freshly bound DB). */
export function resetPersisters(): void {
  for (const reset of trackerResets) reset();
}

/**
 * Remove session records older than 2 hours, for tabs where `beforeunload`
 * didn't fire (crash, mobile kill). Skips the current tab. Call once on app
 * startup (fire-and-forget); no-ops while signed out.
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
    // Non-critical; orphans are cleaned up on a later startup
    console.debug('[QueryPersister] Orphan cleanup failed:', error);
  }
}

// Best-effort cleanup of session cache on tab close. teardown() cancels any
// pending throttled flush first, so it can't re-create the record after deletion.
window.addEventListener('beforeunload', () => {
  sessionPersister.teardown();
});
