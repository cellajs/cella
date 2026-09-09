import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as Y from 'yjs';
import type { DocContext } from '../constants';
import {
  buildAwarenessMessage,
  buildSyncStep1,
  buildSyncUpdate,
  decodeSyncStep1,
  decodeSyncStep2,
  deferred,
  fakeStorage,
  flushMicrotasks,
  mapUpdate,
  mockDocContext,
  mockWebSocket,
  readMap,
} from './helpers';

// Real append/read/compact semantics in memory, with per-call gates so tests can interleave.
const gates = new Map<string, Promise<void>>();
const storage = fakeStorage((call) => gates.get(call));
vi.mock('../data/storage', () => storage);

// No entity description by default: individual tests override to exercise seeding, and the pg pool in data/db stays uninstantiated.
vi.mock('../data/entity-content', () => ({
  loadEntityDescription: vi.fn().mockResolvedValue(null),
}));

vi.mock('../sync/materialize', () => ({
  postMaterialize: vi.fn().mockResolvedValue('ok'),
  stateToBlocksJson: vi.fn(() => '[]'),
}));

const { handleMessage, runCompaction } = await import('../sync/relay');
const { loadEntityDescription } = await import('../data/entity-content');
const { postMaterialize, stateToBlocksJson } = await import('../sync/materialize');
const { yUpdateToBlocks } = await import('../lib/blocknote-seed');
const { getCollab, joinCollab, leaveCollab } = await import('../sync/session-manager');

const unverifiedCtx = mockDocContext();
const ctx = mockDocContext({ verified: true });

/** Decodes the frames a socket received: [Step2 update, Step1 state vector, ...]. */
function decodeFrames(sent: Uint8Array[]) {
  return sent.map((frame) => ({ sync: frame[1], payload: frame.subarray(3) }));
}

let counter = 0;
/** A session for a fresh document so the module-level session map never leaks between tests. */
function session(overrides: Partial<ReturnType<typeof mockDocContext>> = {}) {
  const c = mockDocContext({ verified: true, entityId: `entity-${++counter}`, ...overrides });
  const ws = mockWebSocket();
  joinCollab(c, ws as never);
  return { ctx: c, ws, collab: getCollab(c.entityType, c.entityId)! };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  gates.clear();
  storage.bases.clear();
  storage.logs.clear();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('handleMessage: gating and validation', () => {
  it('drops sync frames from an unverified context (the socket queue holds them until verification)', async () => {
    const ws = mockWebSocket();
    await handleMessage(unverifiedCtx, ws as never, buildSyncStep1(Y.encodeStateVector(new Y.Doc())));
    await handleMessage(unverifiedCtx, ws as never, buildSyncUpdate(mapUpdate('k', 1)));
    expect(ws.sent).toHaveLength(0);
    expect(storage.appendUpdate).not.toHaveBeenCalled();
  });

  it('messages < 2 bytes and unknown message types are silently dropped', async () => {
    const ws = mockWebSocket();
    await handleMessage(ctx, ws as never, new Uint8Array([0]));
    await handleMessage(ctx, ws as never, new Uint8Array([9, 0, 0]));
    expect(ws.sent).toHaveLength(0);
    expect(storage.appendUpdate).not.toHaveBeenCalled();
  });
});

describe('handleMessage: sync step 1', () => {
  it('first connection without entity content: seeds an empty doc and answers with an empty Step2 plus a Step1', async () => {
    const { ctx: c, ws } = session();
    await handleMessage(c, ws as never, buildSyncStep1(Y.encodeStateVector(new Y.Doc())));

    expect(storage.ensureDoc).toHaveBeenCalledWith(c, null);
    const frames = decodeFrames(ws.sent);
    expect(frames.map((f) => f.sync)).toEqual([1, 0]);
    expect(readMap(decodeSyncStep2(ws.sent[0]))).toEqual({});
  });

  it('first connection with entity content: seeds the doc server-side from the stored description', async () => {
    const description = JSON.stringify([
      { id: 'b1', type: 'paragraph', props: {}, content: [{ type: 'text', text: 'seeded', styles: {} }], children: [] },
    ]);
    vi.mocked(loadEntityDescription).mockResolvedValueOnce(description);
    const { ctx: c, ws } = session();

    await handleMessage(c, ws as never, buildSyncStep1(Y.encodeStateVector(new Y.Doc())));

    const seed = storage.ensureDoc.mock.calls[0][1] as Uint8Array;
    expect(seed).not.toBeNull();
    const blocks = yUpdateToBlocks(decodeSyncStep2(ws.sent[0])) as { content: { text: string }[] }[];
    expect(blocks[0].content[0].text).toBe('seeded');
    // Seeding writes nothing to the log, so a session that only opened the document never materializes.
    expect(storage.appendUpdate).not.toHaveBeenCalled();
  });

  it('concurrent Step1s from two sockets seed once, through the document lock', async () => {
    const gate = deferred();
    gates.set('ensureDoc', gate.promise);
    const { ctx: c, ws: ws1, collab } = session();
    const ws2 = mockWebSocket();
    joinCollab(c, ws2 as never);

    const first = handleMessage(c, ws1 as never, buildSyncStep1(Y.encodeStateVector(new Y.Doc())));
    const second = handleMessage(c, ws2 as never, buildSyncStep1(Y.encodeStateVector(new Y.Doc())));
    await flushMicrotasks();
    expect(storage.ensureDoc).toHaveBeenCalledTimes(1);
    gate.release();
    await Promise.all([first, second]);

    // The second Step1 saw the row the first one created.
    expect(storage.ensureDoc).toHaveBeenCalledTimes(1);
    expect(storage.loadBase).toHaveBeenCalledTimes(2);
    expect(ws1.sent).toHaveLength(2);
    expect(ws2.sent).toHaveLength(2);
    leaveCollab(collab.ctx.entityType, collab.ctx.entityId, ws2 as never);
  });

  it('existing base plus log: answers with the diff of the merged document and asks for the rest', async () => {
    const { ctx: c, ws } = session();
    storage.bases.set(`${c.entityType}:${c.entityId}`, mapUpdate('base', true));
    await storage.appendUpdate(c, mapUpdate('logged', 1));

    const client = new Y.Doc();
    client.getMap('data').set('mine', 'x');
    await handleMessage(c, ws as never, buildSyncStep1(Y.encodeStateVector(client)));

    expect(storage.ensureDoc).not.toHaveBeenCalled();
    Y.applyUpdate(client, decodeSyncStep2(ws.sent[0]));
    expect(client.getMap('data').toJSON()).toEqual({ base: true, logged: 1, mine: 'x' });
    // The Step1 carries the merged state vector, so the client's reply would contain only `mine`.
    expect(decodeFrames(ws.sent)[1].sync).toBe(0);
    const serverVector = Y.decodeStateVector(decodeSyncStep1(ws.sent[1]));
    expect(serverVector.size).toBe(2);
  });

  it('corrupted stored state: falls back to sending the full state without a pull', async () => {
    const { ctx: c, ws } = session();
    storage.bases.set(`${c.entityType}:${c.entityId}`, new Uint8Array([1, 2, 3]));
    await handleMessage(c, ws as never, buildSyncStep1(Y.encodeStateVector(new Y.Doc())));
    expect(ws.sent).toHaveLength(1);
    expect(decodeSyncStep2(ws.sent[0])).toEqual(new Uint8Array([1, 2, 3]));
  });
});

describe('handleMessage: sync update', () => {
  it('appends the update to the log before broadcasting it to peers', async () => {
    const { ctx: c, ws, collab } = session();
    const peer = mockWebSocket();
    joinCollab(c, peer as never);
    const gate = deferred();
    gates.set('appendUpdate', gate.promise);

    const raw = buildSyncUpdate(mapUpdate('k', 1));
    const done = handleMessage(c, ws as never, raw);
    await flushMicrotasks();
    expect(peer.sent).toHaveLength(0);
    gate.release();
    await done;

    expect(storage.logs.get(`${c.entityType}:${c.entityId}`)).toHaveLength(1);
    expect(peer.sent[0]).toEqual(raw);
    expect(ws.sent).toHaveLength(0);
    leaveCollab(collab.ctx.entityType, collab.ctx.entityId, peer as never);
  });

  it('accepts a client Step2 as an update and skips an empty one', async () => {
    const { ctx: c, ws } = session();
    const empty = Y.encodeStateAsUpdate(new Y.Doc());
    const step2 = new Uint8Array([0, 1, ...encodeVarUint8Array(empty)]);
    await handleMessage(c, ws as never, step2);
    expect(storage.appendUpdate).not.toHaveBeenCalled();

    const full = new Uint8Array([0, 1, ...encodeVarUint8Array(mapUpdate('k', 1))]);
    await handleMessage(c, ws as never, full);
    expect(storage.appendUpdate).toHaveBeenCalledTimes(1);
  });

  it('a burst of dependent updates dispatched without awaiting all reach the log, and one compaction merges them', async () => {
    const { ctx: c, ws, collab } = session();
    // The first append is slow; the others overtake it.
    const gate = deferred();
    let slowed = false;
    gates.set('appendUpdate', gate.promise);
    storage.appendUpdate.mockImplementationOnce(async (_ctx: DocContext, payload: Uint8Array) => {
      slowed = true;
      await gate.promise;
      gates.delete('appendUpdate');
      const list = storage.logs.get(`${c.entityType}:${c.entityId}`) ?? [];
      list.push({ id: 1000, payload, userId: c.userId });
      storage.logs.set(`${c.entityType}:${c.entityId}`, list);
    });

    const doc = new Y.Doc();
    const updates: Uint8Array[] = [];
    doc.on('update', (u: Uint8Array) => updates.push(u));
    doc.getText('t').insert(0, 'c');
    doc.getText('t').insert(0, 'b');
    doc.getText('t').insert(0, 'a');

    const dispatched = updates.map((u) => handleMessage(c, ws as never, buildSyncUpdate(u)));
    await flushMicrotasks();
    expect(slowed).toBe(true);
    gate.release();
    await Promise.all(dispatched);

    expect(storage.logs.get(`${c.entityType}:${c.entityId}`)).toHaveLength(3);
    await vi.advanceTimersByTimeAsync(3000);
    expect(storage.compactState).toHaveBeenCalledTimes(1);
    const merged = storage.bases.get(`${c.entityType}:${c.entityId}`)!;
    const verify = new Y.Doc();
    Y.applyUpdate(verify, merged);
    expect(verify.getText('t').toString()).toBe('abc');
    expect(collab.compactTimer).toBeUndefined();
  });
});

describe('handleMessage: awareness', () => {
  it('is broadcast to peers, allowed before verification, and rate limited per client', async () => {
    const { ctx: c, ws, collab } = session({ verified: false });
    const peer = mockWebSocket();
    joinCollab(c, peer as never);

    await handleMessage(c, ws as never, buildAwarenessMessage(new Uint8Array([1])));
    await handleMessage(c, ws as never, buildAwarenessMessage(new Uint8Array([2])));
    expect(peer.sent).toHaveLength(1);

    const other = mockWebSocket();
    joinCollab(c, other as never);
    await handleMessage(c, other as never, buildAwarenessMessage(new Uint8Array([3])));
    expect(peer.sent).toHaveLength(2);

    vi.advanceTimersByTime(600);
    await handleMessage(c, ws as never, buildAwarenessMessage(new Uint8Array([4])));
    expect(peer.sent).toHaveLength(3);
    leaveCollab(collab.ctx.entityType, collab.ctx.entityId, peer as never);
    leaveCollab(collab.ctx.entityType, collab.ctx.entityId, other as never);
  });
});

describe('compaction', () => {
  it('runs once after the debounce, credits the last editor, and deletes exactly the rows it read', async () => {
    const { ctx: c, ws, collab } = session();
    const editor2 = mockDocContext({ verified: true, entityId: c.entityId, userId: 'user-2' });
    await handleMessage(c, ws as never, buildSyncUpdate(mapUpdate('a', 1)));
    vi.advanceTimersByTime(2000);
    await handleMessage(editor2, ws as never, buildSyncUpdate(mapUpdate('b', 2)));
    vi.advanceTimersByTime(2000);
    expect(postMaterialize).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1000);

    expect(postMaterialize).toHaveBeenCalledTimes(1);
    expect(postMaterialize).toHaveBeenCalledWith(collab.ctx, 'user-2', '[]');
    const [, merged, ids] = storage.compactState.mock.calls[0] as [never, Uint8Array, number[]];
    expect(readMap(merged)).toEqual({ a: 1, b: 2 });
    expect(ids).toHaveLength(2);
    expect(storage.logs.get(`${c.entityType}:${c.entityId}`)).toHaveLength(0);
  });

  it('an update appended during an in-flight materialize survives compaction', async () => {
    const { ctx: c, ws, collab } = session();
    await handleMessage(c, ws as never, buildSyncUpdate(mapUpdate('a', 1)));

    const gate = deferred();
    vi.mocked(postMaterialize).mockImplementationOnce(async () => {
      await gate.promise;
      return 'ok';
    });
    const compaction = runCompaction(collab);
    await flushMicrotasks();
    await handleMessage(c, ws as never, buildSyncUpdate(mapUpdate('late', true)));
    gate.release();
    expect(await compaction).toBe('ok');

    const remaining = storage.logs.get(`${c.entityType}:${c.entityId}`)!;
    expect(remaining).toHaveLength(1);
    expect(readMap(remaining[0].payload)).toEqual({ late: true });
    expect(readMap(storage.bases.get(`${c.entityType}:${c.entityId}`)!)).toEqual({ a: 1 });
  });

  it('retry keeps the log for the next window; permanent and unparseable compact without a re-post', async () => {
    const { ctx: c, ws, collab } = session();
    await handleMessage(c, ws as never, buildSyncUpdate(mapUpdate('a', 1)));

    vi.mocked(postMaterialize).mockResolvedValueOnce('retry');
    expect(await runCompaction(collab)).toBe('retry');
    expect(storage.compactState).not.toHaveBeenCalled();
    expect(storage.logs.get(`${c.entityType}:${c.entityId}`)).toHaveLength(1);

    vi.mocked(postMaterialize).mockResolvedValueOnce('permanent');
    expect(await runCompaction(collab)).toBe('permanent');
    expect(storage.compactState).toHaveBeenCalledTimes(1);
    expect(storage.logs.get(`${c.entityType}:${c.entityId}`)).toHaveLength(0);

    await handleMessage(c, ws as never, buildSyncUpdate(mapUpdate('b', 2)));
    vi.mocked(stateToBlocksJson).mockReturnValueOnce(null);
    expect(await runCompaction(collab)).toBe('permanent');
    expect(postMaterialize).toHaveBeenCalledTimes(2);
    expect(storage.compactState).toHaveBeenCalledTimes(2);
  });

  it('nothing logged means nothing written, and a thrown storage error counts as retry', async () => {
    const { collab } = session();
    expect(await runCompaction(collab)).toBe('empty');
    expect(postMaterialize).not.toHaveBeenCalled();

    storage.readLog.mockRejectedValueOnce(new Error('db down'));
    expect(await runCompaction(collab)).toBe('retry');
  });
});

/** lib0 varUint8Array framing for a raw Step2/Update payload. */
function encodeVarUint8Array(payload: Uint8Array): number[] {
  const len: number[] = [];
  let n = payload.length;
  while (n >= 0x80) {
    len.push((n & 0x7f) | 0x80);
    n >>>= 7;
  }
  len.push(n);
  return [...len, ...payload];
}
