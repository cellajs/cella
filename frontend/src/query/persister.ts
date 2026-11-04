import type { DehydratedState, Query } from '@tanstack/react-query';
import type { PersistedClient, Persister, PersistQueryClientOptions } from '@tanstack/react-query-persist-client';
import { appConfig } from 'shared';
import { currentSchemaVersion } from 'shared/schema-evolution';
import { isRecord } from 'shared/utils/as-record';
import { reportCriticalError } from '~/lib/tracing';
import { entityTypeOf, migrateMutations, migrateQueryState, productTypeOf } from '~/query/cache-migration';
import { getLocalUserDb, type LocalUserDatabase, type PersistedQueryRecord } from '~/query/local-user-db';
import { isPending } from '~/query/offline/mutation-queue';
import { isReplayed, upgradePersistedMutation, withVariablesVersion } from '~/query/offline/mutation-variables';
import { isBundleStale, markBundleStale } from '~/query/schema-version-guard';
import { onPageHide } from '~/utils/on-page-hide';

type DehydratedQuery = DehydratedState['queries'][number];
type DehydratedMutation = DehydratedState['mutations'][number];

/** A stored queue with each mutation in the variables shape this bundle reads; one that cannot get there is left out. */
const inCurrentShape = (mutations: DehydratedMutation[]): DehydratedMutation[] =>
  mutations.flatMap((mutation) => upgradePersistedMutation(mutation) ?? []);

const sessionIdStorageKey = `${appConfig.slug}-tab-session-id`;
const orphanMaxAgeMs = 2 * 60 * 60 * 1000;

/** A failure that says nothing of the data: no response, as offline, a server error, a timeout or a rate limit. Another 4xx, such as a 403 or 404, may say it is gone. */
function isTransientFailure(error: unknown): boolean {
  const status = isRecord(error) ? error.status : undefined;
  return typeof status !== 'number' || status >= 500 || status === 408 || status === 429;
}

/**
 * What the persister writes: a query that holds data the server gave and does not opt out through `meta: { persist: false }`
 * (a bearer token, another account's data). A refetch that failed transiently keeps the stored copy (`storedState`).
 */
export const shouldPersistQuery = ({ state, meta }: Query): boolean =>
  (state.status === 'success' || (state.status === 'error' && state.data !== undefined && isTransientFailure(state.error))) &&
  meta?.persist !== false;

/**
 * The state a query is stored with: a transient failure is stored as the read it failed to replace, marked for a refetch, since
 * an error state restored with data would show the error with no refetch on mount.
 */
function storedState(state: DehydratedQuery['state']): DehydratedQuery['state'] {
  if (state.status !== 'error') return state;
  return { ...state, status: 'success', error: null, fetchStatus: 'idle', fetchFailureCount: 0, fetchFailureReason: null, isInvalidated: true };
}

/**
 * The state a queued mutation is stored with: a replay that runs is stored as the paused mutation it was, so a restore
 * resumes it, and as attempted, since its request may commit before the tab closes or the session ends.
 */
function storedMutationState(state: DehydratedMutation['state']): DehydratedMutation['state'] {
  if (state.isPaused) return state;
  return { ...state, isPaused: true, failureCount: Math.max(state.failureCount, 1) };
}

/** What a stored query is diffed by: its data timestamp and its refetch mark. */
const versionOf = ({ dataUpdatedAt, isInvalidated }: DehydratedQuery['state']) => `${dataUpdatedAt}:${isInvalidated}`;

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

/** What the bundled queries are diffed by: each query's hash and version. */
const snapshotOf = (queries: DehydratedQuery[]) => JSON.stringify(queries.map(({ queryHash, state }) => [queryHash, versionOf(state)]));

/** One IndexedDB write per interval: the latest snapshot wins. */
const persistThrottleMs = 1000;

/** Chunk size for the lens boot-migration pass (records per Dexie transaction). */
const migrationChunkSize = 200;

/** The cache's meta record; its query records and each tab's queue record take it as their prefix. */
const cacheKey = 'rq';
const mutationRecordPrefix = `${cacheKey}:mut:`;
const tabMutationKey = `${mutationRecordPrefix}${tabSessionId}`;
/** queryHash to the last persisted `versionOf`, product queries only. */
const lastPersistedVersion = new Map<string, string>();
/** Snapshot of the last persisted bundled queries, for diffing. */
let lastBundledSnapshot = '';
/** Snapshot of this tab's last persisted paused mutations, for diffing. */
let lastMutationsSnapshot = '';
let pendingClient: PersistedClient | null = null;
let timer: ReturnType<typeof setTimeout> | null = null;
/** Bumped by `resetPersister`: memory from then on holds none of the stored cache until a restore reads it. */
let epoch = 0;
/** The epoch whose restore completed; flushes write only in it. */
let restoredEpoch = 0;

function resetTracker() {
  lastPersistedVersion.clear();
  lastBundledSnapshot = '';
  lastMutationsSnapshot = '';
}

/**
 * Deletes the cached queries and advances the cache version. The meta record keeps its lens pointer and every tab's
 * queue stays, live tabs' included: a restore reads a queue only through that record, and migrates it from that pointer.
 */
async function bustQueriesKeepMutations(db: LocalUserDatabase) {
  await db.transaction('rw', db.queries, db.meta, async () => {
    await db.queries.clear();
    const existing = await db.meta.get(cacheKey);
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
async function migrateCacheToCurrent(db: LocalUserDatabase, fromVersion: number) {
  const records = await db.queries.toArray();
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
  const mutationRecords = await db.meta.where('key').startsWith(mutationRecordPrefix).toArray();
  for (const record of mutationRecords) {
    await db.meta.put({ ...record, mutations: migrateMutations(inCurrentShape(record.mutations ?? []), fromVersion) });
  }

  const meta = await db.meta.get(cacheKey);
  if (!meta) return;
  const bundledQueries: DehydratedQuery[] = [];
  for (const query of meta.bundledQueries) {
    const entityType = entityTypeOf(query.queryKey);
    bundledQueries.push(entityType ? { ...query, state: await migrateQueryState(entityType, query.state, fromVersion) } : query);
  }
  // Final write advances the pointer atomically with the last rewritten data.
  await db.meta.put({ ...meta, bundledQueries, schemaVersion: currentSchemaVersion });
  console.debug(`[QueryPersister] Lens migration v${fromVersion} → v${currentSchemaVersion} complete`);
}

/** Cross-tab mutual exclusion for the migration pass (Web Locks when available). */
async function withMigrationLock(migrate: () => Promise<void>) {
  if (hasWebLocks) {
    await navigator.locks.request(`cache-migration:${cacheKey}`, migrate);
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
  // A teardown's cleared cache, with the database still bound, or a rebind's unrestored one would delete the stored queue.
  if (restoredEpoch !== epoch) return;

  try {
    // Another tab may have migrated the store forward since this bundle booted; the broadcast can lose the race to the first write.
    const existing = await db.meta.get(cacheKey);
    if ((existing?.schemaVersion ?? 0) > currentSchemaVersion) {
      markBundleStale();
      console.debug('[QueryPersister] Store is at a newer schema version, persisting disabled');
      return;
    }

    const { queries } = client.clientState;
    // Each queued mutation is stored with the version of its variables, which the restore reads.
    const mutations = client.clientState.mutations.map((mutation) =>
      withVariablesVersion({ ...mutation, state: storedMutationState(mutation.state) }),
    );

    const productQueries: DehydratedQuery[] = [];
    const bundledQueries: DehydratedQuery[] = [];
    for (const query of queries) {
      const stored = { ...query, state: storedState(query.state) };
      if (productTypeOf(query.queryKey)) productQueries.push(stored);
      else bundledQueries.push(stored);
    }

    const upserts: PersistedQueryRecord[] = [];
    const currentHashes = new Set<string>();

    for (const { queryHash, queryKey, state } of productQueries) {
      currentHashes.add(queryHash);
      if (lastPersistedVersion.get(queryHash) === versionOf(state)) continue;
      upserts.push({ id: `${cacheKey}:${queryHash}`, queryHash, queryKey, state, dataUpdatedAt: state.dataUpdatedAt });
    }

    const removedHashes = [...lastPersistedVersion.keys()].filter((hash) => !currentHashes.has(hash));
    const removals = removedHashes.map((hash) => `${cacheKey}:${hash}`);

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
          key: cacheKey,
          timestamp: client.timestamp,
          buster: client.buster,
          clientCacheVersion: appConfig.clientCacheVersion,
          schemaVersion: currentSchemaVersion,
          bundledQueries,
        });
      });
      // The trackers follow a committed write to the database still bound, so the next flush retries a failed one.
      if (getLocalUserDb() === db) {
        for (const { queryHash, state } of upserts) lastPersistedVersion.set(queryHash, versionOf(state));
        for (const hash of removedHashes) lastPersistedVersion.delete(hash);
        lastBundledSnapshot = bundledSnapshot;
        lastMutationsSnapshot = mutationsSnapshot;
      }

      console.debug(
        `[QueryPersister] Wrote ${upserts.length} product changed, removed ${removals.length}, ` +
          `${bundledChanged ? `${bundledQueries.length} bundled` : 'bundle unchanged'}` +
          `${mutationsChanged ? `, ${mutations.length} paused mutations (tab record)` : ''}`,
      );
    }
  } catch (error) {
    console.error('[QueryPersister] Failed to persist client:', error);
  }
}

/**
 * The cache of every tab, backed by the live `localUserDb`: product entity queries get one record each for incremental
 * diffing, every other query is bundled into the meta record. It survives browser restart until sign-out deletes the
 * per-user database, and every operation no-ops while none is bound (signed out).
 */
export const persister = {
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
    const startedIn = epoch;
    // A reset while this read ran cleared the memory it would fill: the restore that follows the reset reads again.
    const restored = (client?: PersistedClient) => {
      if (epoch !== startedIn) return undefined;
      restoredEpoch = epoch;
      return client;
    };
    try {
      let meta = await db.meta.get(cacheKey);
      if (!meta) return restored();

      // A clientCacheVersion mismatch wipes cached query data but keeps queued mutations; a missing version seeds without wiping.
      const versionChanged = (meta.clientCacheVersion ?? appConfig.clientCacheVersion) !== appConfig.clientCacheVersion;
      // Upgrade rows and queued mutations when their lens ordinal trails the bundle; a missing ordinal seeds current.
      const pointer = meta.schemaVersion ?? currentSchemaVersion;

      if (versionChanged) {
        await bustQueriesKeepMutations(db);
        meta = (await db.meta.get(cacheKey)) ?? meta;
      }

      if (pointer !== currentSchemaVersion) {
        if (pointer > currentSchemaVersion) {
          // Disk is ahead after another tab migrated forward or a rollback deploy: stop persisting and let the PWA update flow replace this bundle.
          markBundleStale();
          return undefined;
        }
        await withMigrationLock(async () => {
          // Re-read after acquiring the lock; another tab may have migrated.
          const fresh = await db.meta.get(cacheKey);
          const freshPointer = fresh?.schemaVersion ?? currentSchemaVersion;
          if (freshPointer < currentSchemaVersion) await migrateCacheToCurrent(db, freshPointer);
        });
        meta = (await db.meta.get(cacheKey)) ?? meta;
      }

      const productRecords = await db.queries.toArray();
      for (const { queryHash, state } of productRecords) lastPersistedVersion.set(queryHash, versionOf(state));

      const { bundledQueries } = meta;
      // Seed the snapshot the next write diffs against.
      lastBundledSnapshot = snapshotOf(bundledQueries);

      const allQueries: DehydratedQuery[] = [
        ...productRecords.map(({ queryHash, queryKey, state, dataUpdatedAt }) => ({ queryHash, queryKey, state, dehydratedAt: dataUpdatedAt })),
        ...bundledQueries,
      ];

      // Restores shared data, this tab's record, and orphaned tab records; live tabs keep theirs, and age substitutes when lock liveness is undetectable.
      const { buster } = meta;
      const live = await liveTabSessionIds();
      // An orphaned queue moves under this tab's key in the transaction that deletes it, so a tab closed before its first write loses none.
      const tabMutations = await db.transaction('rw', db.meta, async () => {
        const records = await db.meta.where('key').startsWith(mutationRecordPrefix).toArray();
        const own = records.find((record) => record.key === tabMutationKey)?.mutations ?? [];
        const orphaned = records.filter(({ key, timestamp }) => {
          if (key === tabMutationKey) return false;
          return live ? !live.has(key.slice(mutationRecordPrefix.length)) : timestamp < Date.now() - orphanMaxAgeMs;
        });
        if (orphaned.length === 0) return own;
        const absorbed = [...own, ...orphaned.flatMap((record) => record.mutations ?? [])];
        await db.meta.bulkDelete(orphaned.map((record) => record.key));
        await db.meta.put({ key: tabMutationKey, timestamp: Date.now(), buster, mutations: absorbed, bundledQueries: [] });
        return absorbed;
      });

      return restored({
        timestamp: meta.timestamp,
        buster: meta.buster,
        clientState: { queries: allQueries, mutations: inCurrentShape(tabMutations) },
      });
    } catch (error) {
      console.error('[QueryPersister] Failed to restore client:', error);
      reportCriticalError('persister.restore_failed', error);
      return undefined;
    }
  },

  /** False from a reset until a restore that started after it completes. */
  isRestored: () => restoredEpoch === epoch,

  /** `persistQueryClientRestore` discards a cache that fails to hydrate through this: the queries go, the queues stay. */
  removeClient: async () => {
    const db = getLocalUserDb();
    if (!db) {
      resetTracker();
      return;
    }
    try {
      await bustQueriesKeepMutations(db);
    } catch (error) {
      console.error('[QueryPersister] Failed to remove client:', error);
    }
  },
} satisfies Persister & { flush: () => Promise<void>; isRestored: () => boolean };

/**
 * What PersistQueryClientProvider restores and saves with. No age limit: the persister guards the cache's lifetime
 * itself (the cache version, the lens pointer), and an expired restore would delete queued writes too.
 */
export const persistOptions: Omit<PersistQueryClientOptions, 'queryClient'> = {
  persister,
  maxAge: Number.POSITIVE_INFINITY,
  dehydrateOptions: {
    // Paused mutations persist, and a replay until it settles, so a tab closed or signed out while it runs replays it
    // again; another active one may hold non-cloneable streaming data.
    shouldDehydrateMutation: (mutation) => mutation.state.isPaused || (isPending(mutation) && isReplayed(mutation.state.variables)),
    shouldDehydrateQuery: shouldPersistQuery,
  },
};

// The write throttle holds back up to a second of changes: a hidden page stores them now, best effort as idb-kv-storage does.
onPageHide(() => void persister.flush());

/** Forgets what the persister wrote and stops its writes until the next restore: on a rebind, and before a teardown clears the cache. */
export function resetPersister(): void {
  resetTracker();
  epoch++;
}

holdTabLock();
