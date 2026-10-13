import 'fake-indexeddb/auto';
import type { PersistedClient } from '@tanstack/react-query-persist-client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('shared', () => ({
  appConfig: {
    slug: 'test-app',
    productEntityTypes: ['task', 'label', 'attachment'],
    channelEntityTypes: ['organization', 'workspace', 'project'],
    clientCacheVersion: 'v1',
  },
}));

// One lens ordinal, so a store behind it runs the lens pass; `lensPassSaw` records the queue that pass was handed.
const lensPassSaw = vi.hoisted(() => ({ variables: [] as unknown[] }));
vi.mock('shared/schema-evolution', async (importOriginal) => ({
  ...(await importOriginal<typeof import('shared/schema-evolution')>()),
  currentSchemaVersion: 1,
}));
vi.mock('~/query/cache-migration', async (importOriginal) => {
  const actual = await importOriginal<typeof import('~/query/cache-migration')>();
  return {
    ...actual,
    migrateMutations: (mutations: Parameters<typeof actual.migrateMutations>[0], fromVersion: number) => {
      lensPassSaw.variables.push(...mutations.map(({ state }) => state.variables));
      return actual.migrateMutations(mutations, fromVersion);
    },
  };
});

vi.stubGlobal('window', { addEventListener: vi.fn(), removeEventListener: vi.fn() });

const sessionStorageMap = new Map<string, string>();
vi.stubGlobal('sessionStorage', {
  getItem: (key: string) => sessionStorageMap.get(key) ?? null,
  setItem: (key: string, value: string) => sessionStorageMap.set(key, value),
  removeItem: (key: string) => sessionStorageMap.delete(key),
});

const { persister, sessionPersister, cleanupOrphanedSessions } = await import('~/query/persister');
// The persister reads/writes the live per-user localUserDb; bind one (owner `u1`) per test.
const { bindLocalUserDb, deleteLocalUserDb, getLocalUserDb } = await import('~/query/local-user-db');
const { registerVariablesVersion } = await import('~/query/offline/mutation-variables');

// Snapshot of the listeners registered at import time: a reload fires `beforeunload`, so a teardown wired there would wipe the session cache on every refresh.
const importTimeWindowEvents = (window.addEventListener as unknown as { mock: { calls: unknown[][] } }).mock.calls.map((call) => call[0]);

// Helpers

function makeQuery(hash: string, entityType: string, dataUpdatedAt: number, data: unknown = null) {
  return {
    queryHash: hash,
    queryKey: [entityType, 'list', 'org-1'] as unknown[],
    dehydratedAt: dataUpdatedAt,
    state: {
      data,
      dataUpdatedAt,
      dataUpdateCount: 1,
      error: null,
      errorUpdateCount: 0,
      errorUpdatedAt: 0,
      fetchFailureCount: 0,
      fetchFailureReason: null,
      fetchMeta: null,
      fetchStatus: 'idle' as const,
      isInvalidated: false,
      status: 'success' as const,
    },
  };
}

function makePersistedClient(queries: ReturnType<typeof makeQuery>[], timestamp = Date.now()): PersistedClient {
  return {
    timestamp,
    buster: '',
    clientState: { queries, mutations: [] },
  };
}

async function deleteDb() {
  await deleteLocalUserDb();
}

// Tests

describe('per-query IDB persister', () => {
  beforeEach(async () => {
    // Bind a fresh per-user localUserDb, then clear internal lastPersistedAt state + IDB records
    bindLocalUserDb('u1');
    await persister.removeClient();
    await sessionPersister.removeClient();
    sessionStorageMap.clear();
  });

  afterEach(async () => {
    await deleteDb();
  });

  describe('round-trip: persist and restore', () => {
    it('persists and restores queries correctly', async () => {
      const q1 = makeQuery('["task","list","org-1"]', 'task', 1000, [{ id: 't1' }]);
      const q2 = makeQuery('["me"]', 'me', 2000, { name: 'user' });
      const client = makePersistedClient([q1, q2], 12345);

      await persister.persistClient(client);
      await persister.flush();

      const restored = await persister.restoreClient();
      expect(restored).toBeDefined();
      expect(restored!.timestamp).toBe(12345);
      expect(restored!.buster).toBe('');
      expect(restored!.clientState.queries).toHaveLength(2);

      const restoredHashes = restored!.clientState.queries.map((q) => q.queryHash).sort();
      expect(restoredHashes).toEqual(['["me"]', '["task","list","org-1"]']);

      const taskQuery = restored!.clientState.queries.find((q) => q.queryHash === '["task","list","org-1"]');
      expect(taskQuery!.state.data).toEqual([{ id: 't1' }]);
      expect(taskQuery!.state.dataUpdatedAt).toBe(1000);
    });

    it('returns undefined when nothing is persisted', async () => {
      const restored = await persister.restoreClient();
      expect(restored).toBeUndefined();
    });
  });

  describe('incremental writes', () => {
    it('only writes changed queries on subsequent persist calls', async () => {
      const q1 = makeQuery('["task","list","org-1"]', 'task', 1000, [{ id: 't1' }]);
      const q2 = makeQuery('["me"]', 'me', 2000, { name: 'user' });

      await persister.persistClient(makePersistedClient([q1, q2]));
      await persister.flush();

      await persister.persistClient(makePersistedClient([q1, q2]));
      await persister.flush();

      const restored = await persister.restoreClient();
      expect(restored!.clientState.queries).toHaveLength(2);
    });

    it('updates only the changed query', async () => {
      const q1 = makeQuery('["task","list","org-1"]', 'task', 1000, [{ id: 't1' }]);
      const q2 = makeQuery('["me"]', 'me', 2000, { name: 'user' });

      await persister.persistClient(makePersistedClient([q1, q2]));
      await persister.flush();

      const q1Updated = makeQuery('["task","list","org-1"]', 'task', 3000, [{ id: 't1' }, { id: 't2' }]);
      await persister.persistClient(makePersistedClient([q1Updated, q2]));
      await persister.flush();

      const restored = await persister.restoreClient();
      const taskQuery = restored!.clientState.queries.find((q) => q.queryHash === '["task","list","org-1"]');
      expect(taskQuery!.state.data).toEqual([{ id: 't1' }, { id: 't2' }]);
      expect(taskQuery!.state.dataUpdatedAt).toBe(3000);

      const meQuery = restored!.clientState.queries.find((q) => q.queryHash === '["me"]');
      expect(meQuery!.state.data).toEqual({ name: 'user' });
    });
  });

  describe('removal detection', () => {
    it('removes queries no longer in the dehydrated state', async () => {
      const q1 = makeQuery('["task","list","org-1"]', 'task', 1000);
      const q2 = makeQuery('["me"]', 'me', 2000);
      const q3 = makeQuery('["label","list","org-1"]', 'label', 3000);

      await persister.persistClient(makePersistedClient([q1, q2, q3]));
      await persister.flush();

      // Persist with only q1; q2 and q3 should be removed.
      await persister.persistClient(makePersistedClient([q1]));
      await persister.flush();

      const restored = await persister.restoreClient();
      expect(restored!.clientState.queries).toHaveLength(1);
      expect(restored!.clientState.queries[0].queryHash).toBe('["task","list","org-1"]');
    });
  });

  describe('product vs context storage', () => {
    it('stores product queries as individual IDB records', async () => {
      const queries = [
        makeQuery('["task","list"]', 'task', 1000),
        makeQuery('["label","list"]', 'label', 1000),
        makeQuery('["attachment","list"]', 'attachment', 1000),
      ];

      await persister.persistClient(makePersistedClient(queries));
      await persister.flush();

      const productRecords = await getLocalUserDb()!.queries.where('scope').equals('rq').toArray();
      expect(productRecords).toHaveLength(3);
    });

    it('bundles context queries into the meta record', async () => {
      const queries = [
        makeQuery('["me"]', 'me', 1000),
        makeQuery('["organization","list"]', 'organization', 1000),
        makeQuery('["member","list"]', 'member', 1000),
      ];

      await persister.persistClient(makePersistedClient(queries));
      await persister.flush();

      const queryRecords = await getLocalUserDb()!.queries.where('scope').equals('rq').toArray();
      expect(queryRecords).toHaveLength(0);

      const meta = await getLocalUserDb()!.meta.get('rq');
      expect(meta!.channelQueries).toHaveLength(3);
      const hashes = meta!.channelQueries.map((q: { queryHash: string }) => q.queryHash).sort();
      expect(hashes).toEqual(['["me"]', '["member","list"]', '["organization","list"]']);
    });

    it('restores both product and context queries together', async () => {
      const queries = [makeQuery('["task","list"]', 'task', 1000, [{ id: 't1' }]), makeQuery('["me"]', 'me', 2000, { name: 'user' })];

      await persister.persistClient(makePersistedClient(queries));
      await persister.flush();

      const restored = await persister.restoreClient();
      expect(restored!.clientState.queries).toHaveLength(2);

      const taskQuery = restored!.clientState.queries.find((q) => q.queryHash === '["task","list"]');
      expect(taskQuery!.state.data).toEqual([{ id: 't1' }]);

      const meQuery = restored!.clientState.queries.find((q) => q.queryHash === '["me"]');
      expect(meQuery!.state.data).toEqual({ name: 'user' });
    });
  });

  describe('removeClient', () => {
    it('clears all records for the scope', async () => {
      const q1 = makeQuery('["task","list"]', 'task', 1000);
      await persister.persistClient(makePersistedClient([q1]));
      await persister.flush();

      await persister.removeClient();

      const restored = await persister.restoreClient();
      expect(restored).toBeUndefined();
    });
  });

  describe('scope isolation', () => {
    it('offline and session persisters do not interfere', async () => {
      const q1 = makeQuery('["task","list"]', 'task', 1000, 'offline-data');
      const q2 = makeQuery('["task","list"]', 'task', 2000, 'session-data');

      await persister.persistClient(makePersistedClient([q1]));
      await persister.flush();

      await sessionPersister.persistClient(makePersistedClient([q2]));
      await sessionPersister.flush();

      const offlineRestored = await persister.restoreClient();
      const sessionRestored = await sessionPersister.restoreClient();

      expect(offlineRestored!.clientState.queries[0].state.data).toBe('offline-data');
      expect(sessionRestored!.clientState.queries[0].state.data).toBe('session-data');
    });

    it('removeClient only affects its own scope', async () => {
      const q1 = makeQuery('["me"]', 'me', 1000, 'offline');
      const q2 = makeQuery('["me"]', 'me', 2000, 'session');

      await persister.persistClient(makePersistedClient([q1]));
      await persister.flush();
      await sessionPersister.persistClient(makePersistedClient([q2]));
      await sessionPersister.flush();

      await sessionPersister.removeClient();

      const offlineRestored = await persister.restoreClient();
      const sessionRestored = await sessionPersister.restoreClient();

      expect(offlineRestored!.clientState.queries[0].state.data).toBe('offline');
      expect(sessionRestored).toBeUndefined();
    });
  });

  describe('orphaned session cleanup', () => {
    it('removes sessions older than the max age', async () => {
      // Manually insert an old session meta record
      const db = getLocalUserDb()!;

      const oldScope = 's-old-uuid';
      await db.meta.put({
        key: oldScope,
        timestamp: Date.now() - 3 * 60 * 60 * 1000, // 3 hours ago (past 2h cutoff)
        buster: '',
        mutations: [],
        channelQueries: [],
      });
      await db.queries.put({
        id: `${oldScope}:["task","list"]`,
        scope: oldScope,
        queryHash: '["task","list"]',
        queryKey: ['task', 'list'],
        state: { data: 'stale', dataUpdatedAt: 100, status: 'success' } as never,
        dataUpdatedAt: 100,
      });

      await cleanupOrphanedSessions();

      const metaRecords = await db.meta.where('key').equals(oldScope).count();
      const queryRecords = await db.queries.where('scope').equals(oldScope).count();
      expect(metaRecords).toBe(0);
      expect(queryRecords).toBe(0);
    });
  });

  describe('cache-bust on schema change', () => {
    it('wipes cached queries but keeps queued mutations when clientCacheVersion changes', async () => {
      const client: PersistedClient = {
        timestamp: 1000,
        buster: '',
        clientState: {
          queries: [makeQuery('["task","list","org-1"]', 'task', 100, [{ id: 't1' }]), makeQuery('["me"]', 'me', 200)],
          mutations: [
            {
              mutationKey: ['task', 'create'],
              state: {
                context: undefined,
                data: undefined,
                error: null,
                failureCount: 0,
                failureReason: null,
                isPaused: true,
                status: 'pending',
                variables: { title: 'offline edit' },
                submittedAt: 100,
              },
            },
          ],
        },
      };
      await persister.persistClient(client);
      await persister.flush();

      // Simulate a prior build's clientCacheVersion persisted on disk (now stale vs 'v1').
      const db = getLocalUserDb()!;
      const meta = await db.meta.get('rq');
      await db.meta.put({ ...meta!, clientCacheVersion: 'v0' });

      const restored = await persister.restoreClient();
      expect(restored).toBeDefined();
      expect(restored!.clientState.queries).toHaveLength(0);
      // ...but the queued offline mutation survives for replay.
      expect(restored!.clientState.mutations).toHaveLength(1);
      expect(restored!.clientState.mutations[0].state.variables).toEqual({ title: 'offline edit' });

      const metaAfter = await db.meta.get('rq');
      expect(metaAfter!.clientCacheVersion).toBe('v1');
    });
  });
});

describe('queued mutations across a change of their variables shape', () => {
  /** A delete whose module declares version 2 (rows under `rows`; version 1 held them under `tasks`), and one that declares none. */
  const versionedKey = ['task', 'delete'];
  const plainKey = ['label', 'delete'];

  const queuedMutation = (mutationKey: string[], variables: unknown) => ({
    mutationKey,
    state: {
      context: undefined,
      data: undefined,
      error: null,
      failureCount: 0,
      failureReason: null,
      isPaused: true,
      status: 'pending' as const,
      variables,
      submittedAt: 100,
    },
  });

  /** Persists queued mutations and returns the record the store holds for this tab's queue. */
  const persistQueue = async (...mutations: ReturnType<typeof queuedMutation>[]) => {
    await persister.persistClient({ timestamp: 1000, buster: '', clientState: { queries: [makeQuery('["me"]', 'me', 200)], mutations } });
    await persister.flush();
    const db = getLocalUserDb()!;
    const [record] = await db.meta.where('key').startsWith('rq:mut:').toArray();
    return { db, record };
  };

  /** Rewrites the stored queue as a bundle before versions left it: without stamps. */
  const withoutStamps = async ({ db, record }: Awaited<ReturnType<typeof persistQueue>>) =>
    db.meta.put({ ...record, mutations: (record.mutations ?? []).map(({ meta: _stamp, ...mutation }) => mutation) });

  beforeEach(async () => {
    await persister.removeClient();
    await deleteDb();
    bindLocalUserDb('u1');
    lensPassSaw.variables.length = 0;
    registerVariablesVersion(versionedKey, 2, (variables) => {
      if (typeof variables !== 'object' || variables === null || !('tasks' in variables)) return null;
      const { tasks, ...rest } = variables;
      if (tasks === 'throws') throw new Error('an upgrade that did not expect this');
      return { ...rest, rows: tasks };
    });
  });

  afterEach(async () => await deleteDb());

  it('stores each queued mutation with the version of its variables', async () => {
    const { record } = await persistQueue(
      queuedMutation(plainKey, { labels: [{ id: 'l1' }] }),
      queuedMutation(versionedKey, { rows: [{ id: 't1' }] }),
    );

    expect(record.mutations).toMatchObject([
      { mutationKey: plainKey, meta: { variablesVersion: 1 } },
      { mutationKey: versionedKey, meta: { variablesVersion: 2 } },
    ]);
  });

  it('restores a delete an older bundle queued in the shape the new bundle reads, across a cache-version bump', async () => {
    const queue = await persistQueue(queuedMutation(versionedKey, { tenantId: 't', tasks: [{ id: 't1' }], stx: { mutationId: 'mut-1' } }));
    await withoutStamps(queue);
    // The reload brings a bundle with a new cache version.
    await queue.db.meta.put({ ...(await queue.db.meta.get('rq'))!, clientCacheVersion: 'v0' });

    const restored = await persister.restoreClient();

    expect(restored!.clientState.queries).toHaveLength(0);
    expect(restored!.clientState.mutations).toMatchObject([
      { meta: { variablesVersion: 2 }, state: { variables: { tenantId: 't', rows: [{ id: 't1' }], stx: { mutationId: 'mut-1' } } } },
    ]);
    expect(restored!.clientState.mutations[0].state.variables).not.toHaveProperty('tasks');
    expect(await queue.db.failedSync.count()).toBe(0);
  });

  it('quarantines a queued mutation no upgrade knows, so it is kept for repair and never replayed', async () => {
    const queue = await persistQueue(queuedMutation(versionedKey, { tenantId: 't', somethingElse: true, stx: { mutationId: 'mut-2' } }));
    await withoutStamps(queue);

    const restored = await persister.restoreClient();

    expect(restored!.clientState.mutations).toEqual([]);
    await vi.waitFor(async () => expect(await queue.db.failedSync.count()).toBe(1));
    expect(await queue.db.failedSync.toArray()).toMatchObject([
      { mutationId: 'mut-2', entityType: 'task', status: 0, clientCacheVersion: 'v1', variables: { tenantId: 't', somethingElse: true } },
    ]);
  });

  it('restores a mutation stored at the current version as it was stored', async () => {
    await persistQueue(queuedMutation(versionedKey, { tenantId: 't', rows: [{ id: 't1' }] }));

    const restored = await persister.restoreClient();

    expect(restored!.clientState.mutations).toMatchObject([
      { meta: { variablesVersion: 2 }, state: { variables: { tenantId: 't', rows: [{ id: 't1' }] } } },
    ]);
  });

  it("restores the rest of a closed tab's queue, and the cached queries, when the upgrade of one mutation throws", async () => {
    const { db } = await persistQueue();
    // A tab that is gone left a queue: one delete its upgrade throws on, and an update of another key.
    await db.meta.put({
      key: 'rq:mut:closed-tab',
      timestamp: 1000,
      buster: '',
      channelQueries: [],
      mutations: [
        queuedMutation(versionedKey, { tenantId: 't', tasks: 'throws', stx: { mutationId: 'mut-3' } }),
        queuedMutation(['label', 'update'], { id: 'l1', ops: { name: 'Kept' } }),
      ],
    });

    const restored = await persister.restoreClient();

    expect(restored!.clientState.queries).toHaveLength(1);
    expect(restored!.clientState.mutations.map(({ state }) => state.variables)).toEqual([{ id: 'l1', ops: { name: 'Kept' } }]);
    await vi.waitFor(async () => expect(await db.failedSync.toArray()).toMatchObject([{ mutationId: 'mut-3', status: 0 }]));
  });

  it('hands the lens pass the queue in the shape this bundle reads, so it finds the rows of an older delete', async () => {
    const queue = await persistQueue(queuedMutation(versionedKey, { tenantId: 't', tasks: [{ id: 't1' }] }));
    await withoutStamps(queue);
    // The store is one lens ordinal behind the bundle.
    await queue.db.meta.put({ ...(await queue.db.meta.get('rq'))!, schemaVersion: 0 });

    const restored = await persister.restoreClient();

    expect(lensPassSaw.variables).toEqual([{ tenantId: 't', rows: [{ id: 't1' }] }]);
    expect(restored!.clientState.mutations).toMatchObject([
      { meta: { variablesVersion: 2 }, state: { variables: { tenantId: 't', rows: [{ id: 't1' }] } } },
    ]);
    // The store holds the upgraded queue with its stamp: a second restore has nothing left to upgrade.
    const [record] = await queue.db.meta.where('key').startsWith('rq:mut:').toArray();
    expect(record.mutations).toMatchObject([{ meta: { variablesVersion: 2 }, state: { variables: { rows: [{ id: 't1' }] } } }]);
  });
});

describe('session persister survives reload', () => {
  beforeEach(async () => {
    bindLocalUserDb('u1');
    await sessionPersister.removeClient();
    sessionStorageMap.clear();
  });

  afterEach(async () => {
    await deleteLocalUserDb();
  });

  it('round-trips session-scoped queries so a refresh restores from cache', async () => {
    const q = makeQuery('["task","list","org-1"]', 'task', 1000, [{ id: 't1' }]);

    await sessionPersister.persistClient(makePersistedClient([q]));
    await sessionPersister.flush();

    // A reload re-reads the same session scope; the data must still be there.
    const restored = await sessionPersister.restoreClient();
    expect(restored).toBeDefined();
    expect(restored!.clientState.queries).toHaveLength(1);
    expect(restored!.clientState.queries[0].state.data).toEqual([{ id: 't1' }]);
  });

  it('registers no beforeunload teardown that would wipe the session cache on reload', () => {
    // `beforeunload` cannot tell a reload from a closed tab, so age-based orphan cleanup preserves reload caches while reclaiming closed sessions.
    expect(importTimeWindowEvents).not.toContain('beforeunload');
  });
});
