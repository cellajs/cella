import 'fake-indexeddb/auto';
import type { PersistedClient } from '@tanstack/react-query-persist-client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Node test env: persister.ts touches sessionStorage + window at module load.
const sessionValues = new Map<string, string>();
vi.stubGlobal('sessionStorage', {
  getItem: (k: string) => sessionValues.get(k) ?? null,
  setItem: (k: string, v: string) => sessionValues.set(k, v),
  removeItem: (k: string) => sessionValues.delete(k),
});
vi.stubGlobal('window', { addEventListener: vi.fn(), removeEventListener: vi.fn() });
// No locks API: liveness detection falls back to the record-age threshold.
vi.stubGlobal('navigator', { onLine: true });

const { bindAppDb, getAppDb } = await import('~/query/app-db');
const { createIDBPersister } = await import('~/query/persister');

bindAppDb('persister-test-user');

const pausedMutation = (key: string) =>
  ({
    mutationKey: ['attachment', 'update'],
    state: {
      context: undefined,
      data: undefined,
      error: null,
      failureCount: 0,
      failureReason: null,
      isPaused: true,
      status: 'pending',
      variables: { id: key, ops: { name: key } },
      submittedAt: Date.now(),
    },
  }) as unknown as NonNullable<PersistedClient['clientState']['mutations']>[number];

const clientWith = (mutations: PersistedClient['clientState']['mutations']): PersistedClient => ({
  timestamp: Date.now(),
  buster: '',
  clientState: { queries: [], mutations },
});

describe('persister per-tab mutation records (D5)', () => {
  const persister = createIDBPersister('rq');

  beforeEach(async () => {
    const db = getAppDb();
    await db?.queries.clear();
    await db?.meta.clear();
  });

  afterEach(async () => {
    const db = getAppDb();
    await db?.queries.clear();
    await db?.meta.clear();
  });

  it('writes paused mutations to a per-tab record and keeps the shared meta record mutation-free', async () => {
    await persister.persistClient(clientWith([pausedMutation('m1')]));
    await persister.flush();

    const db = getAppDb();
    const records = (await db?.meta.toArray()) ?? [];
    const shared = records.find((r) => r.key === 'rq');
    const tabRecord = records.find((r) => r.key.startsWith('rq:mut:'));

    expect(shared?.mutations).toEqual([]);
    expect(tabRecord?.mutations).toHaveLength(1);
  });

  it('restores its own tab record after a refresh (same session id)', async () => {
    await persister.persistClient(clientWith([pausedMutation('m1')]));
    await persister.flush();

    const restored = await persister.restoreClient();
    expect(restored?.clientState.mutations).toHaveLength(1);
    // The own record is NOT deleted at restore: a crash before the next flush must not lose it.
    const db = getAppDb();
    expect(((await db?.meta.toArray()) ?? []).some((r) => r.key.startsWith('rq:mut:'))).toBe(true);
  });

  it('absorbs and removes a DEAD tab record (age fallback without locks API)', async () => {
    const db = getAppDb();
    await db?.meta.put({
      key: 'rq',
      timestamp: Date.now(),
      buster: '',
      mutations: [],
      channelQueries: [],
    });
    await db?.meta.put({
      key: 'rq:mut:dead-tab',
      timestamp: Date.now() - 3 * 60 * 60 * 1000, // older than the 2h orphan threshold
      buster: '',
      mutations: [pausedMutation('crashed')],
      channelQueries: [],
    });

    const restored = await persister.restoreClient();

    expect(restored?.clientState.mutations).toHaveLength(1);
    expect(((await db?.meta.toArray()) ?? []).some((r) => r.key === 'rq:mut:dead-tab')).toBe(false);
  });

  it('leaves a fresh (assumed-live) foreign tab record alone', async () => {
    const db = getAppDb();
    await db?.meta.put({
      key: 'rq',
      timestamp: Date.now(),
      buster: '',
      mutations: [],
      channelQueries: [],
    });
    await db?.meta.put({
      key: 'rq:mut:other-live-tab',
      timestamp: Date.now(),
      buster: '',
      mutations: [pausedMutation('other')],
      channelQueries: [],
    });

    const restored = await persister.restoreClient();

    expect(restored?.clientState.mutations).toHaveLength(0);
    expect(((await db?.meta.toArray()) ?? []).some((r) => r.key === 'rq:mut:other-live-tab')).toBe(true);
  });

  it('clears the per-tab record once the queue empties', async () => {
    await persister.persistClient(clientWith([pausedMutation('m1')]));
    await persister.flush();
    await persister.persistClient(clientWith([]));
    await persister.flush();

    const db = getAppDb();
    expect(((await db?.meta.toArray()) ?? []).some((r) => r.key.startsWith('rq:mut:'))).toBe(false);
  });

  it('still restores mutations from the legacy shared-record shape', async () => {
    const db = getAppDb();
    await db?.meta.put({
      key: 'rq',
      timestamp: Date.now(),
      buster: '',
      mutations: [pausedMutation('legacy')],
      channelQueries: [],
    });

    const restored = await persister.restoreClient();
    expect(restored?.clientState.mutations).toHaveLength(1);
  });
});
