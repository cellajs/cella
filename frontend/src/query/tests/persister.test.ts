import 'fake-indexeddb/auto';
import type { PersistedClient } from '@tanstack/react-query-persist-client';
import { Dexie } from 'dexie';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Mock shared config before any module imports
vi.mock('shared', () => ({
  appConfig: {
    slug: 'test-app',
    productEntityTypes: ['task', 'label', 'attachment', 'page'],
  },
}));

// Stub window.addEventListener for the module-level beforeunload listener
vi.stubGlobal('window', {
  addEventListener: vi.fn(),
  removeEventListener: vi.fn(),
});

// Mock sessionStorage for getTabSessionId
const sessionStorageMap = new Map<string, string>();
vi.stubGlobal('sessionStorage', {
  getItem: (key: string) => sessionStorageMap.get(key) ?? null,
  setItem: (key: string, value: string) => sessionStorageMap.set(key, value),
  removeItem: (key: string) => sessionStorageMap.delete(key),
});

const { persister, sessionPersister, cleanupOrphanedSessions } = await import('~/query/persister');

// -- Helpers ------------------------------------------------------------------

function makeQuery(hash: string, entityType: string, dataUpdatedAt: number, data: unknown = null) {
  return {
    queryHash: hash,
    queryKey: [entityType, 'list', 'org-1'] as unknown[],
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
    clientState: {
      queries,
      mutations: [],
    },
  };
}

/** Delete the test-app database between tests */
async function deleteDb() {
  await Dexie.delete('test-app-query-persister');
}

// -- Tests --------------------------------------------------------------------

describe('per-query IDB persister', () => {
  beforeEach(async () => {
    // Clear internal lastPersistedAt state + IDB records before wiping the DB
    await persister.removeClient();
    await sessionPersister.removeClient();
    await deleteDb();
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

      // Data round-trips correctly
      const taskQuery = restored!.clientState.queries.find((q) => q.queryHash === '["task","list","org-1"]');
      expect(taskQuery!.state.data).toEqual([{ id: 't1' }]);
      expect(taskQuery!.state.dataUpdatedAt).toBe(1000);
    });

    it('returns undefined when nothing is persisted', async () => {
      const restored = await persister.restoreClient();
      expect(restored).toBeUndefined();
    });

    it('persists mutations in meta record', async () => {
      const client: PersistedClient = {
        timestamp: 1000,
        buster: 'v1',
        clientState: {
          queries: [makeQuery('["me"]', 'me', 100)],
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
                variables: { title: 'test' },
                submittedAt: 0,
              },
            },
          ],
        },
      };

      await persister.persistClient(client);
      await persister.flush();

      const restored = await persister.restoreClient();
      expect(restored!.clientState.mutations).toHaveLength(1);
      expect(restored!.clientState.mutations[0].mutationKey).toEqual(['task', 'create']);
    });
  });

  describe('incremental writes', () => {
    it('only writes changed queries on subsequent persist calls', async () => {
      const q1 = makeQuery('["task","list","org-1"]', 'task', 1000, [{ id: 't1' }]);
      const q2 = makeQuery('["me"]', 'me', 2000, { name: 'user' });

      // First persist: writes both
      await persister.persistClient(makePersistedClient([q1, q2]));
      await persister.flush();

      // Second persist: same data, nothing should change
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

      // Update task query only
      const q1Updated = makeQuery('["task","list","org-1"]', 'task', 3000, [{ id: 't1' }, { id: 't2' }]);
      await persister.persistClient(makePersistedClient([q1Updated, q2]));
      await persister.flush();

      const restored = await persister.restoreClient();
      const taskQuery = restored!.clientState.queries.find((q) => q.queryHash === '["task","list","org-1"]');
      expect(taskQuery!.state.data).toEqual([{ id: 't1' }, { id: 't2' }]);
      expect(taskQuery!.state.dataUpdatedAt).toBe(3000);

      // me query should be unchanged
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

      // Persist with only q1 — q2 and q3 should be removed
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
        makeQuery('["page","list"]', 'page', 1000),
      ];

      await persister.persistClient(makePersistedClient(queries));
      await persister.flush();

      // Read from DB directly — product queries should be in queries table
      const { Dexie: D } = await import('dexie');
      const db = new D('test-app-query-persister');
      db.version(3).stores({ queries: 'id, scope', meta: 'key' });
      const productRecords = await db.table('queries').where('scope').equals('rq').toArray();
      expect(productRecords).toHaveLength(4);
      db.close();
    });

    it('bundles context queries into the meta record', async () => {
      const queries = [
        makeQuery('["me"]', 'me', 1000),
        makeQuery('["organization","list"]', 'organization', 1000),
        makeQuery('["member","list"]', 'member', 1000),
      ];

      await persister.persistClient(makePersistedClient(queries));
      await persister.flush();

      const { Dexie: D } = await import('dexie');
      const db = new D('test-app-query-persister');
      db.version(3).stores({ queries: 'id, scope', meta: 'key' });

      // No individual records for context queries
      const queryRecords = await db.table('queries').where('scope').equals('rq').toArray();
      expect(queryRecords).toHaveLength(0);

      // Context queries bundled in meta
      const meta = await db.table('meta').get('rq');
      expect(meta.contextQueries).toHaveLength(3);
      const hashes = meta.contextQueries.map((q: { queryHash: string }) => q.queryHash).sort();
      expect(hashes).toEqual(['["me"]', '["member","list"]', '["organization","list"]']);
      db.close();
    });

    it('restores both product and context queries together', async () => {
      const queries = [
        makeQuery('["task","list"]', 'task', 1000, [{ id: 't1' }]),
        makeQuery('["me"]', 'me', 2000, { name: 'user' }),
      ];

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
      const { Dexie: D } = await import('dexie');
      const db = new D('test-app-query-persister');
      db.version(3).stores({ queries: 'id, scope', meta: 'key' });

      const oldScope = 's-old-uuid';
      await db.table('meta').put({
        key: oldScope,
        timestamp: Date.now() - 3 * 60 * 60 * 1000, // 3 hours ago (past 2h cutoff)
        buster: '',
        mutations: [],
        contextQueries: [],
      });
      await db.table('queries').put({
        id: `${oldScope}:["task","list"]`,
        scope: oldScope,
        queryHash: '["task","list"]',
        queryKey: ['task', 'list'],
        state: { data: 'stale', dataUpdatedAt: 100, status: 'success' },
        dataUpdatedAt: 100,
      });
      db.close();

      await cleanupOrphanedSessions();

      // Re-open to verify cleanup
      const db2 = new D('test-app-query-persister');
      db2.version(3).stores({ queries: 'id, scope', meta: 'key' });
      const metaRecords = await db2.table('meta').where('key').equals(oldScope).count();
      const queryRecords = await db2.table('queries').where('scope').equals(oldScope).count();
      expect(metaRecords).toBe(0);
      expect(queryRecords).toBe(0);
      db2.close();
    });
  });
});
