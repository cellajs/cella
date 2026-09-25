import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeStorage, mapUpdate, mockScope, readMap, storageKey } from './helpers';

const storage = fakeStorage();
vi.mock('../data/storage', () => storage);
vi.mock('../sync/materialize', () => ({
  postMaterialize: vi.fn().mockResolvedValue('ok'),
  stateToBlocksJson: vi.fn(() => '[{"type":"paragraph"}]'),
}));

const { compactDocument } = await import('../sync/compaction');
const { postMaterialize, stateToBlocksJson } = await import('../sync/materialize');

const scope = mockScope();
const key = storageKey(scope);

beforeEach(() => {
  vi.clearAllMocks();
  storage.bases.clear();
  storage.logs.clear();
});

describe('compactDocument', () => {
  it('returns empty and writes nothing when the log has no rows', async () => {
    storage.bases.set(key, mapUpdate('seed', true));
    expect(await compactDocument(scope)).toBe('empty');
    expect(postMaterialize).not.toHaveBeenCalled();
    expect(storage.compactState).not.toHaveBeenCalled();
  });

  it('merges base and log, posts the blocks JSON for the last editor, then replaces the base and deletes the rows', async () => {
    storage.bases.set(key, mapUpdate('seed', true));
    await storage.appendUpdate(scope, 'user-a', mapUpdate('a', 1));
    await storage.appendUpdate(scope, 'user-b', mapUpdate('b', 2));
    await storage.appendUpdate(scope, '', mapUpdate('server', 3));

    expect(await compactDocument(scope)).toBe('ok');

    expect(stateToBlocksJson).toHaveBeenCalledTimes(1);
    expect(postMaterialize).toHaveBeenCalledWith(scope, 'user-b', '[{"type":"paragraph"}]');
    expect(readMap(storage.bases.get(key)!)).toEqual({ seed: true, a: 1, b: 2, server: 3 });
    expect(storage.logs.get(key)).toHaveLength(0);
  });

  it('must not credit anyone but a sender in the log: a window without one is kept, never posted', async () => {
    await storage.appendUpdate(scope, '', mapUpdate('a', 1));
    expect(await compactDocument(scope)).toBe('permanent');
    expect(postMaterialize).not.toHaveBeenCalled();
    expect(storage.logs.get(key)).toHaveLength(1);
  });

  it('retry leaves the base and the log untouched', async () => {
    await storage.appendUpdate(scope, 'user-1', mapUpdate('a', 1));
    vi.mocked(postMaterialize).mockResolvedValueOnce('retry');
    expect(await compactDocument(scope)).toBe('retry');
    expect(storage.compactState).not.toHaveBeenCalled();
    expect(storage.logs.get(key)).toHaveLength(1);
  });

  it('permanent leaves the base and the log untouched, so the base only holds written state', async () => {
    storage.bases.set(key, mapUpdate('seed', true));
    await storage.appendUpdate(scope, 'user-1', mapUpdate('a', 1));
    vi.mocked(postMaterialize).mockResolvedValueOnce('permanent');
    expect(await compactDocument(scope)).toBe('permanent');
    expect(storage.compactState).not.toHaveBeenCalled();
    expect(storage.logs.get(key)).toHaveLength(1);
    expect(readMap(storage.bases.get(key)!)).toEqual({ seed: true });
  });

  it('unparseable state is never posted and keeps the log', async () => {
    await storage.appendUpdate(scope, 'user-1', mapUpdate('a', 1));
    vi.mocked(stateToBlocksJson).mockReturnValueOnce(null);
    expect(await compactDocument(scope)).toBe('permanent');
    expect(postMaterialize).not.toHaveBeenCalled();
    expect(storage.compactState).not.toHaveBeenCalled();
    expect(storage.logs.get(key)).toHaveLength(1);
  });

  it('deletes only the rows it read, so a concurrent append survives', async () => {
    await storage.appendUpdate(scope, 'user-1', mapUpdate('a', 1));
    vi.mocked(postMaterialize).mockImplementationOnce(async () => {
      await storage.appendUpdate(scope, 'user-1', mapUpdate('late', true));
      return 'ok';
    });
    expect(await compactDocument(scope)).toBe('ok');
    const rows = storage.logs.get(key)!;
    expect(rows).toHaveLength(1);
    expect(readMap(rows[0].payload)).toEqual({ late: true });
  });
});
