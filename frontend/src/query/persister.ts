import type { DehydratedState, Query } from '@tanstack/react-query';
import type { PersistedClient, Persister, PersistQueryClientOptions } from '@tanstack/react-query-persist-client';
import { appConfig } from 'shared';
import { currentSchemaVersion } from 'shared/schema-evolution';
import { reportCriticalError } from '~/lib/tracing';
import { uiStore } from '~/modules/ui/ui-store';
import { entityTypeOf, migrateMutations, migrateQueryState, productTypeOf } from '~/query/cache-migration';
import { getLocalUserDb, type LocalUserDatabase, type PersistedMetaRecord, type PersistedQueryRecord } from '~/query/local-user-db';
import { upgradePersistedMutation, withVariablesVersion } from '~/query/offline/mutation-variables';
import { isBundleStale, markBundleStale } from '~/query/schema-version-guard';

type DehydratedQuery = DehydratedState['queries'][number];
type DehydratedMutation = DehydratedState['mutations'][number];

/** A stored queue with each mutation in the variables shape this bundle reads; one that cannot get there is quarantined and left out. */
const inCurrentShape = (mutations: DehydratedMutation[]): DehydratedMutation[] =>
  mutations.flatMap((mutation) => upgradePersistedMutation(mutation) ?? []);

const sessionKeyPrefix = 's-';
const sessionIdStorageKey = `${appConfig.slug}-tab-session-id`;
const orphanMaxAgeMs = 2 * 60 * 60 * 1000; // 2 hours

// Query classification

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
const sessionScope = `${sessionKeyPrefix}${tabSessionId}`;
const hasWebLocks = typeof navigator !== 'undefined' && 'locks' in navigator;

// Paused mutations persist per tab so no tab overwrites another's queue; restore absorbs records whose tab lock is dead, falling back to record age without Web Locks.
const mutationLockPrefix = `${appConfig.slug}-mutation-owner:`;

const mutationRecordPrefix = (scope: string) => `${scope}:mut:`;

function holdMutationOwnershipLock(): void {
  if (!hasWebLocks) return;
  // Held forever (released by tab close); other tabs detect liveness via locks.query().
  void navigator.locks.request(`${mutationLockPrefix}${tabSessionId}`, () => new Promise(() => {}));
}

/** Tab session ids currently holding a mutation-ownership lock; null when undetectable. */
async function liveTabSessionIds(): Promise<Set<string> | null> {
  if (!hasWebLocks) return null;
  try {
    const { held } = await navigator.locks.query();
    return new Set(
      (held ?? [])
        .map((lock) => lock.name ?? '')
        .filter((name) => name.startsWith(mutationLockPrefix))
        .map((name) => name.slice(mutationLockPrefix.length)),
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

// Persister factory

/** Throttle full-cache dehydration and IndexedDB persistence to one write per interval. */
const persistThrottleMs = 1000;

/** In-memory change trackers per persister, reset on owner (DB) rebind. */
const trackerResets: Array<() => void> = [];

/**
 * IndexedDB persister backed by the live `localUserDb`: product entity queries get one record each for incremental diffing, context queries bundle into the meta record.
 * Every operation no-ops while no per-user DB is bound (signed out).
 */
export function createIDBPersister(scope = 'rq') {
  const isSessionScope = scope.startsWith(sessionKeyPrefix);
  const ownMutationKey = `${mutationRecordPrefix(scope)}${tabSessionId}`;
  /** queryHash to last persisted dataUpdatedAt, product queries only. */
  const lastPersistedAt = new Map<string, number>();
  /** Snapshot of the last persisted context queries, for diffing. */
  let lastChannelSnapshot = '';
  /** Snapshot of this tab's last persisted paused mutations, for diffing. */
  let lastMutationsSnapshot = '';
  let pendingClient: PersistedClient | null = null;
  let timeoutId: ReturnType<typeof setTimeout> | null = null;

  function resetTracker() {
    lastPersistedAt.clear();
    lastChannelSnapshot = '';
    lastMutationsSnapshot = '';
  }
  trackerResets.push(resetTracker);

  /** Remove all records for this scope: queries, the meta record, and per-tab mutation records. */
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
        await db.meta.put({ ...existing, channelQueries: [], clientCacheVersion: appConfig.clientCacheVersion });
      }
    });
    resetTracker();
  }

  /** Chunk size for the lens boot-migration pass (records per Dexie transaction). */
  const MIGRATION_CHUNK_SIZE = 200;

  /** Migrate cached rows, context queries, and mutation variables in restart-safe chunks; the schema pointer advances only in the final metadata transaction. */
  async function migrateScopeToCurrent(db: LocalUserDatabase, fromVersion: number) {
    const records = await db.queries.where('scope').equals(scope).toArray();
    for (let i = 0; i < records.length; i += MIGRATION_CHUNK_SIZE) {
      const chunk = records.slice(i, i + MIGRATION_CHUNK_SIZE);
      // Rewrites precede the write: Dexie transactions auto-commit on non-Dexie awaits and the lens chain is async.
      const rewritten: PersistedQueryRecord[] = [];
      for (const record of chunk) {
        const entityType = entityTypeOf(record.queryKey);
        if (!entityType) continue;
        rewritten.push({ ...record, state: await migrateQueryState(entityType, record.state, fromVersion) });
      }
      if (rewritten.length > 0) await db.queries.bulkPut(rewritten);
    }

    // Per-tab mutation records migrate in the same pass (their variables carry old shapes too). The variables upgrade
    // goes first, so the lenses find the rows under the keys this bundle reads.
    const mutationRecords = await db.meta.where('key').startsWith(mutationRecordPrefix(scope)).toArray();
    for (const record of mutationRecords) {
      await db.meta.put({ ...record, mutations: migrateMutations(inCurrentShape(record.mutations ?? []), fromVersion) });
    }

    const meta = await db.meta.get(scope);
    if (!meta) return;
    const channelQueries: typeof meta.channelQueries = [];
    for (const q of meta.channelQueries ?? []) {
      const entityType = entityTypeOf(q.queryKey);
      channelQueries.push(entityType ? { ...q, state: await migrateQueryState(entityType, q.state, fromVersion) } : q);
    }
    const mutations = migrateMutations(inCurrentShape(meta.mutations ?? []), fromVersion);
    // Final write advances the pointer atomically with the last rewritten data.
    await db.meta.put({ ...meta, channelQueries, mutations, schemaVersion: currentSchemaVersion });
    console.debug(`[QueryPersister] Lens migration v${fromVersion} → v${currentSchemaVersion} complete (${scope})`);
  }

  /** Cross-tab mutual exclusion for the migration pass (Web Locks when available). */
  async function withMigrationLock(fn: () => Promise<void>) {
    if (hasWebLocks) {
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
      const channelQueries: DehydratedQuery[] = [];
      for (const q of queries) {
        if (productTypeOf(q.queryKey)) productQueries.push(q);
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
      }

      const removedHashes = [...lastPersistedAt.keys()].filter((hash) => !currentHashes.has(hash));
      const removals = removedHashes.map((hash) => `${scope}:${hash}`);

      const channelSnapshot = JSON.stringify(channelQueries.map((q) => [q.queryHash, q.state.dataUpdatedAt]));
      const channelChanged = channelSnapshot !== lastChannelSnapshot;

      // Paused mutations go to this tab's own record; the shared meta record stays mutation-free so no tab clobbers another's queue.
      const mutationsSnapshot = JSON.stringify(mutations);
      const mutationsChanged = mutationsSnapshot !== lastMutationsSnapshot;

      const hasProductChanges = upserts.length > 0 || removals.length > 0;
      if (hasProductChanges || channelChanged || mutationsChanged) {
        await db.transaction('rw', db.queries, db.meta, async () => {
          if (upserts.length > 0) await db.queries.bulkPut(upserts);
          if (removals.length > 0) await db.queries.bulkDelete(removals);
          if (mutationsChanged) {
            if (mutations.length > 0) {
              await db.meta.put({
                key: ownMutationKey,
                timestamp: client.timestamp,
                buster: client.buster,
                mutations,
                channelQueries: [],
              });
            } else {
              await db.meta.delete(ownMutationKey);
            }
          }
          await db.meta.put({
            key: scope,
            timestamp: client.timestamp,
            buster: client.buster,
            clientCacheVersion: appConfig.clientCacheVersion,
            schemaVersion: currentSchemaVersion,
            mutations: [],
            channelQueries,
          });
        });
        // The trackers follow a committed write to the database still bound, so the next flush retries a failed one.
        if (getLocalUserDb() === db) {
          for (const { queryHash, dataUpdatedAt } of upserts) lastPersistedAt.set(queryHash, dataUpdatedAt);
          for (const hash of removedHashes) lastPersistedAt.delete(hash);
          lastChannelSnapshot = channelSnapshot;
          lastMutationsSnapshot = mutationsSnapshot;
        }

        console.debug(
          `[QueryPersister] Wrote ${upserts.length} product changed, removed ${removals.length}, ` +
            `${channelChanged ? `${channelQueries.length} context bundled` : 'context unchanged'}` +
            `${mutationsChanged ? `, ${mutations.length} paused mutations (tab record)` : ''} (${scope})`,
        );
      }
    } catch (error) {
      console.error('[QueryPersister] Failed to persist client:', error);
    }
  }

  return {
    persistClient: async (client: PersistedClient) => {
      if (!getLocalUserDb()) return; // Signed out → in-memory only
      pendingClient = client;
      if (!timeoutId) {
        timeoutId = setTimeout(flush, persistThrottleMs);
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
      const db = getLocalUserDb();
      if (!db) return undefined; // Signed out → in-memory cache
      try {
        let meta = await db.meta.get(scope);
        if (!meta) return undefined;

        // A clientCacheVersion mismatch wipes cached query data but keeps queued mutations; a missing version seeds without wiping.
        const versionChanged = (meta.clientCacheVersion ?? appConfig.clientCacheVersion) !== appConfig.clientCacheVersion;
        // Upgrade rows and queued mutations when their lens ordinal trails the bundle; a missing ordinal seeds current.
        const pointer = meta.schemaVersion ?? currentSchemaVersion;
        if (isSessionScope && (versionChanged || pointer !== currentSchemaVersion)) {
          // Session scopes are cold, so wipe them entirely.
          await clearScope(db);
          return undefined;
        }

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

        for (const q of productRecords) {
          lastPersistedAt.set(q.queryHash, q.dataUpdatedAt);
        }

        const allQueries: DehydratedQuery[] = [
          ...productRecords.map((q) => ({ queryHash: q.queryHash, queryKey: q.queryKey, state: q.state, dehydratedAt: q.dataUpdatedAt })),
          ...(meta.channelQueries ?? []),
        ];

        // Seed the snapshot the next write diffs against.
        const restoredChannelQueries = meta.channelQueries ?? [];
        lastChannelSnapshot = JSON.stringify(restoredChannelQueries.map((q) => [q.queryHash, q.state.dataUpdatedAt]));

        // Restores shared data, this tab's record, and orphaned tab records; live tabs keep their own, and age substitutes when lock liveness is undetectable.
        const prefix = mutationRecordPrefix(scope);
        const mutationRecords = (await db.meta.where('key').startsWith(prefix).toArray()) ?? [];
        const live = await liveTabSessionIds();
        const restoredMutations = [...(meta.mutations ?? [])];
        const absorbedKeys: string[] = [];
        for (const record of mutationRecords) {
          const tabId = record.key.slice(prefix.length);
          const own = record.key === ownMutationKey;
          const dead = live ? !live.has(tabId) : record.timestamp < Date.now() - orphanMaxAgeMs;
          if (!own && !dead) continue;
          restoredMutations.push(...(record.mutations ?? []));
          if (!own) absorbedKeys.push(record.key);
        }
        if (absorbedKeys.length > 0) await db.meta.bulkDelete(absorbedKeys);

        // A mutation queued by an older bundle is brought to the variables shape this one reads, or quarantined.
        const mutations = inCurrentShape(restoredMutations);

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

/** Persistent offline persister: scope `rq`, survives browser restart. */
export const persister = createIDBPersister('rq');

/** Session-scoped persister: per-tab scope, survives reload, reclaimed after the tab closes. */
export const sessionPersister = createIDBPersister(sessionScope);

/** The persister the offline access switch names now. */
const currentPersister = () => (uiStore.getState().offlineAccess ? persister : sessionPersister);

/**
 * What PersistQueryClientProvider restores and saves with. It subscribes once, so every call asks `currentPersister`
 * again and the offline access switch applies without a reload. No age limit: the persister guards the cache's lifetime
 * itself (the cache version, the lens pointer, the session sweep), and an expired restore would delete queued writes too.
 */
export const persistOptions: Omit<PersistQueryClientOptions, 'queryClient'> = {
  persister: {
    persistClient: (client) => currentPersister().persistClient(client),
    restoreClient: () => currentPersister().restoreClient(),
    removeClient: () => currentPersister().removeClient(),
  },
  maxAge: Number.POSITIVE_INFINITY,
  dehydrateOptions: {
    // Only paused mutations persist: active ones may hold non-cloneable streaming data.
    shouldDehydrateMutation: (mutation) => mutation.state.isPaused,
    shouldDehydrateQuery: shouldPersistQuery,
  },
};

// The write throttle holds back up to a second of changes: a hidden page stores them now, best effort as idb-kv-storage does.
if (typeof document !== 'undefined') {
  const flushPersisters = () => {
    void persister.flush();
    void sessionPersister.flush();
  };
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flushPersisters();
  });
  window.addEventListener('pagehide', flushPersisters);
}

/** Reset persister change trackers (called on owner rebind so they match the freshly bound DB). */
export function resetPersisters(): void {
  for (const reset of trackerResets) reset();
}

/**
 * Remove the session scopes of closed tabs, each with its queued writes: a scope no tab holds the lock of (a loading tab
 * holds none yet) and older than orphanMaxAgeMs, never this tab's. The sole reclaim path for session scopes: a reload
 * must keep its scope, so nothing is torn down on unload. Call once on app startup; no-ops while signed out.
 */
export async function cleanupOrphanedSessions(): Promise<void> {
  const db = getLocalUserDb();
  if (!db) return;
  try {
    const live = await liveTabSessionIds();
    const cutoff = Date.now() - orphanMaxAgeMs;
    const isClosedTabScope = ({ key, timestamp }: PersistedMetaRecord) =>
      !key.includes(':mut:') && key !== sessionScope && timestamp < cutoff && !live?.has(key.slice(sessionKeyPrefix.length));
    const orphanScopes = (await db.meta.where('key').startsWith(sessionKeyPrefix).toArray()).filter(isClosedTabScope).map(({ key }) => key);

    if (orphanScopes.length > 0) {
      await db.transaction('rw', db.queries, db.meta, async () => {
        for (const orphanScope of orphanScopes) await deleteScope(db, orphanScope);
      });
      console.debug(`[QueryPersister] Cleaned up ${orphanScopes.length} orphaned session(s)`);
    }
  } catch (error) {
    // Non-critical: a later startup reclaims these orphans.
    console.debug('[QueryPersister] Orphan cleanup failed:', error);
  }
}

// Advertise this tab's liveness for mutation-record ownership.
holdMutationOwnershipLock();
