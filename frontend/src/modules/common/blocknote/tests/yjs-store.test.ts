import 'fake-indexeddb/auto';
import { Dexie } from 'dexie';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as Y from 'yjs';

vi.mock('shared', () => ({ appConfig: { slug: 'test', yjsUrl: 'http://relay.test', services: { yjs: { enabled: true } } } }));
/** What the tab channel was asked to send, in order. */
const broadcasts: { key: string; generation: string; update: Uint8Array; rowId: number | null }[] = [];
vi.mock('~/modules/common/blocknote/yjs-tab-channel', () => ({
  postTabUpdate: (msg: (typeof broadcasts)[number]) => broadcasts.push(msg),
  toTabKey: (key: { entityType: string; entityId: string }) => `${key.entityType}:${key.entityId}`,
}));
let offlineAccess = true;
vi.mock('~/modules/ui/ui-store', () => ({ useUIStore: { getState: () => ({ offlineAccess }) } }));
vi.mock('~/query/local-user-storage', () => ({ subscribeOwnerChange: () => () => {} }));

const { bindLocalUserDb, closeLocalUserDb, getLocalUserDb, LocalUserDatabase } = await import('~/query/local-user-db');
const store = await import('~/modules/common/blocknote/yjs-store');
const { createYDocWriter, evictYDocs, flushYjsStore, loadYDoc, trimYDoc, watchStoragePressure, watchUnsavedYDocs } = store;

type Db = InstanceType<typeof LocalUserDatabase>;
type Writer = NonNullable<ReturnType<typeof createYDocWriter>>;

let counter = 0;
let owner = '';
let db: Db;

const key = { entityType: 'attachment', entityId: 'doc-1' } as const;
const scope = { tenantId: 'tenant-1', organizationId: 'org-1', generation: 'gen-1' };
const keyPath = ['attachment', 'doc-1'] as ['attachment', string];

beforeEach(() => {
  owner = `user-${++counter}`;
  db = bindLocalUserDb(owner);
  broadcasts.length = 0;
  offlineAccess = true;
});

afterEach(async () => {
  await flushYjsStore();
  closeLocalUserDb();
  await Dexie.delete(`test:${owner}`);
});

/** A writer that started storing `doc`, as a connection starts it once its document is stored. */
function startWriter(doc: Y.Doc, opts: Parameters<typeof createYDocWriter>[1] = {}, unsynced = false): Writer {
  const writer = createYDocWriter(key, opts);
  if (!writer) throw new Error('no database bound');
  writer.start(doc, scope, unsynced);
  return writer;
}

/** A local edit in `doc`, appended as the connection's update listener appends it; returns the update. */
function editLocally(doc: Y.Doc, writer: Writer, text: string): Uint8Array {
  let update: Uint8Array = new Uint8Array();
  const capture = (u: Uint8Array) => {
    update = u;
  };
  doc.on('update', capture);
  doc.getText('t').insert(doc.getText('t').length, text);
  doc.off('update', capture);
  writer.append(update, true);
  return update;
}

/** An update from elsewhere (the relay, another client) to `doc`. */
function remoteEdit(doc: Y.Doc, writer: Writer, text: string): Uint8Array {
  const other = new Y.Doc();
  Y.applyUpdate(other, Y.encodeStateAsUpdate(doc));
  const before = Y.encodeStateVector(other);
  other.getText('t').insert(other.getText('t').length, text);
  const update = Y.encodeStateAsUpdate(other, before);
  Y.applyUpdate(doc, update);
  writer.append(update, false);
  return update;
}

const rows = () => db.yDocUpdates.where('[entityType+entityId]').equals(keyPath).toArray();
const record = () => db.yDocs.get(keyPath);

/** The text a fresh document holds once the stored base and rows are applied. */
async function storedText(): Promise<string> {
  const loaded = await loadYDoc(key);
  const doc = new Y.Doc();
  for (const update of loaded?.updates ?? []) Y.applyUpdate(doc, update);
  return doc.getText('t').toString();
}

describe('yjs store: writing and loading', () => {
  it('persists edits and loads them back: base and rows in order, with the newest row id', async () => {
    const doc = new Y.Doc();
    doc.getText('t').insert(0, 'synced ');
    const writer = startWriter(doc);
    await flushYjsStore();
    expect((await record())?.unsynced).toBe(0);
    expect(await rows()).toHaveLength(0);

    editLocally(doc, writer, 'mine ');
    remoteEdit(doc, writer, 'theirs');
    await flushYjsStore();

    const stored = await rows();
    expect(stored.map((row) => row.local).sort()).toEqual([0, 1]);
    expect((await record())?.unsynced).toBe(1);
    const loaded = await loadYDoc(key);
    expect(loaded?.record.generation).toBe('gen-1');
    expect(loaded?.appliedUpTo).toBe(Math.max(...stored.map((row) => row.id as number)));
    expect(loaded?.updates).toHaveLength(3);
    expect(await storedText()).toBe('synced mine theirs');
  });

  it('writes one transaction per task: local edits merge into one row, broadcast after the commit with its id', async () => {
    const doc = new Y.Doc();
    const writer = startWriter(doc);
    await flushYjsStore();

    editLocally(doc, writer, 'a');
    editLocally(doc, writer, 'b');
    expect(broadcasts).toHaveLength(0);
    await flushYjsStore();

    const [row] = await rows();
    expect(await rows()).toHaveLength(1);
    expect(broadcasts).toEqual([{ t: 'update', key: 'attachment:doc-1', generation: 'gen-1', update: row.update, rowId: row.id }]);
    const check = new Y.Doc();
    Y.applyUpdate(check, row.update);
    expect(check.getText('t').toString()).toBe('ab');
  });

  it('a first store of an unsynced document writes the whole document, with one local row of it', async () => {
    const doc = new Y.Doc();
    doc.getText('t').insert(0, 'typed before storing');
    startWriter(doc, {}, true);
    await flushYjsStore();

    const stored = await rows();
    expect(stored).toHaveLength(1);
    expect(stored[0].local).toBe(1);
    expect(stored[0].update).toEqual(Y.encodeStateAsUpdate(doc));
    expect((await record())?.unsynced).toBe(1);
    expect(await storedText()).toBe('typed before storing');
  });

  it('rewrites a document deleted under the writer whole, keeping its unproven edits local', async () => {
    const doc = new Y.Doc();
    const writer = startWriter(doc);
    editLocally(doc, writer, 'unsaved');
    await flushYjsStore();

    // Evicted, or dropped by another tab, while this one holds it open.
    await db.transaction('rw', db.yDocs, db.yDocStates, db.yDocUpdates, async () => {
      await db.yDocs.delete(keyPath);
      await db.yDocStates.delete(keyPath);
      await db.yDocUpdates.where('[entityType+entityId]').equals(keyPath).delete();
    });
    remoteEdit(doc, writer, ' later');
    await flushYjsStore();

    expect(await storedText()).toBe('unsaved later');
    expect((await record())?.unsynced).toBe(1);
    expect((await rows()).filter((row) => row.local === 1)).toHaveLength(1);
  });

  it('must not write into a document another tab replaced with another generation: the writer fails', async () => {
    const doc = new Y.Doc();
    const onChange = vi.fn();
    const writer = startWriter(doc, { onChange });
    await flushYjsStore();
    await db.yDocs.update(keyPath, { generation: 'gen-2' });

    editLocally(doc, writer, 'stale');
    await flushYjsStore();

    expect(writer.failed).toBe(true);
    expect(onChange).toHaveBeenCalled();
    expect(await rows()).toHaveLength(0);
    // The edit still reaches tabs on the same generation, with no row to name.
    expect(broadcasts.at(-1)?.rowId).toBeNull();
  });

  it('starting on a stored document of another generation parks its unsynced edits as replaced, then stores the new one', async () => {
    const old = new Y.Doc();
    const oldWriter = startWriter(old);
    editLocally(old, oldWriter, 'never saved');
    await flushYjsStore();

    const fresh = new Y.Doc();
    fresh.getText('t').insert(0, 'reseeded');
    createYDocWriter(key)?.start(fresh, { ...scope, generation: 'gen-2' }, false);
    await flushYjsStore();

    expect((await record())?.generation).toBe('gen-2');
    expect(await storedText()).toBe('reseeded');
    const [parked] = await db.unsaveableYDocs.toArray();
    expect(parked).toMatchObject({ reason: 'replaced', generation: 'gen-1', tenantId: 'tenant-1' });
    const check = new Y.Doc();
    Y.applyUpdate(check, parked.state);
    expect(check.getText('t').toString()).toBe('never saved');
  });

  it('flushYjsStore resolves once every queued edit is committed', async () => {
    const doc = new Y.Doc();
    const writer = startWriter(doc);
    editLocally(doc, writer, 'queued');
    expect(writer.pending).toBe(true);

    await flushYjsStore();
    expect(writer.pending).toBe(false);
    expect(await storedText()).toBe('queued');
  });

  it('stores nothing for an update another tab stored under a row; one whose write failed is kept, not local', async () => {
    const doc = new Y.Doc();
    const writer = startWriter(doc);
    await flushYjsStore();

    writer.append(Y.encodeStateAsUpdate(doc), false, { rowId: 42 });
    await flushYjsStore();
    expect(await rows()).toHaveLength(0);

    const peer = new Y.Doc();
    peer.getText('t').insert(0, 'peer');
    writer.append(Y.encodeStateAsUpdate(peer), false, { rowId: null });
    await flushYjsStore();
    expect((await rows()).map((row) => row.local)).toEqual([0]);
    expect(broadcasts).toHaveLength(0);
  });
});

describe('yjs store: proofs', () => {
  /** A row of another page load, as a tab since closed left it. */
  const otherTabRow = (text: string) => {
    const doc = new Y.Doc();
    doc.getText('t').insert(0, text);
    return db.yDocUpdates.add({ ...key, update: Y.encodeStateAsUpdate(doc), local: 1, tabId: 'closed-tab' }) as Promise<number>;
  };

  it("a clean proof clears only this page's local rows; unsynced stays while another's are left", async () => {
    const doc = new Y.Doc();
    const writer = startWriter(doc);
    await flushYjsStore();
    const theirs = await otherTabRow('theirs');
    await db.yDocs.update(keyPath, { unsynced: 1 });
    editLocally(doc, writer, 'mine');
    await flushYjsStore();

    await writer.prove({ kind: 'clean' });

    const byId = new Map((await rows()).map((row) => [row.id, row.local]));
    expect(byId.get(theirs)).toBe(1);
    expect([...byId.values()].filter((local) => local === 1)).toHaveLength(1);
    expect((await record())?.unsynced).toBe(1);
  });

  it('a handshake proof clears exactly the rows the document held as it went out, and sets the synced vector', async () => {
    const doc = new Y.Doc();
    const applied = { upTo: 0, ids: new Set<number>() };
    const writer = startWriter(doc, { applied });
    await flushYjsStore();
    const loaded = await otherTabRow('loaded');
    applied.upTo = loaded;
    editLocally(doc, writer, 'own');
    await flushYjsStore();
    // The writer adds its own rows to the connection's rows once committed.
    expect(applied.ids.size).toBe(1);

    const snapshot = { upTo: applied.upTo, ids: new Set(applied.ids) };
    const vector = Y.encodeStateVector(doc);
    // Written after the handshake went out: not covered.
    const later = await otherTabRow('later');

    await writer.prove({ kind: 'handshake', applied: snapshot, vector });

    const local = (await rows()).filter((row) => row.local === 1).map((row) => row.id);
    expect(local).toEqual([later]);
    expect((await record())?.syncedVector).toEqual(vector);
    expect((await record())?.unsynced).toBe(1);

    await writer.prove({ kind: 'handshake', applied: { upTo: later, ids: new Set() }, vector });
    expect((await record())?.unsynced).toBe(0);
  });

  it('must not clear a row committed after the clean proof was taken', async () => {
    const doc = new Y.Doc();
    const writer = startWriter(doc);
    editLocally(doc, writer, 'saved');
    await flushYjsStore();

    editLocally(doc, writer, ' not yet');
    const proof = writer.prove({ kind: 'clean' });
    await flushYjsStore();
    await proof;

    const local = (await rows()).filter((row) => row.local === 1);
    expect(local).toHaveLength(1);
    expect((await record())?.unsynced).toBe(1);
  });

  it("must not clear another generation's rows", async () => {
    const doc = new Y.Doc();
    const writer = startWriter(doc);
    editLocally(doc, writer, 'mine');
    await flushYjsStore();
    await db.yDocs.update(keyPath, { generation: 'gen-2' });

    await writer.prove({ kind: 'handshake', applied: { upTo: Number.MAX_SAFE_INTEGER, ids: new Set() }, vector: new Uint8Array([0]) });
    expect((await rows()).filter((row) => row.local === 1)).toHaveLength(1);
  });
});

describe('yjs store: trimming', () => {
  it('folds only rows that are not local, deletes exactly the rows it read, and shrinks deleted content', async () => {
    const doc = new Y.Doc();
    const writer = startWriter(doc);
    await flushYjsStore();
    for (let i = 0; i < 5; i++) {
      remoteEdit(doc, writer, 'x'.repeat(2_000));
      await flushYjsStore();
    }
    // Everything the relay sent is deleted again.
    const before = Y.encodeStateVector(doc);
    doc.getText('t').delete(0, doc.getText('t').length);
    writer.append(Y.encodeStateAsUpdate(doc, before), false);
    editLocally(doc, writer, 'kept');
    await flushYjsStore();
    const bytesBefore = (await record())?.bytes ?? 0;
    const localBefore = (await rows()).filter((row) => row.local === 1);

    await trimYDoc(key);

    const after = await rows();
    expect(after).toEqual(localBefore);
    expect(await storedText()).toBe('kept');
    expect((await record())?.bytes).toBeLessThan(bytesBefore / 4);
    expect((await record())?.updateBytes).toBe(localBefore[0].update.byteLength);
  });

  it('two tabs trimming one document at once lose no row, nor an append made meanwhile', async () => {
    const doc = new Y.Doc();
    const writer = startWriter(doc);
    await flushYjsStore();
    for (let i = 0; i < 4; i++) {
      remoteEdit(doc, writer, `r${i} `);
      await flushYjsStore();
    }
    const otherTab = new LocalUserDatabase(owner);
    await otherTab.open();

    remoteEdit(doc, writer, 'meanwhile');
    await Promise.all([trimYDoc(key), trimYDoc(key, otherTab), flushYjsStore()]);

    expect(await storedText()).toBe('r0 r1 r2 r3 meanwhile');
    otherTab.close();
  });

  it('trims on its own once the update rows pass the row threshold', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    try {
      const doc = new Y.Doc();
      const writer = startWriter(doc);
      await flushYjsStore();
      for (let i = 0; i <= store.TRIM_ROWS; i++) {
        remoteEdit(doc, writer, '.');
        await flushYjsStore();
      }
      expect((await rows()).length).toBeGreaterThan(store.TRIM_ROWS);

      await vi.advanceTimersByTimeAsync(store.TRIM_DEBOUNCE_MS);
      await vi.waitFor(async () => expect(await rows()).toHaveLength(0));
      expect((await storedText()).length).toBe(store.TRIM_ROWS + 1);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('yjs store: eviction', () => {
  const hour = 60 * 60_000;

  /** A stored document's metadata, base and one row, opened `age` ago. */
  async function seed(id: string, age: number, extra: Partial<{ unsynced: 0 | 1; bytes: number }> = {}) {
    const k = { entityType: 'attachment' as const, entityId: id };
    const at = Date.now() - age;
    await db.yDocs.put({ ...k, ...scope, syncedVector: null, unsynced: 0, bytes: 10, updateBytes: 1, updatedAt: at, lastOpenedAt: at, ...extra });
    await db.yDocStates.put({ ...k, state: new Uint8Array([0, 0]) });
    await db.yDocUpdates.add({ ...k, update: new Uint8Array([0, 0]), local: extra.unsynced ?? 0, tabId: 'tab' });
  }
  const storedIds = async () => (await db.yDocs.toArray()).map((r) => r.entityId).sort();

  it('evicts the least recently opened documents past the document limit, with their base and rows', async () => {
    const total = store.MAX_STORED_DOCS + 3;
    for (let i = 0; i < total; i++) await seed(`d${String(i).padStart(3, '0')}`, 2 * hour + (total - i) * 1_000);

    await evictYDocs();

    const ids = await storedIds();
    expect(ids).toHaveLength(store.MAX_STORED_DOCS);
    expect(ids).not.toContain('d000');
    expect(ids).not.toContain('d002');
    expect(ids).toContain('d003');
    expect(await db.yDocStates.count()).toBe(store.MAX_STORED_DOCS);
    expect(await db.yDocUpdates.count()).toBe(store.MAX_STORED_DOCS);
  });

  it('evicts past the byte budget', async () => {
    const third = Math.floor(store.MAX_STORED_BYTES / 3);
    for (const [i, id] of ['a', 'b', 'c', 'd'].entries()) await seed(id, (5 - i) * hour, { bytes: third });

    await evictYDocs();
    expect(await storedIds()).toEqual(['b', 'c', 'd']);
  });

  it('must not evict a document with unsynced edits, one open in this tab, one opened within the hour, or parked edits', async () => {
    const total = store.MAX_STORED_DOCS + 10;
    for (let i = 0; i < total; i++) await seed(`d${String(i).padStart(3, '0')}`, 3 * hour);
    await seed('unsynced', 10 * hour, { unsynced: 1 });
    await seed('recent', 10 * 60_000);
    await db.unsaveableYDocs.add({ ...key, ...scope, reason: 'deleted', state: new Uint8Array([0, 0]), at: 0 });
    // Open in this tab: its writer started, with a stamp an hour old meanwhile.
    const doc = new Y.Doc();
    startWriter(doc);
    await flushYjsStore();
    await db.yDocs.update(keyPath, { lastOpenedAt: Date.now() - 10 * hour });

    await evictYDocs();

    const ids = await storedIds();
    expect(ids).toEqual(expect.arrayContaining(['unsynced', 'recent', 'doc-1']));
    expect(await db.unsaveableYDocs.count()).toBe(1);
    doc.destroy();
  });

  it('in session mode drops synced documents not opened within two hours, and keeps them with offline access', async () => {
    await seed('old', 3 * hour);
    await seed('young', 90 * 60_000);
    await seed('old-unsynced', 3 * hour, { unsynced: 1 });

    await evictYDocs();
    expect(await storedIds()).toEqual(['old', 'old-unsynced', 'young']);

    offlineAccess = false;
    await evictYDocs();
    expect(await storedIds()).toEqual(['old-unsynced', 'young']);
  });

  it('warns once per session: when the limits stay exceeded with nothing left to evict', async () => {
    const warned = vi.fn();
    const stop = watchStoragePressure(warned);
    for (let i = 0; i <= store.MAX_STORED_DOCS; i++) await seed(`u${i}`, 3 * hour, { unsynced: 1 });

    await evictYDocs();
    await evictYDocs();

    expect(warned).toHaveBeenCalledExactlyOnceWith('budget');
    stop();
  });
});

describe('yjs store: quota', () => {
  const quotaError = () => new DOMException('The quota has been exceeded.', 'QuotaExceededError');

  it('evicts, trims and retries once on a quota error, and stores the edit', async () => {
    const doc = new Y.Doc();
    const writer = startWriter(doc);
    await flushYjsStore();
    const add = db.yDocUpdates.add.bind(db.yDocUpdates);
    const spy = vi.spyOn(db.yDocUpdates, 'add').mockImplementationOnce(() => {
      throw quotaError();
    });
    spy.mockImplementation(add);

    editLocally(doc, writer, 'fits after all');
    await flushYjsStore();

    expect(writer.failed).toBe(false);
    expect(await storedText()).toBe('fits after all');
    spy.mockRestore();
  });

  it('fails for good on a second quota error: the edit stays in memory, and still reaches other tabs', async () => {
    const doc = new Y.Doc();
    const onChange = vi.fn();
    const writer = startWriter(doc, { onChange });
    await flushYjsStore();
    const spy = vi.spyOn(db.yDocUpdates, 'add').mockImplementation(() => {
      throw quotaError();
    });

    editLocally(doc, writer, 'no room');
    await flushYjsStore();

    expect(writer.failed).toBe(true);
    expect(writer.pending).toBe(false);
    expect(onChange).toHaveBeenCalled();
    expect(broadcasts.at(-1)).toMatchObject({ rowId: null });
    spy.mockRestore();

    // Later edits are no longer stored, but still broadcast.
    editLocally(doc, writer, ' more');
    await flushYjsStore();
    expect(await rows()).toHaveLength(0);
    expect(broadcasts).toHaveLength(2);
  });
});

describe('yjs store: parking and dropping', () => {
  it('parks the stored state merged with the document, and deletes the stored document', async () => {
    const doc = new Y.Doc();
    const writer = startWriter(doc);
    editLocally(doc, writer, 'stored ');
    await flushYjsStore();
    // Typed after the last commit: only the document holds it.
    doc.getText('t').insert(doc.getText('t').length, 'in memory');

    await writer.park('denied', doc);

    expect(await record()).toBeUndefined();
    expect(await rows()).toHaveLength(0);
    expect(await db.yDocStates.get(keyPath)).toBeUndefined();
    const [parked] = await db.unsaveableYDocs.toArray();
    expect(parked).toMatchObject({ ...key, ...scope, reason: 'denied' });
    const check = new Y.Doc();
    Y.applyUpdate(check, parked.state);
    expect(check.getText('t').toString()).toBe('stored in memory');

    // Parked: nothing more is written.
    editLocally(doc, writer, '!');
    await flushYjsStore();
    expect(await record()).toBeUndefined();
  });

  it("before start, parks the stored record alone: the document given may hold another generation's history", async () => {
    const stored = new Y.Doc();
    const writer = startWriter(stored);
    editLocally(stored, writer, 'gen-1 edits');
    await flushYjsStore();
    const other = new Y.Doc();
    other.getText('t').insert(0, 'gen-2 text');

    await createYDocWriter(key)?.park('replaced', other);

    const [parked] = await db.unsaveableYDocs.toArray();
    const check = new Y.Doc();
    Y.applyUpdate(check, parked.state);
    expect(check.getText('t').toString()).toBe('gen-1 edits');
    expect(parked.generation).toBe('gen-1');
  });

  it('drop deletes exactly the stored document', async () => {
    const doc = new Y.Doc();
    const writer = startWriter(doc);
    editLocally(doc, writer, 'x');
    await flushYjsStore();
    await db.unsaveableYDocs.add({ ...key, ...scope, reason: 'deleted', state: new Uint8Array([0, 0]), at: 0 });

    await writer.drop();

    expect(await record()).toBeUndefined();
    expect(await rows()).toHaveLength(0);
    expect(await db.unsaveableYDocs.count()).toBe(1);
  });

  it('lists stored documents with unsynced edits and parked ones, live', async () => {
    const lists: string[][] = [];
    const stop = watchUnsavedYDocs((docs) => lists.push(docs.map((d) => `${d.entityId}:${d.parked ?? 'stored'}`)));
    const doc = new Y.Doc();
    const writer = startWriter(doc);
    editLocally(doc, writer, 'x');
    await flushYjsStore();
    await vi.waitFor(() => expect(lists.at(-1)).toEqual(['doc-1:stored']));

    await writer.prove({ kind: 'clean' });
    await vi.waitFor(() => expect(lists.at(-1)).toEqual([]));

    await db.unsaveableYDocs.add({ entityType: 'attachment', entityId: 'doc-2', ...scope, reason: 'deleted', state: new Uint8Array([0, 0]), at: 0 });
    await vi.waitFor(() => expect(lists.at(-1)).toEqual(['doc-2:deleted']));
    stop();
  });
});

describe('yjs store: a database deleted elsewhere', () => {
  it('stops writing, and nothing recreates the database', async () => {
    const doc = new Y.Doc();
    const writer = startWriter(doc);
    await flushYjsStore();

    // Another tab's hard sign-out deletes the database; this tab closes and unbinds.
    const otherTab = new LocalUserDatabase(owner);
    await otherTab.open();
    await otherTab.delete();
    expect(getLocalUserDb()).toBeNull();

    editLocally(doc, writer, 'late');
    await flushYjsStore();
    expect(writer.failed).toBe(false);
    expect(await Dexie.exists(`test:${owner}`)).toBe(false);
  });
});
