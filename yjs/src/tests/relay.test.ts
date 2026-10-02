import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as Y from 'yjs';
import type { DocScope } from '../constants';
import {
  awarenessClientIds,
  awarenessUpdate,
  buildAwarenessMessage,
  buildSyncStep1,
  buildSyncStep2,
  buildSyncUpdate,
  decodeGeneration,
  decodeSyncStep1,
  decodeSyncStep2,
  deferred,
  fakeStorage,
  flushMicrotasks,
  mapUpdate,
  mockScope,
  mockSocketContext,
  mockWebSocket,
  readMap,
  storageKey,
  undecodableUpdate,
} from './helpers';

// Real append/read/compact semantics in memory, with per-call gates so tests can interleave.
const gates = new Map<string, Promise<void>>();
const storage = fakeStorage((call) => gates.get(call));
vi.mock('../data/storage', () => storage);

// No entity description by default: individual tests override to exercise seeding, and the pg pool in data/db stays uninstantiated.
vi.mock('../data/entity-content', () => ({ loadEntityDescription: vi.fn().mockResolvedValue(null) }));

vi.mock('../sync/materialize', () => ({ postMaterialize: vi.fn().mockResolvedValue('ok'), stateToBlocksJson: vi.fn(() => '[]') }));

const { handleMessage, peekMessageType, runCompaction } = await import('../sync/relay');
const { loadEntityDescription } = await import('../data/entity-content');
const { postMaterialize } = await import('../sync/materialize');
const { yUpdateToBlocks } = await import('../lib/blocknote-seed');
const { endCollab, getCollab, joinCollab, leaveCollab } = await import('../sync/session-manager');

const ctx = mockSocketContext();

/** Decodes the sync frames a socket received, after the generation frame: [Step2 update, Step1 state vector, ...]. */
function decodeFrames(sent: Uint8Array[]) {
  return sent.filter((frame) => frame[0] === 0).map((frame) => ({ sync: frame[1], payload: frame.subarray(3) }));
}

let counter = 0;
/** A session for a fresh document so the module-level session map never leaks between tests. */
function session(overrides: Partial<DocScope> = {}) {
  const scope = mockScope({ entityId: `entity-${++counter}`, ...overrides });
  const c = mockSocketContext({ requested: scope });
  const ws = mockWebSocket();
  joinCollab(scope, ws as never);
  return { ctx: c, scope, key: storageKey(scope), ws, collab: getCollab(scope)! };
}

/** A session whose row its socket's handshake seeded, from a null description: compaction writes only under one. */
function seededSession() {
  const opened = session();
  storage.bases.set(opened.key, new Uint8Array());
  return opened;
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
  it('must not answer, log or relay sync frames from a socket pending verification, even into a live session of its document', async () => {
    // The document is open with a peer in it: the pending socket's frames reach neither the log nor the peer.
    const { ctx: editor, scope, key, ws: editorWs, collab } = session();
    const peer = mockWebSocket();
    joinCollab(scope, peer as never);
    const pending = mockSocketContext({ requested: scope, scope: null });
    const ws = mockWebSocket();

    await handleMessage(pending, ws as never, buildSyncStep1(Y.encodeStateVector(new Y.Doc())));
    await handleMessage(pending, ws as never, buildSyncUpdate(mapUpdate('k', 1)));

    expect(ws.sent).toHaveLength(0);
    expect(storage.logs.get(key)).toBeUndefined();
    expect(peer.sent).toHaveLength(0);
    // Positive control: the same update from a verified socket of the session is logged and reaches the peer.
    await handleMessage(editor, editorWs as never, buildSyncUpdate(mapUpdate('k', 1)));
    expect(storage.logs.get(key)).toHaveLength(1);
    expect(peer.sent).toHaveLength(1);
    leaveCollab(collab.scope, peer as never);
  });

  it('messages < 2 bytes and unknown message types are silently dropped', async () => {
    const ws = mockWebSocket();
    await handleMessage(ctx, ws as never, new Uint8Array([0]));
    await handleMessage(ctx, ws as never, new Uint8Array([9, 0, 0]));
    expect(ws.sent).toHaveLength(0);
    expect(storage.appendUpdate).not.toHaveBeenCalled();
  });

  it('must not throw on a frame whose message type is cut short, and closes its sender with 4400', async () => {
    const { ctx: c, scope, key, ws, collab } = session();
    const peer = mockWebSocket();
    joinCollab(scope, peer as never);
    // Two continuation bytes: a varint that never ends.
    const frame = new Uint8Array([0x80, 0x80]);

    expect(peekMessageType(frame)).toBeNull();
    await expect(handleMessage(c, ws as never, frame)).resolves.toBeUndefined();
    expect(ws.closed).toEqual({ code: 4400, reason: 'Malformed frame' });
    expect(peer.sent).toHaveLength(0);

    // Positive control: a well-formed frame reads its type and applies.
    const update = buildSyncUpdate(mapUpdate('k', 1));
    expect(peekMessageType(update)).toBe(0);
    await handleMessage(c, peer as never, update);
    expect(storage.logs.get(key)).toHaveLength(1);
    leaveCollab(collab.scope, peer as never);
  });
});

describe('handleMessage: sync step 1', () => {
  it('first connection without entity content: seeds an empty doc and answers with an empty Step2 plus a Step1', async () => {
    const { ctx: c, scope, ws } = session();
    await handleMessage(c, ws as never, buildSyncStep1(Y.encodeStateVector(new Y.Doc())));

    expect(storage.ensureDoc).toHaveBeenCalledWith(scope, null);
    // The generation comes first, so a client of another one drops its document before it merges the state.
    expect(decodeGeneration(ws.sent[0])).toBe(storage.generations.get(storageKey(scope)));
    const frames = decodeFrames(ws.sent);
    expect(frames.map((f) => f.sync)).toEqual([1, 0]);
    expect(readMap(decodeSyncStep2(ws.sent[1]))).toEqual({});
  });

  it('announces the same generation at every handshake of a document, and a new one once it was retired and reseeded', async () => {
    const { ctx: c, scope, key, ws } = session();
    await handleMessage(c, ws as never, buildSyncStep1(Y.encodeStateVector(new Y.Doc())));
    await handleMessage(c, ws as never, buildSyncStep1(Y.encodeStateVector(new Y.Doc())));
    const [first, , , second] = ws.sent.map(decodeGeneration);
    expect(first).toBe(second);

    // Retired: the next handshake ends the session, and the reconnect's fresh session seeds a new generation.
    storage.bases.delete(key);
    storage.generations.delete(key);
    await handleMessage(c, ws as never, buildSyncStep1(Y.encodeStateVector(new Y.Doc())));
    expect(ws.closed?.code).toBe(1013);
    const next = session({ entityId: scope.entityId });
    await handleMessage(next.ctx, next.ws as never, buildSyncStep1(Y.encodeStateVector(new Y.Doc())));
    expect(decodeGeneration(next.ws.sent[0])).not.toBe(first);
    expect(storage.ensureDoc).toHaveBeenCalledTimes(2);
  });

  it('must not seed a new generation under a session that loaded another: the session ends with 1013 and a fresh one reseeds', async () => {
    const { ctx: c, scope, key, ws, collab } = session();
    const peer = mockWebSocket();
    joinCollab(scope, peer as never);
    await handleMessage(c, ws as never, buildSyncStep1(Y.encodeStateVector(new Y.Doc())));
    expect(collab.generation).toBe(storage.generations.get(key));

    // The description was written outside the relay, which retired the document; a socket handshakes before the
    // live stamp notices.
    storage.bases.delete(key);
    storage.generations.delete(key);
    await handleMessage(c, peer as never, buildSyncStep1(Y.encodeStateVector(new Y.Doc())));

    expect(storage.ensureDoc).toHaveBeenCalledTimes(1);
    expect(peer.sent).toHaveLength(0);
    expect(peer.closed).toEqual({ code: 1013, reason: 'Document retired' });
    expect(ws.closed).toEqual({ code: 1013, reason: 'Document retired' });
    expect(getCollab(scope)).toBeUndefined();

    // Positive control: the reconnect opens a fresh session, which seeds the document anew.
    const next = session({ entityId: scope.entityId });
    await handleMessage(next.ctx, next.ws as never, buildSyncStep1(Y.encodeStateVector(new Y.Doc())));
    expect(storage.ensureDoc).toHaveBeenCalledTimes(2);
    expect(decodeGeneration(next.ws.sent[0])).toBe(storage.generations.get(key));
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
    const blocks = yUpdateToBlocks(decodeSyncStep2(ws.sent[1])) as { content: { text: string }[] }[];
    expect(blocks[0].content[0].text).toBe('seeded');
    // Seeding writes nothing to the log, so a session that only opened the document never materializes.
    expect(storage.appendUpdate).not.toHaveBeenCalled();
  });

  it('concurrent Step1s from two sockets seed once, through the document lock', async () => {
    const gate = deferred();
    gates.set('ensureDoc', gate.promise);
    const { ctx: c, scope, ws: ws1, collab } = session();
    const ws2 = mockWebSocket();
    joinCollab(scope, ws2 as never);

    const first = handleMessage(c, ws1 as never, buildSyncStep1(Y.encodeStateVector(new Y.Doc())));
    const second = handleMessage(c, ws2 as never, buildSyncStep1(Y.encodeStateVector(new Y.Doc())));
    await flushMicrotasks();
    expect(storage.ensureDoc).toHaveBeenCalledTimes(1);
    gate.release();
    await Promise.all([first, second]);

    // The second Step1 saw the row the first one created.
    expect(storage.ensureDoc).toHaveBeenCalledTimes(1);
    expect(storage.loadBase).toHaveBeenCalledTimes(2);
    expect(ws1.sent).toHaveLength(3);
    expect(ws2.sent).toHaveLength(3);
    leaveCollab(collab.scope, ws2 as never);
  });

  it('existing base plus log: answers with the diff of the merged document and asks for the rest', async () => {
    const { ctx: c, scope, key, ws } = session();
    storage.bases.set(key, mapUpdate('base', true));
    await storage.appendUpdate(scope, 'user-1', mapUpdate('logged', 1));

    const client = new Y.Doc();
    client.getMap('data').set('mine', 'x');
    await handleMessage(c, ws as never, buildSyncStep1(Y.encodeStateVector(client)));

    expect(storage.ensureDoc).not.toHaveBeenCalled();
    Y.applyUpdate(client, decodeSyncStep2(ws.sent[1]));
    expect(client.getMap('data').toJSON()).toEqual({ base: true, logged: 1, mine: 'x' });
    // The Step1 carries the merged state vector, so the client's reply would contain only `mine`.
    expect(decodeFrames(ws.sent)[1].sync).toBe(0);
    const serverVector = Y.decodeStateVector(decodeSyncStep1(ws.sent[2]));
    expect(serverVector.size).toBe(2);
  });

  it('must not lose the document to a logged row that will not merge: a joining client still gets the rest', async () => {
    const { ctx: c, scope, key, ws } = session();
    storage.bases.set(key, mapUpdate('base', true));
    await storage.appendUpdate(scope, 'user-1', mapUpdate('logged', 1));
    await storage.appendUpdate(scope, 'user-x', undecodableUpdate);

    await expect(handleMessage(c, ws as never, buildSyncStep1(Y.encodeStateVector(new Y.Doc())))).resolves.toBeUndefined();
    expect(readMap(decodeSyncStep2(ws.sent[1]))).toEqual({ base: true, logged: 1 });
  });

  it('corrupted stored state: falls back to sending the full state without a pull', async () => {
    const { ctx: c, key, ws } = session();
    storage.bases.set(key, new Uint8Array([1, 2, 3]));
    await handleMessage(c, ws as never, buildSyncStep1(Y.encodeStateVector(new Y.Doc())));
    expect(ws.sent).toHaveLength(2);
    expect(decodeSyncStep2(ws.sent[1])).toEqual(new Uint8Array([1, 2, 3]));
  });
});

describe('handleMessage: sync update', () => {
  it('appends the update to the log before broadcasting it to peers', async () => {
    const { ctx: c, scope, key, ws, collab } = session();
    const peer = mockWebSocket();
    joinCollab(scope, peer as never);
    const gate = deferred();
    gates.set('appendUpdate', gate.promise);

    const raw = buildSyncUpdate(mapUpdate('k', 1));
    const done = handleMessage(c, ws as never, raw);
    await flushMicrotasks();
    expect(peer.sent).toHaveLength(0);
    gate.release();
    await done;

    expect(storage.logs.get(key)).toHaveLength(1);
    expect(storage.logs.get(key)?.[0].userId).toBe(c.userId);
    expect(peer.sent[0]).toEqual(raw);
    expect(ws.sent).toHaveLength(0);
    leaveCollab(collab.scope, peer as never);
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

  it('must not log or relay an update Yjs cannot decode, and closes its sender with 4400', async () => {
    const { ctx: c, scope, key, ws, collab } = session();
    const peer = mockWebSocket();
    joinCollab(scope, peer as never);

    await handleMessage(c, ws as never, buildSyncUpdate(new Uint8Array([1, 2, 3])));

    expect(storage.appendUpdate).not.toHaveBeenCalled();
    expect(storage.logs.get(key)).toBeUndefined();
    expect(peer.sent).toHaveLength(0);
    expect(ws.closed).toEqual({ code: 4400, reason: 'Malformed update' });

    // Positive control: a decodable update from a peer is logged.
    await handleMessage(c, peer as never, buildSyncUpdate(mapUpdate('k', 1)));
    expect(storage.logs.get(key)).toHaveLength(1);
    expect(peer.closed).toBeNull();
    leaveCollab(collab.scope, peer as never);
  });

  it('must not log an update a socket sent before its session ended under it, into no session or a newer one of its document', async () => {
    // The document was retired while the update waited in the socket's queue: its session ended and it is closing.
    const { ctx: c, scope, key, ws, collab } = session();
    endCollab(collab);
    expect(ws.closed).toEqual({ code: 1013, reason: 'Document retired' });
    await handleMessage(c, ws as never, buildSyncUpdate(mapUpdate('k', 1)));
    expect(storage.logs.get(key)).toBeUndefined();

    // A newer session of the document, opened by another socket meanwhile, takes nothing from it either.
    const next = session({ entityId: scope.entityId });
    await handleMessage(c, ws as never, buildSyncUpdate(mapUpdate('k', 2)));
    expect(storage.logs.get(key)).toBeUndefined();
    expect(next.ws.sent).toHaveLength(0);

    // Positive control: the newer session's own socket logs into it.
    await handleMessage(next.ctx, next.ws as never, buildSyncUpdate(mapUpdate('k', 3)));
    expect(storage.logs.get(key)).toHaveLength(1);
  });

  it("must not log an update sent between the relay's Step1 and the socket's reply: the reply carries it", async () => {
    const { ctx: c, key, ws } = session();
    await handleMessage(c, ws as never, buildSyncStep1(Y.encodeStateVector(new Y.Doc())));
    expect(c.awaitingReply).toBe(true);

    // Typed before the client read the relay's answer, which may tell it to drop its document.
    await handleMessage(c, ws as never, buildSyncUpdate(mapUpdate('early', 1)));
    expect(storage.appendUpdate).not.toHaveBeenCalled();

    // The reply carries what the relay lacks, `early` included, and updates after it are logged again.
    await handleMessage(c, ws as never, buildSyncStep2(mapUpdate('early', 1)));
    await handleMessage(c, ws as never, buildSyncUpdate(mapUpdate('late', 2)));
    expect(storage.logs.get(key)?.map((row) => readMap(row.payload))).toEqual([{ early: 1 }, { late: 2 }]);
  });

  it('must not fail on a sync frame whose payload is cut short, and closes its sender with 4400', async () => {
    const { ctx: c, ws } = session();
    // A payload length whose continuation byte never arrives.
    await expect(handleMessage(c, ws as never, new Uint8Array([0, 2, 0x85]))).resolves.toBeUndefined();
    expect(storage.appendUpdate).not.toHaveBeenCalled();
    expect(ws.closed).toEqual({ code: 4400, reason: 'Malformed update' });
  });

  it('a burst of dependent updates dispatched without awaiting all reach the log, and one compaction merges them', async () => {
    const { ctx: c, key, ws, collab } = seededSession();
    // The first append is slow; the others overtake it.
    const gate = deferred();
    let slowed = false;
    gates.set('appendUpdate', gate.promise);
    storage.appendUpdate.mockImplementationOnce(async (_scope: DocScope, userId: string, payload: Uint8Array) => {
      slowed = true;
      await gate.promise;
      gates.delete('appendUpdate');
      const list = storage.logs.get(key) ?? [];
      list.push({ id: 1000, payload, userId });
      storage.logs.set(key, list);
      return true;
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

    expect(storage.logs.get(key)).toHaveLength(3);
    await vi.advanceTimersByTimeAsync(3000);
    expect(storage.compactState).toHaveBeenCalledTimes(1);
    const merged = storage.bases.get(key)!;
    const verify = new Y.Doc();
    Y.applyUpdate(verify, merged);
    expect(verify.getText('t').toString()).toBe('abc');
    expect(collab.compactTimer).toBeUndefined();
  });
});

describe('handleMessage: awareness', () => {
  it('is broadcast to peers from a verified socket and rate limited per client', async () => {
    const { ctx: c, scope, ws, collab } = session();
    const peer = mockWebSocket();
    joinCollab(scope, peer as never);

    await handleMessage(c, ws as never, buildAwarenessMessage(awarenessUpdate({ clientId: 1 })));
    await handleMessage(c, ws as never, buildAwarenessMessage(awarenessUpdate({ clientId: 1, clock: 2 })));
    expect(peer.sent).toHaveLength(1);

    const other = mockWebSocket();
    joinCollab(scope, other as never);
    await handleMessage(c, other as never, buildAwarenessMessage(awarenessUpdate({ clientId: 3 })));
    expect(peer.sent).toHaveLength(2);

    vi.advanceTimersByTime(600);
    await handleMessage(c, ws as never, buildAwarenessMessage(awarenessUpdate({ clientId: 1, clock: 3 })));
    expect(peer.sent).toHaveLength(3);
    leaveCollab(collab.scope, peer as never);
    leaveCollab(collab.scope, other as never);
  });

  it('reaches its sender as well as its peers, so an editor alone on its document keeps receiving frames', async () => {
    const { ctx: c, scope, ws, collab } = session();
    // Alone on the document: after the handshake its own presence is the only frame the relay sends it, and y-websocket
    // closes a socket that received nothing for 30 s.
    const own = buildAwarenessMessage(awarenessUpdate({ clientId: 1 }));
    await handleMessage(c, ws as never, own);
    expect(ws.sent).toEqual([own]);

    const peer = mockWebSocket();
    joinCollab(scope, peer as never);
    vi.advanceTimersByTime(600);
    const renewed = buildAwarenessMessage(awarenessUpdate({ clientId: 1, clock: 2 }));
    await handleMessage(c, ws as never, renewed);
    expect(ws.sent).toEqual([own, renewed]);
    expect(peer.sent).toEqual([renewed]);
    leaveCollab(collab.scope, peer as never);
  });

  it('must not relay presence from an unverified, closing or unjoined socket', async () => {
    const { ctx: c, scope, ws, collab } = session();
    const peer = mockWebSocket();
    joinCollab(scope, peer as never);

    const pending = mockSocketContext({ requested: scope, scope: null });
    await handleMessage(pending, mockWebSocket() as never, buildAwarenessMessage(awarenessUpdate({ clientId: 1 })));
    const closing = mockWebSocket({ readyState: 2 });
    joinCollab(scope, closing as never);
    await handleMessage(c, closing as never, buildAwarenessMessage(awarenessUpdate({ clientId: 2 })));
    // Verified, but of a session that ended: it holds no client in this one.
    await handleMessage(c, mockWebSocket() as never, buildAwarenessMessage(awarenessUpdate({ clientId: 4 })));
    expect(peer.sent).toHaveLength(0);

    // Positive control: an open verified socket of the session reaches the peer.
    await handleMessage(c, ws as never, buildAwarenessMessage(awarenessUpdate({ clientId: 3 })));
    expect(peer.sent).toHaveLength(1);
    leaveCollab(collab.scope, peer as never);
    leaveCollab(collab.scope, closing as never);
  });
});

describe('handleMessage: awareness ownership', () => {
  /** A socket joined to the session under its own user. */
  const joined = (scope: DocScope, userId: string) => {
    const ws = mockWebSocket();
    joinCollab(scope, ws as never);
    return { ws, ctx: mockSocketContext({ userId, requested: scope }) };
  };

  it("must not relay a presence state for another user's client", async () => {
    const { scope, collab } = session();
    const peer = joined(scope, 'user-peer');
    const victim = joined(scope, 'user-victim');
    const attacker = joined(scope, 'user-attacker');

    await handleMessage(victim.ctx, victim.ws as never, buildAwarenessMessage(awarenessUpdate({ clientId: 10 })));
    expect(peer.ws.sent.map(awarenessClientIds)).toEqual([[10]]);

    // A newer clock would win at every peer: a fake cursor under the victim's name, or its removal.
    await handleMessage(attacker.ctx, attacker.ws as never, buildAwarenessMessage(awarenessUpdate({ clientId: 10, clock: 99, state: null })));
    expect(peer.ws.sent).toHaveLength(1);

    // Positive control: the attacker's own client is relayed.
    vi.advanceTimersByTime(600);
    await handleMessage(attacker.ctx, attacker.ws as never, buildAwarenessMessage(awarenessUpdate({ clientId: 20 })));
    expect(peer.ws.sent.map(awarenessClientIds)).toEqual([[10], [20]]);
    for (const ws of [peer.ws, victim.ws, attacker.ws]) leaveCollab(collab.scope, ws as never);
  });

  it("drops another user's entry from a frame and relays the sender's own", async () => {
    const { scope, collab } = session();
    const peer = joined(scope, 'user-peer');
    const other = joined(scope, 'user-other');
    const sender = joined(scope, 'user-sender');
    await handleMessage(other.ctx, other.ws as never, buildAwarenessMessage(awarenessUpdate({ clientId: 30 })));

    await handleMessage(sender.ctx, sender.ws as never, buildAwarenessMessage(awarenessUpdate({ clientId: 40 }, { clientId: 30, clock: 5 })));
    expect(peer.ws.sent.map(awarenessClientIds)).toEqual([[30], [40]]);
    // The sender gets back what its peers get: its own entry alone.
    expect(sender.ws.sent.map(awarenessClientIds)).toEqual([[30], [40]]);
    for (const ws of [peer.ws, other.ws, sender.ws]) leaveCollab(collab.scope, ws as never);
  });

  it("must not return another user's client to the sender: a frame of it alone reaches no socket, the sender's included", async () => {
    const { scope, collab } = session();
    const victim = joined(scope, 'user-victim');
    const attacker = joined(scope, 'user-attacker');
    await handleMessage(victim.ctx, victim.ws as never, buildAwarenessMessage(awarenessUpdate({ clientId: 10 })));

    await handleMessage(attacker.ctx, attacker.ws as never, buildAwarenessMessage(awarenessUpdate({ clientId: 10, clock: 99, state: null })));
    expect(attacker.ws.sent.map(awarenessClientIds)).toEqual([[10]]);
    expect(victim.ws.sent.map(awarenessClientIds)).toEqual([[10]]);
    expect(attacker.ws.closed).toBeNull();

    // Positive control: the attacker's own client comes back to it and reaches the victim.
    vi.advanceTimersByTime(600);
    await handleMessage(attacker.ctx, attacker.ws as never, buildAwarenessMessage(awarenessUpdate({ clientId: 20 })));
    expect(attacker.ws.sent.map(awarenessClientIds)).toEqual([[10], [20]]);
    expect(victim.ws.sent.map(awarenessClientIds)).toEqual([[10], [20]]);
    for (const ws of [victim.ws, attacker.ws]) leaveCollab(collab.scope, ws as never);
  });

  it("lets a user's new socket take over its client, and frees a client whose socket left", async () => {
    const { scope, collab } = session();
    const peer = joined(scope, 'user-peer');
    const first = joined(scope, 'user-a');
    await handleMessage(first.ctx, first.ws as never, buildAwarenessMessage(awarenessUpdate({ clientId: 50 })));

    // A reconnect of the same user announces the same client before the old socket's close is processed.
    const reconnect = joined(scope, 'user-a');
    await handleMessage(reconnect.ctx, reconnect.ws as never, buildAwarenessMessage(awarenessUpdate({ clientId: 50, clock: 2 })));
    expect(peer.ws.sent.map(awarenessClientIds)).toEqual([[50], [50]]);

    leaveCollab(collab.scope, reconnect.ws as never);
    const later = joined(scope, 'user-b');
    await handleMessage(later.ctx, later.ws as never, buildAwarenessMessage(awarenessUpdate({ clientId: 50, clock: 3 })));
    expect(peer.ws.sent).toHaveLength(3);
    for (const ws of [peer.ws, first.ws, later.ws]) leaveCollab(collab.scope, ws as never);
  });

  /** The awareness client ids a socket holds in its session. */
  const heldBy = (collab: ReturnType<typeof session>['collab'], ws: unknown) =>
    [...collab.awarenessOwners].filter(([, owner]) => owner.ws === ws).map(([clientId]) => clientId);

  it('must not grow the session via a frame announcing thousands of clients', async () => {
    const { scope, collab } = session();
    const peer = joined(scope, 'user-peer');
    const attacker = joined(scope, 'user-attacker');
    const many = Array.from({ length: 10_000 }, (_, i) => ({ clientId: 1_000 + i, state: {} }));

    await handleMessage(attacker.ctx, attacker.ws as never, buildAwarenessMessage(awarenessUpdate(...many)));

    // Dropped whole, undecoded: nothing held, nothing relayed.
    expect(collab.awarenessOwners.size).toBe(0);
    expect(peer.ws.sent).toHaveLength(0);
    // Positive control: the socket's next frame, its own client alone, is relayed.
    vi.advanceTimersByTime(600);
    await handleMessage(attacker.ctx, attacker.ws as never, buildAwarenessMessage(awarenessUpdate({ clientId: 7 })));
    expect(peer.ws.sent.map(awarenessClientIds)).toEqual([[7]]);
    for (const ws of [peer.ws, attacker.ws]) leaveCollab(collab.scope, ws as never);
  });

  it('must not let one socket hold more than four awareness clients: the fifth closes it with 4400', async () => {
    const { scope, collab } = session();
    const peer = joined(scope, 'user-peer');
    const attacker = joined(scope, 'user-attacker');

    for (let i = 0; i < 5; i++) {
      vi.advanceTimersByTime(600);
      await handleMessage(attacker.ctx, attacker.ws as never, buildAwarenessMessage(awarenessUpdate({ clientId: 2_000 + i })));
    }

    expect(attacker.ws.closed).toEqual({ code: 4400, reason: 'Too many awareness clients' });
    expect(heldBy(collab, attacker.ws)).toEqual([2000, 2001, 2002, 2003]);
    expect(peer.ws.sent.map(awarenessClientIds)).toEqual([[2000], [2001], [2002], [2003]]);
    // The refused frame comes back to no one, its sender included.
    expect(attacker.ws.sent.map(awarenessClientIds)).toEqual([[2000], [2001], [2002], [2003]]);
    // The clients a socket held go with it.
    leaveCollab(collab.scope, attacker.ws as never);
    expect(collab.awarenessOwners.size).toBe(0);
    leaveCollab(collab.scope, peer.ws as never);
  });

  it('never closes a socket for the changes y-websocket re-sends: removals take no client (positive control)', async () => {
    const { scope, collab } = session();
    const peer = joined(scope, 'user-peer');
    const editor = joined(scope, 'user-editor');
    await handleMessage(editor.ctx, editor.ws as never, buildAwarenessMessage(awarenessUpdate({ clientId: 60 })));

    // It times out ten clients whose socket left, and re-sends their removal.
    for (let i = 0; i < 10; i++) {
      vi.advanceTimersByTime(600);
      const removal = awarenessUpdate({ clientId: 3_000 + i, clock: 2, state: null });
      await handleMessage(editor.ctx, editor.ws as never, buildAwarenessMessage(removal));
    }
    expect(editor.ws.closed).toBeNull();
    expect(heldBy(collab, editor.ws)).toEqual([60]);
    expect(peer.ws.sent).toHaveLength(11);

    // Five more sockets of the same user, whose clients it re-sends: it keeps its own and never closes.
    const tabs = Array.from({ length: 5 }, () => joined(scope, 'user-editor'));
    for (const [i, tab] of tabs.entries()) {
      await handleMessage(tab.ctx, tab.ws as never, buildAwarenessMessage(awarenessUpdate({ clientId: 70 + i })));
      vi.advanceTimersByTime(600);
      await handleMessage(editor.ctx, editor.ws as never, buildAwarenessMessage(awarenessUpdate({ clientId: 70 + i, clock: 2 })));
    }
    expect(editor.ws.closed).toBeNull();
    expect(heldBy(collab, editor.ws)).toContain(60);

    // Its own removal frees its client.
    vi.advanceTimersByTime(600);
    const own = awarenessUpdate({ clientId: 60, clock: 3, state: null });
    await handleMessage(editor.ctx, editor.ws as never, buildAwarenessMessage(own));
    expect(collab.awarenessOwners.has(60)).toBe(false);
    for (const ws of [peer.ws, editor.ws, ...tabs.map((tab) => tab.ws)]) leaveCollab(collab.scope, ws as never);
  });

  it('must not relay an awareness frame no decoder accepts, and closes its sender with 4400', async () => {
    const { scope, collab } = session();
    const peer = joined(scope, 'user-peer');
    const sender = joined(scope, 'user-sender');

    await handleMessage(sender.ctx, sender.ws as never, buildAwarenessMessage(new Uint8Array([5, 1])));
    expect(peer.ws.sent).toHaveLength(0);
    expect(sender.ws.closed).toEqual({ code: 4400, reason: 'Malformed awareness' });
    for (const ws of [peer.ws, sender.ws]) leaveCollab(collab.scope, ws as never);
  });
});

describe('compaction', () => {
  it('runs once after the debounce, names the editors newest first, and deletes exactly the rows it read', async () => {
    const { ctx: c, scope, key, ws } = seededSession();
    const editor2 = mockSocketContext({ userId: 'user-2', requested: scope });
    await handleMessage(c, ws as never, buildSyncUpdate(mapUpdate('a', 1)));
    vi.advanceTimersByTime(2000);
    await handleMessage(editor2, ws as never, buildSyncUpdate(mapUpdate('b', 2)));
    vi.advanceTimersByTime(2000);
    expect(postMaterialize).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1000);

    expect(postMaterialize).toHaveBeenCalledTimes(1);
    // As the system, in the document's scope: no joiner's context rides along.
    expect(postMaterialize).toHaveBeenCalledWith(scope, ['user-2', 'user-1'], '[]');
    const [, merged, ids] = storage.compactState.mock.calls[0] as [never, Uint8Array, number[]];
    expect(readMap(merged)).toEqual({ a: 1, b: 2 });
    expect(ids).toHaveLength(2);
    expect(storage.logs.get(key)).toHaveLength(0);
  });

  let keystroke = 0;
  /** One update a second from the session's socket for `seconds` seconds: each restarts the debounce. */
  async function typeFor(seconds: number, { ctx: c, ws }: ReturnType<typeof seededSession>) {
    for (let i = 0; i < seconds; i++) {
      await handleMessage(c, ws as never, buildSyncUpdate(mapUpdate(`key-${++keystroke}`, i)));
      await vi.advanceTimersByTimeAsync(1000);
    }
  }

  it('compacts a lone update after the three-second debounce', async () => {
    const { ctx: c, ws } = seededSession();
    await handleMessage(c, ws as never, buildSyncUpdate(mapUpdate('a', 1)));
    await vi.advanceTimersByTimeAsync(2999);
    expect(postMaterialize).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(postMaterialize).toHaveBeenCalledTimes(1);
  });

  it('must not let continuous typing hold compaction off: it runs ten seconds after the first update, and ten seconds later again', async () => {
    const opened = seededSession();
    for (let second = 1; second <= 20; second++) {
      await typeFor(1, opened);
      expect(postMaterialize).toHaveBeenCalledTimes(Math.floor(second / 10));
    }
    // Each run wrote the ten updates of its window.
    expect(storage.compactState.mock.calls.map(([, , ids]) => (ids as number[]).length)).toEqual([10, 10]);
  });

  it('gives the next burst a deadline of its own after a run, whatever its outcome', async () => {
    const opened = seededSession();
    vi.mocked(postMaterialize).mockResolvedValueOnce('retry');
    await typeFor(10, opened);
    expect(postMaterialize).toHaveBeenCalledTimes(1);
    expect(opened.collab.compactDueAt).toBeUndefined();

    // Quiet for a minute, then typing again: the burst waits ten seconds of its own, not the first one's long-past deadline.
    await vi.advanceTimersByTimeAsync(60_000);
    await typeFor(9, opened);
    expect(postMaterialize).toHaveBeenCalledTimes(1);
    await typeFor(1, opened);
    expect(postMaterialize).toHaveBeenCalledTimes(2);
  });

  it('must not queue runs back to back behind a slow one: updates logged during a run wait for a deadline of their own', async () => {
    const opened = seededSession();
    const gate = deferred();
    vi.mocked(postMaterialize).mockImplementationOnce(async () => {
      await gate.promise;
      return 'ok';
    });
    await typeFor(10, opened);
    expect(postMaterialize).toHaveBeenCalledTimes(1);

    // The backend holds the first write for nine seconds while typing goes on.
    await typeFor(9, opened);
    gate.release();
    await flushMicrotasks();
    expect(postMaterialize).toHaveBeenCalledTimes(1);
    await typeFor(1, opened);
    expect(postMaterialize).toHaveBeenCalledTimes(2);
  });

  it('must not leave a compaction timer or deadline on a session that ended', async () => {
    const { ctx: c, ws, collab } = seededSession();
    await handleMessage(c, ws as never, buildSyncUpdate(mapUpdate('a', 1)));
    expect(collab.compactDueAt).toBeDefined();

    endCollab(collab);
    expect(collab.compactTimer).toBeUndefined();
    expect(collab.compactDueAt).toBeUndefined();
    await vi.advanceTimersByTimeAsync(10_000);
    expect(postMaterialize).not.toHaveBeenCalled();
  });

  it('an update appended during an in-flight materialize survives compaction', async () => {
    const { ctx: c, key, ws, collab } = seededSession();
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

    const remaining = storage.logs.get(key)!;
    expect(remaining).toHaveLength(1);
    expect(readMap(remaining[0].payload)).toEqual({ late: true });
    expect(readMap(storage.bases.get(key)!)).toEqual({ a: 1 });
  });

  it('a thrown storage error counts as retry, so the compaction timer never sees a rejection', async () => {
    const { collab } = session();
    storage.readLog.mockRejectedValueOnce(new Error('db down'));
    expect(await runCompaction(collab)).toBe('retry');
  });

  it('a compaction that finds the document retired discards its log and ends the session with 1013', async () => {
    const { ctx: c, scope, key, ws, collab } = seededSession();
    await handleMessage(c, ws as never, buildSyncStep1(Y.encodeStateVector(new Y.Doc())));
    await handleMessage(c, ws as never, buildSyncStep2(mapUpdate('a', 1)));
    // The description was written outside the relay, which retired the document, before the window closed.
    storage.bases.delete(key);
    storage.generations.delete(key);

    await vi.advanceTimersByTimeAsync(3000);

    expect(postMaterialize).not.toHaveBeenCalled();
    expect(storage.logs.get(key)).toHaveLength(0);
    expect(ws.closed).toEqual({ code: 1013, reason: 'Document retired' });
    expect(getCollab(scope)).toBeUndefined();
    expect(collab.compactTimer).toBeUndefined();
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
