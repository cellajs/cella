import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeStorage, mapUpdate, mockScope, readMap, storageKey, undecodableUpdate } from './helpers';

const storage = fakeStorage();
vi.mock('../data/storage', () => storage);
// A cap of three server rows per request stands for the backend's ten thousand.
vi.mock('../constants', async (importOriginal) => ({ ...(await importOriginal<typeof import('../constants')>()), YJS_MAX_SERVER_ROW_IDS: 3 }));
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
  storage.generations.clear();
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
    await storage.appendUpdate(scope, null, mapUpdate('server', 3));
    const server = storage.logs.get(key)!.at(-1)!;

    expect(await compactDocument(scope)).toBe('ok');

    expect(stateToBlocksJson).toHaveBeenCalledTimes(1);
    // Every sender of the window, newest first: the backend credits the first who may still update the entity. The
    // server-origin row credits no one, and is named so the backend can tell the merge holds it.
    expect(postMaterialize).toHaveBeenCalledWith(scope, ['user-b', 'user-a'], '[{"type":"paragraph"}]', [server.id]);
    expect(readMap(storage.bases.get(key)!)).toEqual({ seed: true, a: 1, b: 2, server: 3 });
    expect(storage.logs.get(key)).toHaveLength(0);
  });

  it('must not let one logged row that will not merge block the document: it is discarded and the rest is written', async () => {
    await storage.appendUpdate(scope, 'user-a', mapUpdate('a', 1));
    await storage.appendUpdate(scope, 'user-x', undecodableUpdate);
    await storage.appendUpdate(scope, 'user-b', mapUpdate('b', 2));

    expect(await compactDocument(scope)).toBe('ok');
    // The row's sender wrote nothing, so it is not credited.
    expect(postMaterialize).toHaveBeenCalledWith(scope, ['user-b', 'user-a'], '[{"type":"paragraph"}]', []);
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

  it('folds a window of server rows alone without posting it: the entity row holds the last outside write already', async () => {
    await storage.appendUpdate(scope, null, mapUpdate('a', 1));
    await storage.appendUpdate(scope, null, mapUpdate('b', 2));

    expect(await compactDocument(scope)).toBe('ok');

    expect(postMaterialize).not.toHaveBeenCalled();
    expect(stateToBlocksJson).not.toHaveBeenCalled();
    expect(readMap(storage.bases.get(key)!)).toEqual({ seed: true, a: 1, b: 2 });
    expect(storage.logs.get(key)).toHaveLength(0);
  });

  it('must not lose an outside write committed during the POST: the 409 is a retry, and the next window names its row', async () => {
    await storage.appendUpdate(scope, 'user-1', mapUpdate('typed', 1));
    let outside = 0;
    vi.mocked(postMaterialize).mockImplementationOnce(async () => {
      const appended = await storage.appendUpdate(scope, null, mapUpdate('outside', 2));
      if (appended.status === 'appended') outside = appended.id;
      // The backend finds a server row the window lacks.
      return 'retry';
    });

    expect(await compactDocument(scope)).toBe('retry');
    expect(storage.compactState).not.toHaveBeenCalled();
    expect(readMap(storage.bases.get(key)!)).toEqual({ seed: true });

    expect(await compactDocument(scope)).toBe('ok');
    expect(vi.mocked(postMaterialize).mock.calls[1][3]).toEqual([outside]);
    expect(readMap(storage.bases.get(key)!)).toEqual({ seed: true, typed: 1, outside: 2 });
    expect(storage.logs.get(key)).toHaveLength(0);
  });

  it('must not name more server rows than the backend takes: the oldest fold alone first, and the rest are posted', async () => {
    await storage.appendUpdate(scope, 'user-1', mapUpdate('typed', 0));
    for (let i = 1; i <= 5; i++) await storage.appendUpdate(scope, null, mapUpdate(`outside${i}`, i));
    const serverIds = storage.logs
      .get(key)!
      .filter((row) => row.userId === null)
      .map((row) => row.id);

    expect(await compactDocument(scope)).toBe('ok');

    // Three folded unsaved, then one request for the client's row and the two server rows left.
    expect(storage.compactState).toHaveBeenCalledTimes(2);
    expect(storage.compactState.mock.calls[0][2]).toEqual(serverIds.slice(0, 3));
    expect(postMaterialize).toHaveBeenCalledTimes(1);
    expect(vi.mocked(postMaterialize).mock.calls[0][3]).toEqual(serverIds.slice(3));
    expect(readMap(storage.bases.get(key)!)).toEqual({ seed: true, typed: 0, outside1: 1, outside2: 2, outside3: 3, outside4: 4, outside5: 5 });
    expect(storage.logs.get(key)).toHaveLength(0);
  });

  it('must not write a merge whose rows another compaction folded meanwhile: rolled back, it is a retry', async () => {
    await storage.appendUpdate(scope, 'user-1', mapUpdate('a', 1));
    vi.mocked(postMaterialize).mockImplementationOnce(async () => {
      // A second relay, during a rollout, folds the same rows into a newer base.
      storage.bases.set(key, mapUpdate('newer', true));
      storage.logs.set(key, []);
      return 'ok';
    });

    expect(await compactDocument(scope)).toBe('retry');
    expect(readMap(storage.bases.get(key)!)).toEqual({ newer: true });
  });

  it('must not write a document retired under the session: nothing is posted or folded', async () => {
    // The entity was deleted: its retirement took the document row and its log.
    storage.bases.delete(key);
    expect(await compactDocument(scope, 'gen-0')).toBe('retired');
    expect(postMaterialize).not.toHaveBeenCalled();
    expect(storage.compactState).not.toHaveBeenCalled();

    // Positive control: under its document row, a log is written.
    storage.bases.set(key, mapUpdate('seed', true));
    await storage.appendUpdate(scope, 'user-1', mapUpdate('a', 1));
    expect(await compactDocument(scope, 'gen-0')).toBe('ok');
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
      // The document is retired and reseeded, under a new generation, before this window's base is written.
      await storage.deleteDoc(scope);
      storage.bases.set(key, reseed);
      storage.generations.set(key, 'gen-reseeded');
      return 'ok';
    });

    expect(await compactDocument(scope, 'gen-0')).toBe('retired');
    expect(readMap(storage.bases.get(key)!)).toEqual({ reseeded: true });
  });
});
