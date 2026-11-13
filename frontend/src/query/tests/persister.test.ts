import 'fake-indexeddb/auto';
import '~/query/tests/query-client-env';
import { type DehydratedState, dehydrate, QueryClient } from '@tanstack/react-query';
import { persistQueryClientRestore, persistQueryClientSave } from '@tanstack/react-query-persist-client';
import { appConfig } from 'shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { QueryMeta } from '~/query/react-query';

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

// The persister reads its tab id from sessionStorage when it loads, and registers its page-hide flush on the window the
// env stubs. The env's navigator has no locks API, so a tab's liveness falls back to the age of its record.
vi.stubGlobal('document', { addEventListener: vi.fn(), visibilityState: 'visible' });
const addWindowListener = vi.fn();
Object.assign(window, { addEventListener: addWindowListener });
const sessionStorageMap = new Map<string, string>();
vi.stubGlobal('sessionStorage', {
  getItem: (key: string) => sessionStorageMap.get(key) ?? null,
  setItem: (key: string, value: string) => sessionStorageMap.set(key, value),
  removeItem: (key: string) => sessionStorageMap.delete(key),
});

const { persister, persistOptions, shouldPersistQuery } = await import('~/query/persister');
const { bindLocalUserDb, getLocalUserDb, sweepLocalUserDbs } = await import('~/query/local-user-db');
const { registerVariablesVersion } = await import('~/query/offline/mutation-variables');
const { resetBundleStale } = await import('~/query/schema-version-guard');
const { authHealthQueryOptions, pendingMagicLinkQueryOptions, tokenDataQueryOptions } = await import('~/modules/auth/query');
const { yjsTokenQueryOptions } = await import('~/modules/common/blocknote/query');
const { totpKeyQueryOptions } = await import('~/modules/me/query');
const { organizationsListQueryOptions } = await import('~/modules/organization/query');

/** What a browser runs on pagehide: every listener the modules registered for it, taken now since the harness clears a mock's calls before each test. */
const pageHideListeners: (() => void)[] = addWindowListener.mock.calls.filter(([type]) => type === 'pagehide').map(([, listener]) => listener);

type StoredMutation = DehydratedState['mutations'][number];

const [productType] = appConfig.productEntityTypes;
/** A product list, which the store holds as a record of its own; any other query goes into the bundle. */
const productKey = (organizationId: string) => [productType, 'list', organizationId];
const thisTabId = () => sessionStorageMap.get(`${appConfig.slug}-tab-session-id`);
const tabRecords = async () => getLocalUserDb()!.meta.where('key').startsWith('rq:mut:').toArray();

/** A write as the store holds it: paused, since it met an outage, and stamped with the version of its variables. */
const storedWrite = (mutationKey: unknown[], variables: unknown): StoredMutation => ({
  mutationKey,
  meta: { variablesVersion: 1 },
  state: {
    context: undefined,
    data: undefined,
    error: null,
    failureCount: 0,
    failureReason: null,
    isPaused: true,
    status: 'pending',
    variables,
    submittedAt: 100,
  },
});

/** Queues a write in a client's mutation cache as one that met an outage: paused, with the meta its module gives it. */
const queueWrite = (client: QueryClient, mutationKey: unknown[], variables: unknown, meta?: QueryMeta) =>
  client.getMutationCache().build(client, { mutationKey, meta }, storedWrite(mutationKey, variables).state);

/** Saves a client as the provider does, through its dehydrate options, and waits out the write throttle. */
const save = async (client: QueryClient) => {
  await persistQueryClientSave({ queryClient: client, ...persistOptions });
  await persister.flush();
};

/** A tab that opens: a new client, restored as the provider restores it. */
const reload = async () => {
  const client = new QueryClient();
  await persistQueryClientRestore({ ...persistOptions, queryClient: client });
  return client;
};

beforeEach(async () => {
  bindLocalUserDb('u1');
  resetBundleStale();
  await persister.removeClient();
});

afterEach(async () => {
  await sweepLocalUserDbs(() => []);
});

// The filter every save passes through, fed the app's own query options, so a query that must stay out of the local
// database is checked as declared and not as restated here.
describe('the queries the provider saves', () => {
  it('must not persist the Yjs token, the pending magic link, token data or a TOTP key, while an ordinary query persists', async () => {
    const client = new QueryClient();
    const yjsToken = yjsTokenQueryOptions({ entityType: 'attachment', entityId: 'attachment-1', tenantId: 'tenant-1', organizationId: 'org-1' });
    await client.query({ ...yjsToken, queryFn: async () => 'a-bearer-token' });
    await client.query({ ...pendingMagicLinkQueryOptions, queryFn: async () => ({ email: 'other@example.com' }) });
    await client.query({ ...tokenDataQueryOptions('invitation', 'token-1'), queryFn: async () => ({ email: 'invited@example.com' }) });
    await client.query({ ...totpKeyQueryOptions(), queryFn: async () => ({ totpUri: 'otpauth://totp/x', manualKey: 'SECRET' }) });
    await client.query({ queryKey: ['organization', 'list'], queryFn: async () => [] });

    const { queries } = dehydrate(client, { shouldDehydrateQuery: shouldPersistQuery });

    expect(queries.map((query) => query.queryKey)).toEqual([['organization', 'list']]);
  });
});

describe('the cache as the provider saves and restores it', () => {
  it('restores the cache as the last write left it: a changed query updated, a dropped one gone, product and context alike', async () => {
    const client = new QueryClient();
    client.setQueryData(productKey('org-1'), [{ id: 'p1' }], { updatedAt: 1000 });
    client.setQueryData(productKey('org-2'), [{ id: 'p2' }], { updatedAt: 1000 });
    client.setQueryData(['me'], { name: 'user' }, { updatedAt: 2000 });
    await save(client);
    // The next write: one list changed, the other is gone, the context query is as it was.
    client.setQueryData(productKey('org-1'), [{ id: 'p1' }, { id: 'p3' }], { updatedAt: 3000 });
    client.removeQueries({ queryKey: productKey('org-2') });
    await save(client);

    const reloaded = await reload();
    expect(reloaded.getQueryData(productKey('org-1'))).toEqual([{ id: 'p1' }, { id: 'p3' }]);
    expect(reloaded.getQueryData(productKey('org-2'))).toBeUndefined();
    expect(reloaded.getQueryData(['me'])).toEqual({ name: 'user' });
  });

  // A toast rule in `meta` is a function, which the store refuses: the write failed whole, product rows and queued writes
  // included, for every session that read a list (0.40.0).
  it('stores the cache when a list, a probe or a queued write carries a toast rule, as the organization list, the health probe and the organization create do', async () => {
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {});
    const client = new QueryClient();
    const organizations = organizationsListQueryOptions({});
    await client.infiniteQuery({ ...organizations, queryFn: async () => ({ results: [], totalSize: 0 }) });
    await client.query({ ...authHealthQueryOptions, queryFn: async () => ({ restrictedMode: false, emailEnabled: true, federations: [] }) });
    client.setQueryData(productKey('org-1'), [{ id: 'p1' }]);
    const variables = { body: [{ name: 'Offline org' }] };
    queueWrite(client, ['organization', 'create'], variables, { suppressGlobalErrorToast: (error) => error.type === 'slug_exists' });
    await save(client);

    const reloaded = await reload();
    expect(logged).not.toHaveBeenCalled();
    expect(reloaded.getQueryData(productKey('org-1'))).toEqual([{ id: 'p1' }]);
    expect(reloaded.getQueryData(organizations.queryKey)).toMatchObject({ pages: [{ results: [] }] });
    expect(reloaded.getQueryData(authHealthQueryOptions.queryKey)).toMatchObject({ restrictedMode: false });
    expect(
      reloaded
        .getMutationCache()
        .getAll()
        .map(({ state, meta }) => [state.variables, meta]),
    ).toEqual([[variables, { variablesVersion: 1 }]]);
    logged.mockRestore();
  });

  it('wipes the cached queries but keeps the queued writes when an older bundle wrote the cache', async () => {
    const client = new QueryClient();
    client.setQueryData(productKey('org-1'), [{ id: 'p1' }]);
    client.setQueryData(['me'], { name: 'user' });
    queueWrite(client, [productType, 'create'], { title: 'offline edit' });
    await save(client);
    const db = getLocalUserDb()!;
    await db.meta.put({ ...(await db.meta.get('rq'))!, clientCacheVersion: appConfig.clientCacheVersion - 1 });

    const reloaded = await reload();
    expect(reloaded.getQueryCache().getAll()).toHaveLength(0);
    expect(
      reloaded
        .getMutationCache()
        .getAll()
        .map(({ state }) => state.variables),
    ).toEqual([{ title: 'offline edit' }]);
    expect((await db.meta.get('rq'))?.clientCacheVersion).toBe(appConfig.clientCacheVersion);
  });

  it('restores nothing and never writes when a newer bundle wrote the cache, as after a rollback deploy', async () => {
    const client = new QueryClient();
    client.setQueryData(['me'], { name: 'user' });
    await save(client);
    const db = getLocalUserDb()!;
    await db.meta.put({ ...(await db.meta.get('rq'))!, clientCacheVersion: appConfig.clientCacheVersion + 1 });

    const reloaded = await reload();
    expect(reloaded.getQueryData(['me'])).toBeUndefined();
    reloaded.setQueryData(['me'], { name: 'changed' });
    await save(reloaded);

    expect((await db.meta.get('rq'))?.bundledQueries.map(({ state }) => state.data)).toEqual([{ name: 'user' }]);
  });

  it('writes a changed query again after the write that held it failed', async () => {
    const db = getLocalUserDb()!;
    const client = new QueryClient();
    client.setQueryData(productKey('org-1'), [{ id: 'p1' }]);
    const failOnce = vi.spyOn(db.queries, 'bulkPut').mockRejectedValueOnce(new Error('QuotaExceededError'));
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {});

    await save(client);
    await save(client);

    expect(await db.queries.count()).toBe(1);
    failOnce.mockRestore();
    logged.mockRestore();
  });

  it('restores a cache no tab wrote for days, its queued writes included', async () => {
    const threeDaysAgo = Date.now() - 3 * 24 * 60 * 60 * 1000;
    const client = new QueryClient();
    client.setQueryData(productKey('org-1'), [{ id: 'p1' }], { updatedAt: threeDaysAgo });
    queueWrite(client, [productType, 'update'], { id: 'p1', ops: { name: 'offline edit' } });
    await save(client);
    const db = getLocalUserDb()!;
    await db.meta.put({ ...(await db.meta.get('rq'))!, timestamp: threeDaysAgo });

    const reloaded = await reload();
    expect(reloaded.getQueryData(productKey('org-1'))).toEqual([{ id: 'p1' }]);
    expect(
      reloaded
        .getMutationCache()
        .getAll()
        .map(({ state }) => state.variables),
    ).toEqual([{ id: 'p1', ops: { name: 'offline edit' } }]);
  });

  // The mark never reached disk: a list marked for a refetch came back from a reload as fresh, a product list and a bundled one alike.
  it('restores a query marked for a refetch as marked', async () => {
    const client = new QueryClient();
    const keys = [productKey('org-1'), ['organization', 'list']];
    for (const key of keys) client.setQueryData(key, [{ id: 'a' }]);
    await save(client);
    await client.invalidateQueries({ refetchType: 'none' });
    await save(client);

    const reloaded = await reload();
    expect(keys.map((key) => reloaded.getQueryState(key)?.isInvalidated)).toEqual([true, true]);
  });

  // A failed refetch dropped the stored copy: one offline cold boot lost the memberships, and the next showed the root error page.
  it('keeps the last data of a query whose refetch got no response, restored marked, and drops it on a 404', async () => {
    const client = new QueryClient();
    const offlineKey = ['me', 'memberships'];
    const goneKey = ['organization', 'detail', 'o1'];
    for (const key of [offlineKey, goneKey]) await client.query({ queryKey: key, queryFn: async () => ({ results: [{ id: 'm1' }] }) });
    const { dataUpdatedAt } = client.getQueryState(offlineKey)!;
    await save(client);
    const fail = (error: Error) => () => Promise.reject(error);
    await client.query({ queryKey: offlineKey, queryFn: fail(new TypeError('Failed to fetch')), staleTime: 0, retry: false }).catch(() => {});
    await client
      .query({ queryKey: goneKey, queryFn: fail(Object.assign(new Error('gone'), { status: 404 })), staleTime: 0, retry: false })
      .catch(() => {});
    await save(client);

    const reloaded = await reload();
    expect(reloaded.getQueryState(offlineKey)).toMatchObject({
      status: 'success',
      error: null,
      data: { results: [{ id: 'm1' }] },
      dataUpdatedAt,
      isInvalidated: true,
    });
    expect(reloaded.getQueryState(goneKey)).toBeUndefined();
  });

  // Discarding a cache that failed to hydrate deleted the queue of every tab, open tabs included.
  it("keeps every tab's queued writes when it discards the cache", async () => {
    const client = new QueryClient();
    client.setQueryData(['me'], { name: 'user' });
    queueWrite(client, [productType, 'update'], { id: 'p1', ops: { name: 'offline edit' } });
    await save(client);
    const db = getLocalUserDb()!;
    const [own] = await tabRecords();
    await db.meta.put({ ...own, key: 'rq:mut:open-tab' });

    await persister.removeClient();

    expect((await db.meta.get('rq'))?.bundledQueries).toEqual([]);
    expect((await tabRecords()).map(({ mutations }) => mutations?.length)).toEqual([1, 1]);
  });

  it('stores a write paused just before the tab closes, without waiting out the write throttle', async () => {
    const client = new QueryClient();
    queueWrite(client, [productType, 'update'], { id: 'p1', ops: { name: 'last edit' } });
    await persistQueryClientSave({ queryClient: client, ...persistOptions });

    expect(pageHideListeners).not.toHaveLength(0);
    for (const listener of pageHideListeners) listener();

    // Under the one-second throttle: only the hide listener can have written it.
    await vi.waitFor(async () => expect((await tabRecords()).length).toBe(1), { timeout: 500 });
  });
});

describe('the queued writes of every tab', () => {
  // A queue in the shared meta record let one tab's write overwrite another tab's queue: each tab writes its own record.
  it('restores every queued write once: no tab overwrites the queue of another, or takes over one still open', async () => {
    const client = new QueryClient();
    queueWrite(client, [productType, 'update'], { id: 'own' });
    await save(client);
    const db = getLocalUserDb()!;
    // A tab that is still open has written its own queue...
    await db.meta.put({
      key: 'rq:mut:other-live-tab',
      timestamp: Date.now(),
      mutations: [storedWrite([productType, 'update'], { id: 'other' })],
      bundledQueries: [],
    });
    // ...and a tab that crashed hours ago left one behind.
    await db.meta.put({
      key: 'rq:mut:dead-tab',
      timestamp: Date.now() - 3 * 60 * 60 * 1000,
      mutations: [storedWrite([productType, 'update'], { id: 'crashed' })],
      bundledQueries: [],
    });

    const reloaded = await reload();

    const ids = reloaded
      .getMutationCache()
      .getAll()
      .map(({ state }) => (state.variables as { id: string }).id);
    expect(ids.sort()).toEqual(['crashed', 'own']);
    // The open tab keeps its record, the dead one's is taken over, and this tab's own stays until its next write.
    expect((await tabRecords()).map((record) => record.key).sort()).toEqual(['rq:mut:other-live-tab', `rq:mut:${thisTabId()}`].sort());
  });

  // The restore deleted a dead tab's record and stored its queue only at this tab's first write, up to a second later.
  it("keeps a dead tab's queue when this tab reloads before its first write", async () => {
    const db = getLocalUserDb()!;
    await db.meta.put({ key: 'rq', timestamp: Date.now(), bundledQueries: [] });
    await db.meta.put({
      key: 'rq:mut:dead-tab',
      timestamp: Date.now() - 3 * 60 * 60 * 1000,
      mutations: [storedWrite([productType, 'update'], { id: 'crashed' })],
      bundledQueries: [],
    });

    await reload();
    const reloaded = await reload();

    expect(
      reloaded
        .getMutationCache()
        .getAll()
        .map(({ state }) => state.variables),
    ).toEqual([{ id: 'crashed' }]);
  });
});

describe('a queued write across a change of its variables shape', () => {
  /** A delete whose module declares version 2: rows under `rows`, where version 1 held them under `tasks`. */
  const versionedKey = [productType, 'delete'];

  beforeEach(() => {
    lensPassSaw.variables.length = 0;
    registerVariablesVersion(versionedKey, 2, (variables) => {
      if (typeof variables !== 'object' || variables === null || !('tasks' in variables)) return null;
      const { tasks, ...rest } = variables;
      return { ...rest, rows: tasks };
    });
  });

  it('hands the lens pass the queue in the shape this bundle reads, so it finds the rows of an older delete', async () => {
    const client = new QueryClient();
    client.setQueryData(['me'], { name: 'user' });
    queueWrite(client, versionedKey, { tenantId: 't', tasks: [{ id: 'p1' }] });
    await save(client);
    // The store as a bundle before versions left it: a queue without stamps, one lens ordinal behind this bundle.
    const db = getLocalUserDb()!;
    const [record] = await tabRecords();
    await db.meta.put({ ...record, mutations: (record.mutations ?? []).map(({ meta: _stamp, ...mutation }) => mutation) });
    await db.meta.put({ ...(await db.meta.get('rq'))!, schemaVersion: 0 });

    const restored = await persister.restoreClient();

    expect(lensPassSaw.variables).toEqual([{ tenantId: 't', rows: [{ id: 'p1' }] }]);
    expect(restored!.clientState.mutations).toMatchObject([
      { meta: { variablesVersion: 2 }, state: { variables: { tenantId: 't', rows: [{ id: 'p1' }] } } },
    ]);
    // The store holds the upgraded queue with its stamp: a second restore has nothing left to upgrade.
    const [upgraded] = await tabRecords();
    expect(upgraded.mutations).toMatchObject([{ meta: { variablesVersion: 2 }, state: { variables: { rows: [{ id: 'p1' }] } } }]);
  });
});
