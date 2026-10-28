import 'fake-indexeddb/auto';
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

// Lens engine mock: bundle is at schema v1 with a single attachment rename name → title.
vi.mock('shared/schema-evolution', () => ({
  currentSchemaVersion: 1,
  migrateCachedEntity: vi.fn(async (_entityType: string, entity: Record<string, unknown>) => {
    if ('name' in entity) {
      const { name, ...rest } = entity;
      return { ...rest, title: name };
    }
    return entity;
  }),
  migrateQueuedMutation: vi.fn((_entityType: string, variables: Record<string, unknown>) => {
    if ('name' in variables) {
      const { name, ...rest } = variables;
      return { ...rest, title: name };
    }
    return variables;
  }),
}));

vi.stubGlobal('window', { addEventListener: vi.fn(), removeEventListener: vi.fn() });

const sessionStorageMap = new Map<string, string>();
vi.stubGlobal('sessionStorage', {
  getItem: (key: string) => sessionStorageMap.get(key) ?? null,
  setItem: (key: string, value: string) => sessionStorageMap.set(key, value),
  removeItem: (key: string) => sessionStorageMap.delete(key),
});

const { persister } = await import('~/query/persister');
const { bindLocalUserDb, deleteLocalUserDb, getLocalUserDb } = await import('~/query/local-user-db');
const { isBundleStale, resetBundleStale } = await import('~/query/schema-version-guard');
const { migrateCachedEntity } = await import('shared/schema-evolution');

const queuedMutation = (variables: Record<string, unknown>) => ({
  mutationKey: ['attachment', 'update'] as unknown[],
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

/** Seed an old-shape attachment cache at a given persisted schema ordinal. */
async function seedScope(scope: string, schemaVersion: number) {
  const db = getLocalUserDb()!;
  await db.meta.put({
    key: scope,
    timestamp: Date.now(),
    buster: '',
    clientCacheVersion: 'v1',
    schemaVersion,
    mutations: [queuedMutation({ name: 'offline edit' })] as never,
    bundledQueries: [],
  });
  await db.queries.put({
    id: `${scope}:["attachment","list"]`,
    scope,
    queryHash: '["attachment","list"]',
    queryKey: ['attachment', 'list'],
    state: { data: [{ id: 'a1', name: 'pic' }], dataUpdatedAt: 100, status: 'success' } as never,
    dataUpdatedAt: 100,
  });
}

describe('persister lens boot migration', () => {
  beforeEach(async () => {
    bindLocalUserDb('u1');
    resetBundleStale();
    await persister.removeClient();
    vi.clearAllMocks();
  });

  afterEach(async () => {
    await deleteLocalUserDb();
  });

  it('migrates cached rows + queued mutations and advances the pointer', async () => {
    await seedScope('rq', 0);

    const restored = await persister.restoreClient();
    expect(restored).toBeDefined();

    const attachmentQuery = restored!.clientState.queries.find((q) => q.queryHash === '["attachment","list"]');
    expect(attachmentQuery!.state.data).toEqual([{ id: 'a1', title: 'pic' }]);
    expect(restored!.clientState.mutations[0].state.variables).toEqual({ title: 'offline edit' });

    // Pointer advanced on disk, a second restore runs no migration.
    const meta = await getLocalUserDb()!.meta.get('rq');
    expect(meta!.schemaVersion).toBe(1);
    vi.mocked(migrateCachedEntity).mockClear();
    await persister.restoreClient();
    expect(migrateCachedEntity).not.toHaveBeenCalled();
  });

  it('leaves a store a newer bundle migrated as it is: restores nothing from it and never writes to it', async () => {
    const db = getLocalUserDb()!;
    const writeAttempt = async () => {
      await persister.persistClient({ timestamp: 999, buster: '', clientState: { queries: [], mutations: [] } });
      await persister.flush();
    };
    /** The pointer on disk, and whether the attempted write reached it. */
    const onDisk = async () => {
      const meta = await db.meta.get('rq');
      return { schemaVersion: meta?.schemaVersion, written: meta?.timestamp === 999 };
    };

    // The store is ahead at boot: a rollback deploy, or a newer tab migrated first.
    await seedScope('rq', 5);
    expect(await persister.restoreClient()).toBeUndefined();
    await writeAttempt();
    expect(await onDisk()).toEqual({ schemaVersion: 5, written: false });
    expect(await db.queries.where('scope').equals('rq').count()).toBe(1);

    // A newer tab migrates the store forward after this bundle booted on it, and the broadcast is lost: the write checks the disk.
    resetBundleStale();
    await seedScope('rq', 1);
    await persister.restoreClient();
    await db.meta.put({ ...(await db.meta.get('rq'))!, schemaVersion: 2 });
    await writeAttempt();
    expect(isBundleStale()).toBe(true);
    expect(await onDisk()).toEqual({ schemaVersion: 2, written: false });
  });
});
