import type { DehydratedState, Query } from '@tanstack/react-query';
import type { PersistedClient, Persister, PersistQueryClientOptions } from '@tanstack/react-query-persist-client';
import { appConfig } from 'shared';
import { currentSchemaVersion } from 'shared/schema-evolution';
import { reportCriticalError } from '~/lib/tracing';
import { entityTypeOf, migrateMutations, migrateQueryState, productTypeOf } from '~/query/cache-migration';
import { getLocalUserDb, type LocalUserDatabase, type PersistedQueryRecord } from '~/query/local-user-db';
import { upgradePersistedMutation, withVariablesVersion } from '~/query/offline/mutation-variables';
import { isBundleStale, markBundleStale } from '~/query/schema-version-guard';
import { onPageHide } from '~/utils/on-page-hide';

type DehydratedQuery = DehydratedState['queries'][number];
type DehydratedMutation = DehydratedState['mutations'][number];

/** A stored queue with each mutation in the variables shape this bundle reads; one that cannot get there is quarantined and left out. */
const inCurrentShape = (mutations: DehydratedMutation[]): DehydratedMutation[] =>
  mutations.flatMap((mutation) => upgradePersistedMutation(mutation) ?? []);

const sessionIdStorageKey = `${appConfig.slug}-tab-session-id`;
const orphanMaxAgeMs = 2 * 60 * 60 * 1000;

/** What the persister writes: a query that succeeded and does not opt out through `meta: { persist: false }` (a bearer token, another account's data). */
export const shouldPersistQuery = (query: Query): boolean => query.state.status === 'success' && query.meta?.persist !== false;

function getTabSessionId(): string {
  let id = sessionStorage.getItem(sessionIdStorageKey);
  if (!id) {
    id = crypto.randomUUID();
    sessionStorage.setItem(sessionIdStorageKey, id);
  }
  return id;
}

const tabSessionId = getTabSessionId();
const hasWebLocks = typeof navigator !== 'undefined' && 'locks' in navigator;

/** Tabs of every bundle version lock and query this name, so it never changes. */
const tabLockPrefix = `${appConfig.slug}-mutation-owner:`;

const mutationRecordPrefix = (scope: string) => `${scope}:mut:`;

/** Holds this tab's lock until the tab closes: other tabs' restore reads it as this tab being open. */
function holdTabLock(): void {
  if (!hasWebLocks) return;
  void navigator.locks.request(`${tabLockPrefix}${tabSessionId}`, () => new Promise(() => {}));
}

/** Tab session ids currently holding a tab lock; null when undetectable. */
async function liveTabSessionIds(): Promise<Set<string> | null> {
  if (!hasWebLocks) return null;
  try {
    const { held } = await navigator.locks.query();
    return new Set(
      (held ?? [])
        .map((lock) => lock.name ?? '')
        .filter((name) => name.startsWith(tabLockPrefix))
        .map((name) => name.slice(tabLockPrefix.length)),
    );
  } catch {
    return null;
  }
}

/** Delete a scope's queries, its meta record and every tab's mutation record; call it inside a `queries` and `meta` transaction. */
async function deleteScope(db: LocalUserDatabase, scope: string): Promise<void> {
  const ids = await db.queries.where('scope').equals(scope).primaryKeys();
  await db.queries.bulkDelete(ids);
  await db.meta.delete(scope);
  const mutationKeys = await db.meta.where('key').startsWith(mutationRecordPrefix(scope)).primaryKeys();
  await db.meta.bulkDelete(mutationKeys);
}

/** What the bundled queries are diffed by: each query's hash and data timestamp. */
const snapshotOf = (queries: DehydratedQuery[]) => JSON.stringify(queries.map(({ queryHash, state }) => [queryHash, state.dataUpdatedAt]));

/** One IndexedDB write per interval: the latest snapshot wins. */
const persistThrottleMs = 1000;

/** Chunk size for the lens boot-migration pass (records per Dexie transaction). */
const migrationChunkSize = 200;

const trackerResets: Array<() => void> = [];

/**
 * IndexedDB persister backed by the live `localUserDb`: product entity queries get one record each for incremental diffing, every other query is bundled into the meta record.
 * Every operation no-ops while no per-user DB is bound (signed out).
 */
export function createIDBPersister(scope: string) {
  const tabMutationKey = `${mutationRecordPrefix(scope)}${tabSessionId}`;
  /** queryHash to last persisted dataUpdatedAt, product queries only. */
  const lastPersistedAt = new Map<string, number>();
  /** Snapshot of the last persisted bundled queries, for diffing. */
  let lastBundledSnapshot = '';
  /** Snapshot of this tab's last persisted paused mutations, for diffing. */
  let lastMutationsSnapshot = '';
  let pendingClient: PersistedClient | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;

  function resetTracker() {
    lastPersistedAt.clear();
    lastBundledSnapshot = '';
    lastMutationsSnapshot = '';
  }
  trackerResets.push(resetTracker);

  async function clearScope(db: LocalUserDatabase) {
    await db.transaction('rw', db.queries, db.meta, () => deleteScope(db, scope));
    resetTracker();
  }

  /** Clear incompatible query data while retaining queued mutations, then advance cache version. */
  async function bustQueriesKeepMutations(db: LocalUserDatabase) {
    await db.transaction('rw', db.queries, db.meta, async () => {
      const ids = await db.queries.where('scope').equals(scope).primaryKeys();
      await db.queries.bulkDelete(ids);
      const existing = await db.meta.get(scope);
      if (existing) {
        await db.meta.put({ ...existing, bundledQueries: [], clientCacheVersion: appConfig.clientCacheVersion });
      }
    });
    resetTracker();
  }

  /**
   * Migrate cached rows, bundled queries and mutation variables in chunks. The lenses are idempotent, so a pass cut
   * short runs again safely; the schema pointer advances only in the final metadata write.
   */
  async function migrateScopeToCurrent(db: LocalUserDatabase, fromVersion: number) {
    const records = await db.queries.where('scope').equals(scope).toArray();
    for (let i = 0; i < records.length; i += migrationChunkSize) {
      const chunk = records.slice(i, i + migrationChunkSize);
      // Rewrites precede the write: Dexie transactions auto-commit on non-Dexie awaits and the lens chain is async.
      const rewritten: PersistedQueryRecord[] = [];
      for (const record of chunk) {
        const entityType = entityTypeOf(record.queryKey);
        if (!entityType) continue;
        rewritten.push({ ...record, state: await migrateQueryState(entityType, record.state, fromVersion) });
      }
      if (rewritten.length > 0) await db.queries.bulkPut(rewritten);
    }

    // Each tab's queue migrates too, after the variables upgrade, so the lenses find the rows under the keys this bundle reads.
    const mutationRecords = await db.meta.where('key').startsWith(mutationRecordPrefix(scope)).toArray();
    for (const record of mutationRecords) {
      await db.meta.put({ ...record, mutations: migrateMutations(inCurrentShape(record.mutations ?? []), fromVersion) });
    }

    const meta = await db.meta.get(scope);
    if (!meta) return;
    const bundledQueries: DehydratedQuery[] = [];
    for (const query of meta.bundledQueries ?? []) {
      const entityType = entityTypeOf(query.queryKey);
      bundledQueries.push(entityType ? { ...query, state: await migrateQueryState(entityType, query.state, fromVersion) } : query);
    }
    const mutations = migrateMutations(inCurrentShape(meta.mutations ?? []), fromVersion);
    // Final write advances the pointer atomically with the last rewritten data.
    await db.meta.put({ ...meta, bundledQueries, mutations, schemaVersion: currentSchemaVersion });
    console.debug(`[QueryPersister] Lens migration v${fromVersion} → v${currentSchemaVersion} complete (${scope})`);
  }

  /** Cross-tab mutual exclusion for the migration pass (Web Locks when available). */
  async function withMigrationLock(migrate: () => Promise<void>) {
    if (hasWebLocks) {
      await navigator.locks.request(`cache-migration:${scope}`, migrate);
    } else {
      await migrate();
    }
  }

  async function flush() {
    const client = pendingClient;
    pendingClient = null;
    timer = null;
    if (!client) return;

    if (isBundleStale()) return;

    const db = getLocalUserDb();
    if (!db) return;

    try {
      // Another tab may have migrated the store forward since this bundle booted; the broadcast can lose the race to the first write.
      const existing = await db.meta.get(scope);
      if ((existing?.schemaVersion ?? 0) > currentSchemaVersion) {
        markBundleStale();
        console.debug(`[QueryPersister] Store is at a newer schema version, persisting disabled (${scope})`);
        return;
      }

      const { queries } = client.clientState;
      // Each queued mutation is stored with the version of its variables, which the restore reads.
      const mutations = client.clientState.mutations.map(withVariablesVersion);

      const productQueries: DehydratedQuery[] = [];
      const bundledQueries: DehydratedQuery[] = [];
      for (const query of queries) {
        if (productTypeOf(query.queryKey)) productQueries.push(query);
        else bundledQueries.push(query);
      }

      const upserts: PersistedQueryRecord[] = [];
      const currentHashes = new Set<string>();

      for (const { queryHash, queryKey, state } of productQueries) {
        currentHashes.add(queryHash);
        if (lastPersistedAt.get(queryHash) === state.dataUpdatedAt) continue;
        upserts.push({ id: `${scope}:${queryHash}`, scope, queryHash, queryKey, state, dataUpdatedAt: state.dataUpdatedAt });
      }

      const removedHashes = [...lastPersistedAt.keys()].filter((hash) => !currentHashes.has(hash));
      const removals = removedHashes.map((hash) => `${scope}:${hash}`);

      const bundledSnapshot = snapshotOf(bundledQueries);
      const bundledChanged = bundledSnapshot !== lastBundledSnapshot;

      // Paused mutations go to this tab's record; the shared meta record stays mutation-free so no tab clobbers another's queue.
      const mutationsSnapshot = JSON.stringify(mutations);
      const mutationsChanged = mutationsSnapshot !== lastMutationsSnapshot;

      const hasProductChanges = upserts.length > 0 || removals.length > 0;
      if (hasProductChanges || bundledChanged || mutationsChanged) {
        await db.transaction('rw', db.queries, db.meta, async () => {
          if (upserts.length > 0) await db.queries.bulkPut(upserts);
          if (removals.length > 0) await db.queries.bulkDelete(removals);
          if (mutationsChanged) {
            if (mutations.length > 0) {
              await db.meta.put({
                key: tabMutationKey,
                timestamp: client.timestamp,
                buster: client.buster,
                mutations,
                bundledQueries: [],
              });
            } else {
              await db.meta.delete(tabMutationKey);
            }
          }
          await db.meta.put({
            key: scope,
            timestamp: client.timestamp,
            buster: client.buster,
            clientCacheVersion: appConfig.clientCacheVersion,
            schemaVersion: currentSchemaVersion,
            mutations: [],
            bundledQueries,
          });
        });
        // The trackers follow a committed write to the database still bound, so the next flush retries a failed one.
        if (getLocalUserDb() === db) {
          for (const { queryHash, dataUpdatedAt } of upserts) lastPersistedAt.set(queryHash, dataUpdatedAt);
          for (const hash of removedHashes) lastPersistedAt.delete(hash);
          lastBundledSnapshot = bundledSnapshot;
          lastMutationsSnapshot = mutationsSnapshot;
        }

        console.debug(
          `[QueryPersister] Wrote ${upserts.length} product changed, removed ${removals.length}, ` +
            `${bundledChanged ? `${bundledQueries.length} bundled` : 'bundle unchanged'}` +
            `${mutationsChanged ? `, ${mutations.length} paused mutations (tab record)` : ''} (${scope})`,
        );
      }
    } catch (error) {
      console.error('[QueryPersister] Failed to persist client:', error);
    }
  }

  return {
    persistClient: async (client: PersistedClient) => {
      if (!getLocalUserDb()) return;
      pendingClient = client;
      if (!timer) {
        timer = setTimeout(flush, persistThrottleMs);
      }
    },

    /** Force-flush any pending throttled write immediately. */
    flush: async () => {
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
      await flush();
    },

    restoreClient: async (): Promise<PersistedClient | undefined> => {
      const db = getLocalUserDb();
      if (!db) return undefined;
      try {
        let meta = await db.meta.get(scope);
        if (!meta) return undefined;

        // A clientCacheVersion mismatch wipes cached query data but keeps queued mutations; a missing version seeds without wiping.
        const versionChanged = (meta.clientCacheVersion ?? appConfig.clientCacheVersion) !== appConfig.clientCacheVersion;
        // Upgrade rows and queued mutations when their lens ordinal trails the bundle; a missing ordinal seeds current.
        const pointer = meta.schemaVersion ?? currentSchemaVersion;

        if (versionChanged) {
          await bustQueriesKeepMutations(db);
          meta = (await db.meta.get(scope)) ?? meta;
        }

        if (pointer !== currentSchemaVersion) {
          if (pointer > currentSchemaVersion) {
            // Disk is ahead after another tab migrated forward or a rollback deploy: stop persisting and let the PWA update flow replace this bundle.
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
        for (const { queryHash, dataUpdatedAt } of productRecords) lastPersistedAt.set(queryHash, dataUpdatedAt);

        const bundledQueries = meta.bundledQueries ?? [];
        // Seed the snapshot the next write diffs against.
        lastBundledSnapshot = snapshotOf(bundledQueries);

        const allQueries: DehydratedQuery[] = [
          ...productRecords.map(({ queryHash, queryKey, state, dataUpdatedAt }) => ({ queryHash, queryKey, state, dehydratedAt: dataUpdatedAt })),
          ...bundledQueries,
        ];

        // Restores shared data, this tab's record, and orphaned tab records; live tabs keep theirs, and age substitutes when lock liveness is undetectable.
        const prefix = mutationRecordPrefix(scope);
        const { buster } = meta;
        const live = await liveTabSessionIds();
        // An orphaned queue moves under this tab's key in the transaction that deletes it, so a tab closed before its first write loses none.
        const tabMutations = await db.transaction('rw', db.meta, async () => {
          const records = await db.meta.where('key').startsWith(prefix).toArray();
          const own = records.find((record) => record.key === tabMutationKey)?.mutations ?? [];
          const orphaned = records.filter(({ key, timestamp }) => {
            if (key === tabMutationKey) return false;
            return live ? !live.has(key.slice(prefix.length)) : timestamp < Date.now() - orphanMaxAgeMs;
          });
          if (orphaned.length === 0) return own;
          const absorbed = [...own, ...orphaned.flatMap((record) => record.mutations ?? [])];
          await db.meta.bulkDelete(orphaned.map((record) => record.key));
          await db.meta.put({ key: tabMutationKey, timestamp: Date.now(), buster, mutations: absorbed, bundledQueries: [] });
          return absorbed;
        });

        const mutations = inCurrentShape([...(meta.mutations ?? []), ...tabMutations]);

        return {
          timestamp: meta.timestamp,
          buster: meta.buster,
          clientState: { queries: allQueries, mutations },
        };
      } catch (error) {
        console.error('[QueryPersister] Failed to restore client:', error);
        reportCriticalError('persister.restore_failed', error);
        return undefined;
      }
    },

    removeClient: async () => {
      const db = getLocalUserDb();
      if (!db) {
        resetTracker();
        return;
      }
      try {
        await clearScope(db);
      } catch (error) {
        console.error('[QueryPersister] Failed to remove client:', error);
      }
    },
  } satisfies Persister & { flush: () => Promise<void> };
}

/** The cache of every tab: scope `rq`, survives browser restart until sign-out deletes the per-user database. */
export const persister = createIDBPersister('rq');

/**
 * What PersistQueryClientProvider restores and saves with. No age limit: the persister guards the cache's lifetime
 * itself (the cache version, the lens pointer), and an expired restore would delete queued writes too.
 */
export const persistOptions: Omit<PersistQueryClientOptions, 'queryClient'> = {
  persister,
  maxAge: Number.POSITIVE_INFINITY,
  dehydrateOptions: {
    // Only paused mutations persist: active ones may hold non-cloneable streaming data.
    shouldDehydrateMutation: (mutation) => mutation.state.isPaused,
    shouldDehydrateQuery: shouldPersistQuery,
  },
};

// The write throttle holds back up to a second of changes: a hidden page stores them now, best effort as idb-kv-storage does.
onPageHide(() => void persister.flush());

/** Reset persister change trackers (called on a local user rebind so they match the freshly bound DB). */
export function resetPersisters(): void {
  for (const reset of trackerResets) reset();
}

holdTabLock();
