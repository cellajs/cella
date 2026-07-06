/**
 * Boot-time lens migration pass in the persister: persisted schema ordinal
 * behind the bundle → cached rows + queued mutations rewritten locally, pointer
 * advanced atomically; ahead (rollback) → queries wiped, mutations kept;
 * session scopes wiped instead of migrated.
 */
import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('shared', () => ({
  appConfig: {
    slug: 'test-app',
    productEntityTypes: ['task', 'label', 'attachment', 'page'],
    clientCacheVersion: 'v1',
  },
}));

// Lens engine mock: bundle is at schema v1 with a single attachment rename name → title.
vi.mock('shared/version-changes', () => ({
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

vi.stubGlobal('window', {
  addEventListener: vi.fn(),
  removeEventListener: vi.fn(),
});

const sessionStorageMap = new Map<string, string>();
vi.stubGlobal('sessionStorage', {
  getItem: (key: string) => sessionStorageMap.get(key) ?? null,
  setItem: (key: string, value: string) => sessionStorageMap.set(key, value),
  removeItem: (key: string) => sessionStorageMap.delete(key),
});

const { persister, sessionPersister } = await import('~/query/persister');
const { bindAppDb, deleteAppDb, getAppDb } = await import('~/query/app-db');
const { migrateCachedEntity } = await import('shared/version-changes');

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
  const db = getAppDb()!;
  await db.meta.put({
    key: scope,
    timestamp: Date.now(),
    buster: '',
    clientCacheVersion: 'v1',
    schemaVersion,
    mutations: [queuedMutation({ name: 'offline edit' })] as never,
    contextQueries: [],
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
    bindAppDb('u1');
    await persister.removeClient();
    vi.clearAllMocks();
  });

  afterEach(async () => {
    await deleteAppDb();
  });

  it('migrates cached rows + queued mutations and advances the pointer', async () => {
    await seedScope('rq', 0);

    const restored = await persister.restoreClient();
    expect(restored).toBeDefined();

    const attachmentQuery = restored!.clientState.queries.find((q) => q.queryHash === '["attachment","list"]');
    expect(attachmentQuery!.state.data).toEqual([{ id: 'a1', title: 'pic' }]);
    expect(restored!.clientState.mutations[0].state.variables).toEqual({ title: 'offline edit' });

    // Pointer advanced on disk — a second restore runs no migration.
    const meta = await getAppDb()!.meta.get('rq');
    expect(meta!.schemaVersion).toBe(1);
    vi.mocked(migrateCachedEntity).mockClear();
    await persister.restoreClient();
    expect(migrateCachedEntity).not.toHaveBeenCalled();
  });

  it('runs no migration when the pointer is current', async () => {
    await seedScope('rq', 1);

    const restored = await persister.restoreClient();
    const attachmentQuery = restored!.clientState.queries.find((q) => q.queryHash === '["attachment","list"]');
    // Row keeps its (old-shape) data untouched — nothing ran.
    expect(attachmentQuery!.state.data).toEqual([{ id: 'a1', name: 'pic' }]);
    expect(migrateCachedEntity).not.toHaveBeenCalled();
  });

  it('wipes query data but keeps mutations on a rollback deploy (pointer ahead)', async () => {
    await seedScope('rq', 5);

    const restored = await persister.restoreClient();
    expect(restored!.clientState.queries).toHaveLength(0);
    expect(restored!.clientState.mutations).toHaveLength(1);

    const meta = await getAppDb()!.meta.get('rq');
    expect(meta!.schemaVersion).toBe(1);
  });

  it('wipes session scopes on pointer mismatch instead of migrating', async () => {
    const sessionScope = [...sessionStorageMap.values()][0] ? `s-${[...sessionStorageMap.values()][0]}` : undefined;
    expect(sessionScope).toBeDefined();
    await seedScope(sessionScope!, 0);

    const restored = await sessionPersister.restoreClient();
    expect(restored).toBeUndefined();
    expect(await getAppDb()!.meta.get(sessionScope!)).toBeUndefined();
    expect(await getAppDb()!.queries.where('scope').equals(sessionScope!).count()).toBe(0);
  });
});
