import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeStorage, mapUpdate, mockScope, readMap, storageKey, undecodableUpdate } from './helpers';

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
  // The session row a handshake seeded: every window extends it.
  storage.bases.set(key, mapUpdate('seed', true));
});

describe('compactDocument', () => {
  it('returns empty and writes nothing when the log has no rows', async () => {
    expect(await compactDocument(scope)).toBe('empty');
    expect(postMaterialize).not.toHaveBeenCalled();
    expect(storage.compactState).not.toHaveBeenCalled();
  });

  it('merges base and log, posts the blocks JSON for the last editor, then replaces the base and deletes the rows', async () => {
    await storage.appendUpdate(scope, 'user-a', mapUpdate('a', 1));
    await storage.appendUpdate(scope, 'user-b', mapUpdate('b', 2));
    await storage.appendUpdate(scope, '', mapUpdate('server', 3));

    expect(await compactDocument(scope)).toBe('ok');

    expect(stateToBlocksJson).toHaveBeenCalledTimes(1);
    // Every sender of the window, newest first: the backend credits the first who may still update the entity.
    expect(postMaterialize).toHaveBeenCalledWith(scope, ['user-b', 'user-a'], '[{"type":"paragraph"}]');
    expect(readMap(storage.bases.get(key)!)).toEqual({ seed: true, a: 1, b: 2, server: 3 });
    expect(storage.logs.get(key)).toHaveLength(0);
  });

  it('must not let one logged row that will not merge block the document: it is discarded and the rest is written', async () => {
    await storage.appendUpdate(scope, 'user-a', mapUpdate('a', 1));
    await storage.appendUpdate(scope, 'user-x', undecodableUpdate);
    await storage.appendUpdate(scope, 'user-b', mapUpdate('b', 2));

    expect(await compactDocument(scope)).toBe('ok');
    // The row's sender wrote nothing, so it is not credited.
    expect(postMaterialize).toHaveBeenCalledWith(scope, ['user-b', 'user-a'], '[{"type":"paragraph"}]');
    expect(readMap(storage.bases.get(key)!)).toEqual({ seed: true, a: 1, b: 2 });
    expect(storage.logs.get(key)).toHaveLength(0);

    // Positive control: the next window compacts normally.
    await storage.appendUpdate(scope, 'user-a', mapUpdate('c', 3));
    expect(await compactDocument(scope)).toBe('ok');
    expect(readMap(storage.bases.get(key)!)).toEqual({ seed: true, a: 1, b: 2, c: 3 });
  });

  it('a window whose only rows will not merge writes nothing and keeps nothing', async () => {
    await storage.appendUpdate(scope, 'user-x', undecodableUpdate);
    expect(await compactDocument(scope)).toBe('empty');
    expect(postMaterialize).not.toHaveBeenCalled();
    expect(storage.logs.get(key)).toHaveLength(0);
    expect(readMap(storage.bases.get(key)!)).toEqual({ seed: true });
  });

  it('must not credit anyone but a sender in the log: a window without one is kept, never posted', async () => {
    await storage.appendUpdate(scope, '', mapUpdate('a', 1));
    expect(await compactDocument(scope)).toBe('permanent');
    expect(postMaterialize).not.toHaveBeenCalled();
    expect(storage.logs.get(key)).toHaveLength(1);
  });

  it('must not write or keep a log whose document row is gone: retired, it is discarded whole', async () => {
    // The document was retired (its description written outside the relay, or its entity deleted) and rows were
    // appended since: they extend a history the next seed does not share, and merged alone they are a partial document.
    storage.bases.delete(key);
    await storage.appendUpdate(scope, 'user-1', mapUpdate('a', 1));
    await storage.appendUpdate(scope, 'user-2', mapUpdate('b', 2));
    expect(await compactDocument(scope)).toBe('retired');
    expect(postMaterialize).not.toHaveBeenCalled();
    expect(storage.compactState).not.toHaveBeenCalled();
    expect(storage.logs.get(key)).toHaveLength(0);

    // Positive control: under its document row, the same log is written.
    storage.bases.set(key, mapUpdate('seed', true));
    await storage.appendUpdate(scope, 'user-1', mapUpdate('a', 1));
    expect(await compactDocument(scope)).toBe('ok');
    expect(readMap(storage.bases.get(key)!)).toEqual({ seed: true, a: 1 });
  });

  it('names at most twenty editors, the most recent', async () => {
    for (let i = 0; i < 25; i++) await storage.appendUpdate(scope, `user-${i}`, mapUpdate(`k${i}`, i));
    expect(await compactDocument(scope)).toBe('ok');
    const editors = vi.mocked(postMaterialize).mock.calls[0]?.[1];
    expect(editors).toHaveLength(20);
    expect(editors?.[0]).toBe('user-24');
    expect(editors?.at(-1)).toBe('user-5');
  });

  it('gone leaves the base and the log for the caller to delete, unfolded', async () => {
    await storage.appendUpdate(scope, 'user-1', mapUpdate('a', 1));
    vi.mocked(postMaterialize).mockResolvedValueOnce('gone');
    expect(await compactDocument(scope)).toBe('gone');
    expect(storage.compactState).not.toHaveBeenCalled();
  });

  it('retry leaves the base and the log untouched', async () => {
    await storage.appendUpdate(scope, 'user-1', mapUpdate('a', 1));
    vi.mocked(postMaterialize).mockResolvedValueOnce('retry');
    expect(await compactDocument(scope)).toBe('retry');
    expect(storage.compactState).not.toHaveBeenCalled();
    expect(storage.logs.get(key)).toHaveLength(1);
  });

  it('permanent leaves the base and the log untouched, so the base only holds written state', async () => {
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

  it("must not touch a document reseeded under another generation than the session's: its log is the new session's", async () => {
    await storage.appendUpdate(scope, 'user-1', mapUpdate('new session', 1));

    expect(await compactDocument(scope, 'gen-retired')).toBe('retired');
    expect(postMaterialize).not.toHaveBeenCalled();
    expect(readMap(storage.bases.get(key)!)).toEqual({ seed: true });
    expect(storage.logs.get(key)).toHaveLength(1);
  });

  it('must not write a merge over a document reseeded while its window was written: nothing of the new seed is touched', async () => {
    await storage.appendUpdate(scope, 'user-1', mapUpdate('old history', 1));
    const reseed = mapUpdate('reseeded', true);
    vi.mocked(postMaterialize).mockImplementationOnce(async () => {
      // An outside write retires the document and a handshake reseeds it before this window's base is written.
      await storage.deleteDoc(scope);
      await storage.ensureDoc(scope, reseed);
      return 'ok';
    });

    expect(await compactDocument(scope, 'gen-0')).toBe('retired');
    expect(readMap(storage.bases.get(key)!)).toEqual({ reseeded: true });
  });
});
