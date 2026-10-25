import 'fake-indexeddb/auto';
import { QueryClient } from '@tanstack/react-query';
import { type PersistedClient, persistQueryClientRestore, persistQueryClientSubscribe } from '@tanstack/react-query-persist-client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('shared', () => {
  const productEntityTypes = ['task', 'label', 'attachment'];
  const channelEntityTypes = ['organization', 'workspace', 'project'];
  return {
    appConfig: { slug: 'test-app', productEntityTypes, channelEntityTypes, clientCacheVersion: 'v1' },
    isProduct: (type: string) => productEntityTypes.includes(type),
    isChannel: (type: string) => channelEntityTypes.includes(type),
  };
});

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

const addWindowListener = vi.fn();
vi.stubGlobal('window', { addEventListener: addWindowListener, removeEventListener: vi.fn() });
vi.stubGlobal('document', { addEventListener: vi.fn(), visibilityState: 'visible' });

const sessionStorageMap = new Map<string, string>();
vi.stubGlobal('sessionStorage', {
  getItem: (key: string) => sessionStorageMap.get(key) ?? null,
  setItem: (key: string, value: string) => sessionStorageMap.set(key, value),
  removeItem: (key: string) => sessionStorageMap.delete(key),
});

const { persister, sessionPersister, cleanupOrphanedSessions, persistOptions } = await import('~/query/persister');
const { uiStore } = await import('~/modules/ui/ui-store');
// The persister reads/writes the live per-user localUserDb; bind one (owner `u1`) per test.
const { bindLocalUserDb, deleteLocalUserDb, getLocalUserDb } = await import('~/query/local-user-db');
const { registerVariablesVersion } = await import('~/query/offline/mutation-variables');

// Snapshot of the listeners registered at import time: a reload fires `beforeunload`, so a teardown registered there would wipe the session cache on every refresh.
const importTimeWindowListeners = new Map(addWindowListener.mock.calls.map(([type, listener]) => [type, listener]));

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

/** Holds the tab lock another open tab holds, until the returned release runs. */
async function holdTabLock(tabId: string): Promise<() => void> {
  let release = () => {};
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  await new Promise<void>((granted) => {
    void navigator.locks.request(`test-app-mutation-owner:${tabId}`, () => {
      granted();
      return held;
    });
  });
  return release;
}

async function deleteDb() {
  await deleteLocalUserDb();
}

describe('per-query IDB persister', () => {
  beforeEach(async () => {
    // Bind a fresh per-user localUserDb, then clear internal lastPersistedAt state + IDB records
    bindLocalUserDb('u1');
    await persister.removeClient();
    sessionStorageMap.clear();
  });

  afterEach(async () => {
    await deleteDb();
  });

  it('restores the cache as the last write left it: a changed query updated, a dropped one gone, product and context alike', async () => {
    const task = makeQuery('["task","list","org-1"]', 'task', 1000, [{ id: 't1' }]);
    const label = makeQuery('["label","list","org-1"]', 'label', 1000, [{ id: 'l1' }]);
    const me = makeQuery('["me"]', 'me', 2000, { name: 'user' });
    await persister.persistClient(makePersistedClient([task, label, me]));
    await persister.flush();

    // The next write: the task list changed, the label list is gone, the context query is as it was.
    const taskUpdated = makeQuery('["task","list","org-1"]', 'task', 3000, [{ id: 't1' }, { id: 't2' }]);
    await persister.persistClient(makePersistedClient([taskUpdated, me], 12345));
    await persister.flush();

    const restored = await persister.restoreClient();
    expect(restored?.timestamp).toBe(12345);
    expect(Object.fromEntries(restored!.clientState.queries.map(({ queryHash, state }) => [queryHash, state.data]))).toEqual({
      '["task","list","org-1"]': [{ id: 't1' }, { id: 't2' }],
      '["me"]': { name: 'user' },
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

  it('writes a changed query again after the write that held it failed', async () => {
    const db = getLocalUserDb()!;
    const client = makePersistedClient([makeQuery('["task","list","org-1"]', 'task', 1000, [{ id: 't1' }])]);
    const failOnce = vi.spyOn(db.queries, 'bulkPut').mockRejectedValueOnce(new Error('QuotaExceededError'));
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {});

    await persister.persistClient(client);
    await persister.flush();
    await persister.persistClient(client);
    await persister.flush();

    expect(await db.queries.where('scope').equals('rq').count()).toBe(1);
    failOnce.mockRestore();
    logged.mockRestore();
  });

  it('keeps the scope of a tab that is still open, however long it was idle', async () => {
    const db = getLocalUserDb()!;
    const releaseLock = await holdTabLock('idle-tab');
    await db.meta.put({ key: 's-idle-tab', timestamp: Date.now() - 3 * 60 * 60 * 1000, buster: '', mutations: [], channelQueries: [] });

    await cleanupOrphanedSessions();

    expect(await db.meta.get('s-idle-tab')).toBeDefined();
    releaseLock();
  });

  it("keeps this tab's queued writes however old they are, so a reload replays them", async () => {
    const db = getLocalUserDb()!;
    const mutations = [queuedMutation(['task', 'update'], { id: 't1', ops: { name: 'offline edit' } })];
    await sessionPersister.persistClient({ timestamp: Date.now(), buster: '', clientState: { queries: [], mutations } });
    await sessionPersister.flush();
    const queue = (await db.meta.toArray()).find(({ key }) => key.startsWith('s-') && key.includes(':mut:'))!;
    await db.meta.put({ ...queue, timestamp: Date.now() - 3 * 60 * 60 * 1000 });

    await cleanupOrphanedSessions();

    const restored = await sessionPersister.restoreClient();
    expect(restored!.clientState.mutations.map(({ state }) => state.variables)).toEqual([{ id: 't1', ops: { name: 'offline edit' } }]);
  });
});

describe('the options PersistQueryClientProvider restores and saves with', () => {
  beforeEach(async () => {
    bindLocalUserDb('u1');
    await persister.removeClient();
    await sessionPersister.removeClient();
  });

  afterEach(async () => {
    uiStore.setState({ offlineAccess: false });
    await deleteDb();
  });

  it('restores a cache no tab wrote for days, its queued writes included', async () => {
    uiStore.setState({ offlineAccess: true });
    const threeDaysAgo = Date.now() - 3 * 24 * 60 * 60 * 1000;
    const queries = [makeQuery('["task","list","org-1"]', 'task', threeDaysAgo, [{ id: 't1' }])];
    const mutations = [queuedMutation(['task', 'update'], { id: 't1', ops: { name: 'offline edit' } })];
    await persister.persistClient({ timestamp: threeDaysAgo, buster: '', clientState: { queries, mutations } });
    await persister.flush();

    const queryClient = new QueryClient();
    await persistQueryClientRestore({ ...persistOptions, queryClient });

    expect(queryClient.getQueryData(['task', 'list', 'org-1'])).toEqual([{ id: 't1' }]);
    expect(
      queryClient
        .getMutationCache()
        .getAll()
        .map(({ state }) => state.variables),
    ).toEqual([{ id: 't1', ops: { name: 'offline edit' } }]);
  });

  it('writes to the scope the offline access switch names at the time of the write, without a reload', async () => {
    // Subscribed with offline access off, as a tab that started in session mode.
    const queryClient = new QueryClient();
    const unsubscribe = persistQueryClientSubscribe({ ...persistOptions, queryClient });
    uiStore.setState({ offlineAccess: true });

    queryClient.setQueryData(['me'], { name: 'user' });
    await persister.flush();
    unsubscribe();

    expect((await getLocalUserDb()!.meta.get('rq'))?.channelQueries.map(({ queryKey }) => queryKey)).toEqual([['me']]);
  });
});

describe('queued mutations across a change of their variables shape', () => {
  /** A delete whose module declares version 2: rows under `rows`, where version 1 held them under `tasks`. */
  const versionedKey = ['task', 'delete'];

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

  it('registers no beforeunload teardown that would wipe the session cache on reload', () => {
    // `beforeunload` cannot tell a reload from a closed tab, so the startup sweep reclaims closed tabs' scopes and a reloaded tab keeps its scope.
    expect(importTimeWindowListeners.has('beforeunload')).toBe(false);
  });

  it('stores a write paused just before the tab closes, without waiting out the write throttle', async () => {
    const onPageHide = importTimeWindowListeners.get('pagehide');
    const mutations = [queuedMutation(['task', 'update'], { id: 't1', ops: { name: 'last edit' } })];
    await sessionPersister.persistClient({ timestamp: Date.now(), buster: '', clientState: { queries: [], mutations } });

    expect(onPageHide).toBeTypeOf('function');
    onPageHide();

    const queueStored = async () => (await getLocalUserDb()!.meta.toArray()).some(({ key }) => key.includes(':mut:'));
    // Under the one-second throttle: only the hide listener can have written it.
    await vi.waitFor(async () => expect(await queueStored()).toBe(true), { timeout: 500 });
  });
});
