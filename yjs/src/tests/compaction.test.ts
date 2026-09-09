import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeStorage, mapUpdate, mockDocContext, readMap } from './helpers';

const storage = fakeStorage();
vi.mock('../data/storage', () => storage);
vi.mock('../sync/materialize', () => ({
  postMaterialize: vi.fn().mockResolvedValue('ok'),
  stateToBlocksJson: vi.fn(() => '[{"type":"paragraph"}]'),
}));

const { compactDocument } = await import('../sync/compaction');
const { postMaterialize, stateToBlocksJson } = await import('../sync/materialize');

const ctx = mockDocContext({ verified: true });
const key = `${ctx.entityType}:${ctx.entityId}`;

beforeEach(() => {
  vi.clearAllMocks();
  storage.bases.clear();
  storage.logs.clear();
});

describe('compactDocument', () => {
  it('returns empty and writes nothing when the log has no rows', async () => {
    storage.bases.set(key, mapUpdate('seed', true));
    expect(await compactDocument(ctx)).toBe('empty');
    expect(postMaterialize).not.toHaveBeenCalled();
    expect(storage.compactState).not.toHaveBeenCalled();
  });

  it('merges base and log, posts the blocks JSON for the last editor, then replaces the base and deletes the rows', async () => {
    storage.bases.set(key, mapUpdate('seed', true));
    await storage.appendUpdate({ ...ctx, userId: 'user-a' }, mapUpdate('a', 1));
    await storage.appendUpdate({ ...ctx, userId: 'user-b' }, mapUpdate('b', 2));
    await storage.appendUpdate({ ...ctx, userId: '' }, mapUpdate('server', 3));

    expect(await compactDocument(ctx)).toBe('ok');

    expect(stateToBlocksJson).toHaveBeenCalledTimes(1);
    expect(postMaterialize).toHaveBeenCalledWith(ctx, 'user-b', '[{"type":"paragraph"}]');
    expect(readMap(storage.bases.get(key)!)).toEqual({ seed: true, a: 1, b: 2, server: 3 });
    expect(storage.logs.get(key)).toHaveLength(0);
  });

  it('falls back to the context user when no row carries an editor', async () => {
    await storage.appendUpdate({ ...ctx, userId: '' }, mapUpdate('a', 1));
    await compactDocument({ ...ctx, userId: 'sweeper' });
    expect(postMaterialize).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'sweeper' }),
      'sweeper',
      expect.any(String),
    );
  });

  it('retry leaves the base and the log untouched', async () => {
    await storage.appendUpdate(ctx, mapUpdate('a', 1));
    vi.mocked(postMaterialize).mockResolvedValueOnce('retry');
    expect(await compactDocument(ctx)).toBe('retry');
    expect(storage.compactState).not.toHaveBeenCalled();
    expect(storage.logs.get(key)).toHaveLength(1);
  });

  it('permanent compacts without a later re-post', async () => {
    await storage.appendUpdate(ctx, mapUpdate('a', 1));
    vi.mocked(postMaterialize).mockResolvedValueOnce('permanent');
    expect(await compactDocument(ctx)).toBe('permanent');
    expect(storage.logs.get(key)).toHaveLength(0);
    expect(await compactDocument(ctx)).toBe('empty');
    expect(postMaterialize).toHaveBeenCalledTimes(1);
  });

  it('unparseable state compacts into the base without a write, so cleanup is never blocked', async () => {
    await storage.appendUpdate(ctx, mapUpdate('a', 1));
    vi.mocked(stateToBlocksJson).mockReturnValueOnce(null);
    expect(await compactDocument(ctx)).toBe('permanent');
    expect(postMaterialize).not.toHaveBeenCalled();
    expect(storage.logs.get(key)).toHaveLength(0);
    expect(readMap(storage.bases.get(key)!)).toEqual({ a: 1 });
  });

  it('deletes only the rows it read, so a concurrent append survives', async () => {
    await storage.appendUpdate(ctx, mapUpdate('a', 1));
    vi.mocked(postMaterialize).mockImplementationOnce(async () => {
      await storage.appendUpdate(ctx, mapUpdate('late', true));
      return 'ok';
    });
    expect(await compactDocument(ctx)).toBe('ok');
    const rows = storage.logs.get(key)!;
    expect(rows).toHaveLength(1);
    expect(readMap(rows[0].payload)).toEqual({ late: true });
  });
});
