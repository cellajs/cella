import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeStorage, mapUpdate, mockScope, mockWebSocket, readMap, storageKey } from './helpers';

// Real compaction, materialize, cleanup and sweep over in-memory storage; the backend answers through a stubbed fetch.
const storage = fakeStorage();
vi.mock('../data/storage', () => storage);
vi.mock('../data/entity-content', () => ({ loadEntityDescription: vi.fn(async () => null) }));

const { getCollab, joinCollab, leaveCollab } = await import('../sync/session-manager');
const { runCompaction } = await import('../sync/relay');
const { runStartupSweep } = await import('../sync/sweep');

const GRACE = 5 * 60 * 1000;
const fetchMock = vi.fn();

let counter = 0;
/** A verified session on a fresh document whose base holds the written seed and whose log holds two unwritten edits. */
async function sessionWithEdits() {
  const ctx = mockScope({ entityId: `refusal-${++counter}` });
  const key = storageKey(ctx);
  storage.bases.set(key, mapUpdate('seed', true));
  await storage.appendUpdate(ctx, 'user-1', mapUpdate('a', 1));
  // The last editor lost access mid-session: the backend refuses the write credited to them.
  await storage.appendUpdate(ctx, 'user-2', mapUpdate('b', 2));
  const ws = mockWebSocket();
  const collab = joinCollab(ctx, ws as never);
  return { ctx, key, ws, collab };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal('fetch', fetchMock);
  fetchMock.mockReset();
  vi.clearAllMocks();
  storage.bases.clear();
  storage.logs.clear();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('a refused materialize keeps the edits', () => {
  it('must not lose edits via a materialize refused for access (403) at cleanup', async () => {
    const { ctx, key, ws } = await sessionWithEdits();
    fetchMock.mockResolvedValue({ ok: false, status: 403 });

    leaveCollab(ctx, ws as never);
    await vi.advanceTimersByTimeAsync(GRACE);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(storage.deleteDoc).not.toHaveBeenCalled();
    expect(readMap(storage.bases.get(key)!)).toEqual({ seed: true });
    expect(storage.logs.get(key)).toHaveLength(2);
    expect(getCollab(ctx)).toBeDefined();

    // Positive control: once the backend accepts, the edits are written and the session ends.
    fetchMock.mockResolvedValue({ ok: true, status: 200 });
    await vi.advanceTimersByTimeAsync(GRACE);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(storage.deleteDoc).toHaveBeenCalledTimes(1);
    expect(getCollab(ctx)).toBeUndefined();
  });

  it('must not lose edits when the last compaction did not write', async () => {
    const { ctx, key, ws, collab } = await sessionWithEdits();
    // A refusal no retry can fix: the window is not written, and nothing folds into the base.
    fetchMock.mockResolvedValue({ ok: false, status: 400 });
    expect(await runCompaction(collab)).toBe('permanent');
    expect(readMap(storage.bases.get(key)!)).toEqual({ seed: true });
    expect(storage.logs.get(key)).toHaveLength(2);

    leaveCollab(ctx, ws as never);
    await vi.advanceTimersByTimeAsync(GRACE);
    expect(storage.deleteDoc).not.toHaveBeenCalled();
    expect(storage.logs.get(key)).toHaveLength(2);

    // The rows wait for the next session or the startup sweep; cleanup does not retry in a loop.
    expect(getCollab(ctx)).toBeUndefined();
    await vi.advanceTimersByTimeAsync(GRACE);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('must not lose an orphaned session via a refused materialize in the startup sweep', async () => {
    const { ctx, key, ws } = await sessionWithEdits();
    const collab = getCollab(ctx);
    leaveCollab(ctx, ws as never);
    // The relay crashed before cleanup: only the rows remain.
    if (collab?.cleanupTimer) clearTimeout(collab.cleanupTimer);
    storage.listStaleDocs.mockResolvedValueOnce([
      { entityType: ctx.entityType, entityId: `${ctx.entityId}-orphan`, tenantId: ctx.tenantId, organizationId: null },
    ]);
    const orphanKey = `${key}-orphan`;
    storage.bases.set(orphanKey, storage.bases.get(key)!);
    storage.logs.set(orphanKey, storage.logs.get(key)!);
    fetchMock.mockResolvedValue({ ok: false, status: 404 });

    await runStartupSweep();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(storage.deleteDoc).not.toHaveBeenCalled();
    expect(storage.logs.get(orphanKey)).toHaveLength(2);
  });
});
