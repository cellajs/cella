// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { Dexie } from 'dexie';
import * as decoding from 'lib0/decoding';
import * as encoding from 'lib0/encoding';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as Y from 'yjs';

/**
 * Connections with the real store: Yjs documents, the per-user database (fake-indexeddb) and the tab channel. The
 * provider is a stand-in that records what y-websocket would do; yjs-connections.test.ts covers the socket ledger.
 */

// jsdom brings typed arrays of its own realm, while Yjs and fake-indexeddb make Node's. Dexie tells a binary value by
// the global constructor and would copy a Node one as a plain object, so the test runs on one realm, as a browser does.
vi.hoisted(() => {
  globalThis.Uint8Array = Object.getPrototypeOf(Buffer.prototype).constructor;
});

/** The browser socket the provider's WebSocket polyfill extends. */
class FakeSocket {
  static readonly OPEN = 1;
  readonly OPEN = 1;
  readyState = 1;
  send(_data: unknown) {}
  close() {}
}
vi.stubGlobal('WebSocket', FakeSocket);

class MockAwareness {
  destroy = vi.fn();
}

interface ProviderOpts {
  params: Record<string, string>;
  WebSocketPolyfill: new (url: string) => FakeSocket;
}

class MockProvider {
  params: Record<string, string>;
  synced = false;
  wsconnected = false;
  ws: FakeSocket | null = null;
  /** The document's text as each connect found it: what the handshake's Step1 would carry. */
  textAtConnect: string[] = [];
  messageHandlers: ((encoder: unknown, decoder: unknown, provider: unknown, emitSynced: boolean, type: number) => void)[] = [vi.fn()];
  private socketClass: new (
    url: string,
  ) => FakeSocket;
  private listeners = new Map<string, Set<(...args: unknown[]) => void>>();

  constructor(
    _url: string,
    _room: string,
    readonly doc: Y.Doc,
    opts: ProviderOpts,
  ) {
    this.params = { ...opts.params };
    this.socketClass = opts.WebSocketPolyfill;
    providers.push(this);
  }

  openSocket() {
    this.ws = new this.socketClass('ws://relay');
    this.wsconnected = true;
  }
  /** A sync frame y-websocket sends: a Step1 (0), Step2 (1) or Update (2). */
  sendSync(subtype: number) {
    this.ws?.send(new Uint8Array([0, subtype, 0]));
  }
  on(event: string, cb: (...args: unknown[]) => void) {
    if (!this.listeners.has(event)) this.listeners.set(event, new Set());
    this.listeners.get(event)!.add(cb);
  }
  off(event: string, cb: (...args: unknown[]) => void) {
    this.listeners.get(event)?.delete(cb);
  }
  emit(event: string, ...args: unknown[]) {
    for (const cb of this.listeners.get(event) ?? []) cb(...args);
  }
  connect = vi.fn(() => {
    this.textAtConnect.push(this.doc.getText('t').toString());
  });
  disconnect = vi.fn();
  destroy = vi.fn();
}
const providers: MockProvider[] = [];

let online = true;
let onlineListener: ((online: boolean) => void) | undefined;
const fetchQuery = vi.fn();
/** Held open, a load waits for it: a slow disk. */
let loadGate: Promise<void> | null = null;

vi.mock('y-websocket', () => ({ WebsocketProvider: MockProvider }));
vi.mock('y-protocols/awareness', () => ({ Awareness: MockAwareness }));
vi.mock('~/modules/common/toaster/toaster', () => ({ toaster: { warning: vi.fn() } }));
vi.mock('i18next', () => ({ default: { t: (k: string) => k }, t: (k: string) => k }));
vi.mock('shared', () => ({ appConfig: { slug: 'test', yjsUrl: 'http://localhost:1234', services: { yjs: { enabled: true } } } }));
vi.mock('@tanstack/react-query', () => ({
  onlineManager: {
    isOnline: () => online,
    subscribe: (listener: (online: boolean) => void) => {
      onlineListener = listener;
      return () => {};
    },
  },
}));
vi.mock('~/query/query-client', () => ({
  queryClient: {
    invalidateQueries: vi.fn(),
    fetchQuery: (...args: unknown[]) => fetchQuery(...args),
    getQueryCache: () => ({ find: () => ({ getObserversCount: () => 1 }) }),
    getQueryState: () => ({ error: null }),
  },
}));
vi.mock('~/modules/common/blocknote/query', () => ({
  yjsTokenKeys: { entity: (...key: unknown[]) => key },
  yjsTokenQueryOptions: (params: unknown) => ({ params }),
  yjsTokenRefusal: () => null,
}));
vi.mock('~/modules/common/blocknote/yjs-resync', () => ({ watchPendingStructs: () => () => {} }));
vi.mock('~/env', () => ({ isDebugMode: false }));
vi.mock('~/modules/ui/ui-store', () => ({ useUIStore: { getState: () => ({ offlineAccess: true }) } }));
vi.mock('~/query/local-user-storage', () => ({ subscribeOwnerChange: () => () => {} }));
vi.mock('~/query/realtime/tab-coordinator', () => ({ isLeader: () => false, tabCoordinatorStore: { subscribe: () => () => {} } }));
vi.mock('~/modules/common/blocknote/yjs-store', async (importOriginal) => {
  const actual = await importOriginal<typeof import('~/modules/common/blocknote/yjs-store')>();
  return {
    ...actual,
    loadYDoc: async (key: Parameters<typeof actual.loadYDoc>[0]) => {
      const loaded = await actual.loadYDoc(key);
      if (loadGate) await loadGate;
      return loaded;
    },
  };
});

const { useUserStore, yjsTokenKey } = await import('~/modules/user/user-store');
const { bindLocalUserDb, closeLocalUserDb } = await import('~/query/local-user-db');
const { createYDocWriter, flushYjsStore, storeTabId } = await import('~/modules/common/blocknote/yjs-store');
const { findConnection, resumeConnection, useYjsConnection } = await import('~/modules/common/blocknote/yjs-connections');

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

type Db = ReturnType<typeof bindLocalUserDb>;
type Hook = ReturnType<typeof useYjsConnection>;

let counter = 0;
let owner = '';
let db: Db;
let root: Root | undefined;
const scope = { tenantId: 'tenant-1', organizationId: 'org-1' };

beforeEach(() => {
  owner = `user-${++counter}`;
  db = bindLocalUserDb(owner);
  online = true;
  loadGate = null;
  fetchQuery.mockReset();
});

afterEach(async () => {
  await act(async () => root?.unmount());
  root = undefined;
  vi.useRealTimers();
  await flushYjsStore();
  closeLocalUserDb();
  await Dexie.delete(`test:${owner}`);
});

const keyOf = (entityId: string) => ({ entityType: 'attachment' as const, entityId });
const keyPath = (entityId: string) => ['attachment', entityId] as ['attachment', string];

/** Stores a document as an earlier page left it: `text`, of `generation`, with its edit unsynced when asked. */
async function seedStored(entityId: string, text: string, opts: { generation?: string; unsynced?: boolean } = {}) {
  const doc = new Y.Doc();
  const writer = createYDocWriter(keyOf(entityId));
  writer?.start(doc, { ...scope, generation: opts.generation ?? 'gen-1' }, false);
  await flushYjsStore();
  let update: Uint8Array = new Uint8Array();
  doc.once('update', (u: Uint8Array) => {
    update = u;
  });
  doc.getText('t').insert(0, text);
  writer?.append(update, opts.unsynced ?? false);
  await flushYjsStore();
  if (opts.unsynced) {
    // A page since closed wrote it: no clean proof of this page clears it.
    await db.yDocUpdates.where('[entityType+entityId]').equals(keyPath(entityId)).modify({ tabId: 'closed-tab' });
  } else {
    await db.yDocUpdates.where('[entityType+entityId]').equals(keyPath(entityId)).modify({ local: 0 });
  }
  doc.destroy();
  await flushYjsStore();
}

/** Mounts one editor's connection, as the host does once it holds a token. */
async function mountConnection(entityId = `doc-${++counter}`) {
  useUserStore.getState().setYjsToken(yjsTokenKey('attachment', entityId), 'token-v1');
  let latest: Hook = null;
  const Harness = () => {
    latest = useYjsConnection(entityId, 'attachment', scope.tenantId, scope.organizationId);
    return null;
  };
  root = createRoot(document.createElement('div'));
  await act(async () => root?.render(createElement(Harness)));
  const provider = providers.at(-1)!;
  return { entityId, provider, state: () => latest, conn: () => findConnection(`attachment:${entityId}`)! };
}

/** The relay announces the document's generation, before every handshake answer. */
const announce = (provider: MockProvider, generation: string) =>
  act(async () => {
    const decoder = decoding.createDecoder(encoding.encode((encoder) => encoding.writeVarString(encoder, generation)));
    provider.messageHandlers[4]?.(undefined, decoder, provider, true, 4);
  });
/** The handshake: a socket opens, Step1 goes out, the relay's Step2 arrives (synced), and this client's Step2 goes out. */
const handshake = (provider: MockProvider, generation = 'gen-1') =>
  act(async () => {
    provider.openSocket();
    provider.sendSync(0);
    const decoder = decoding.createDecoder(encoding.encode((encoder) => encoding.writeVarString(encoder, generation)));
    provider.messageHandlers[4]?.(undefined, decoder, provider, true, 4);
    provider.synced = true;
    provider.emit('sync', true);
    provider.sendSync(1);
  });
const relaySaved = (provider: MockProvider) => act(async () => provider.messageHandlers[5]?.(undefined, undefined, provider, true, 5));
/** A local edit, as the editor makes it; y-websocket sends it at once while connected. */
const editLocally = (provider: MockProvider, text: string) =>
  act(async () => {
    if (provider.wsconnected) provider.sendSync(2);
    provider.doc.getText('t').insert(provider.doc.getText('t').length, text);
  });
const unloadAsks = () => {
  const event = new Event('beforeunload', { cancelable: true });
  window.dispatchEvent(event);
  return event.defaultPrevented;
};
const rows = (entityId: string) => db.yDocUpdates.where('[entityType+entityId]').equals(keyPath(entityId)).toArray();
const settled = async () => {
  await act(async () => {
    await flushYjsStore();
  });
};

describe('yjs connection with the store: loading before connect', () => {
  it('applies a stored document before the provider connects, so the handshake Step1 carries it', async () => {
    await seedStored('stored-1', 'stored text');
    const { provider, conn } = await mountConnection('stored-1');

    await vi.waitFor(() => expect(provider.connect).toHaveBeenCalledOnce());
    expect(provider.textAtConnect).toEqual(['stored text']);
    expect(conn()).toMatchObject({ generation: 'gen-1', loaded: true, ready: true, stored: true });
  });

  it('connects at once with nothing applied for a document never stored (positive control)', async () => {
    const { provider, conn } = await mountConnection();
    await vi.waitFor(() => expect(provider.connect).toHaveBeenCalledOnce());
    expect(provider.textAtConnect).toEqual(['']);
    expect(conn()).toMatchObject({ generation: null, ready: false, stored: false });
  });

  it('connects after 5 s when the load hangs, and applies a late load of the same generation', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    await seedStored('slow-1', 'from disk');
    let open = () => {};
    loadGate = new Promise((resolve) => {
      open = resolve;
    });
    const { provider } = await mountConnection('slow-1');

    await act(async () => vi.advanceTimersByTimeAsync(4_999));
    expect(provider.connect).not.toHaveBeenCalled();
    await act(async () => vi.advanceTimersByTimeAsync(1));
    expect(provider.textAtConnect).toEqual(['']);

    await announce(provider, 'gen-1');
    await act(async () => open());
    await vi.waitFor(() => expect(provider.doc.getText('t').toString()).toBe('from disk'));
  });

  it("must not merge a late load of another generation: its unsynced edits are parked, and the document keeps the relay's", async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    await seedStored('slow-2', 'old history', { unsynced: true });
    let open = () => {};
    loadGate = new Promise((resolve) => {
      open = resolve;
    });
    const { provider, conn } = await mountConnection('slow-2');
    await act(async () => vi.advanceTimersByTimeAsync(5_000));
    await announce(provider, 'gen-2');

    await act(async () => open());
    await vi.waitFor(async () => expect(await db.unsaveableYDocs.count()).toBe(1));

    const [parked] = await db.unsaveableYDocs.toArray();
    expect(parked).toMatchObject({ reason: 'replaced', generation: 'gen-1' });
    expect(await db.yDocs.get(keyPath('slow-2'))).toBeUndefined();
    expect(provider.doc.getText('t').toString()).toBe('');
    expect(conn().generation).toBe('gen-2');
  });
});

describe('yjs connection with the store: generations', () => {
  it('a stored generation equal to the relay’s carries on: no rebuild', async () => {
    await seedStored('gen-same', 'kept');
    const { provider, state } = await mountConnection('gen-same');
    await vi.waitFor(() => expect(provider.connect).toHaveBeenCalled());

    await announce(provider, 'gen-1');
    expect(providers.at(-1)).toBe(provider);
    expect(state()?.rebuilds).toBe(0);
  });

  it('another generation rebuilds; once the fresh document synced it is stored, and unsynced stored edits are parked as replaced', async () => {
    await seedStored('gen-other', 'never saved', { unsynced: true });
    const { provider, state } = await mountConnection('gen-other');
    await vi.waitFor(() => expect(provider.connect).toHaveBeenCalled());
    expect(state()?.unsynced).toBe(true);

    await announce(provider, 'gen-2');
    const next = providers.at(-1)!;
    expect(next).not.toBe(provider);
    expect(state()?.rebuilds).toBe(1);

    // The relay's state of the reseeded document, which its handshake answer applies.
    const reseeded = new Y.Doc();
    reseeded.getText('t').insert(0, 'reseeded');
    await act(async () => Y.applyUpdate(next.doc, Y.encodeStateAsUpdate(reseeded), next));
    await handshake(next, 'gen-2');
    await settled();

    expect(await db.yDocs.get(keyPath('gen-other'))).toMatchObject({ generation: 'gen-2', unsynced: 0 });
    const parked = await db.unsaveableYDocs.toArray();
    expect(parked).toHaveLength(1);
    expect(parked[0]).toMatchObject({ reason: 'replaced', generation: 'gen-1' });
  });

  it('a clean stored copy of the dropped generation goes without a parked row (positive control)', async () => {
    await seedStored('gen-clean', 'synced text');
    const { provider } = await mountConnection('gen-clean');
    await vi.waitFor(() => expect(provider.connect).toHaveBeenCalled());

    await announce(provider, 'gen-2');
    await handshake(providers.at(-1)!, 'gen-2');
    await settled();

    expect((await db.yDocs.get(keyPath('gen-clean')))?.generation).toBe('gen-2');
    expect(await db.unsaveableYDocs.count()).toBe(0);
  });
});

describe('yjs connection with the store: opened for editing', () => {
  it('must not store a warm editor: no focus and no edit, no stored document', async () => {
    const { entityId, provider } = await mountConnection();
    await handshake(provider);
    await settled();
    expect(await db.yDocs.get(keyPath(entityId))).toBeUndefined();
  });

  it('stores the document on the editor’s first focus', async () => {
    const { entityId, provider, state } = await mountConnection();
    await handshake(provider);
    await act(async () => state()?.markStored());
    await settled();
    expect(await db.yDocs.get(keyPath(entityId))).toMatchObject({ generation: 'gen-1', unsynced: 0 });
  });

  it('stores the document on a local edit, with the edit as a local row', async () => {
    const { entityId, provider } = await mountConnection();
    await handshake(provider);
    await editLocally(provider, 'typed');
    await settled();

    expect(await db.yDocs.get(keyPath(entityId))).toMatchObject({ unsynced: 1 });
    expect((await rows(entityId)).map((row) => [row.local, row.tabId])).toEqual([[1, storeTabId]]);
  });

  it('a focus before the first sync waits for it: storing then would keep an empty document', async () => {
    const { entityId, provider, state } = await mountConnection();
    await act(async () => state()?.markStored());
    await settled();
    expect(await db.yDocs.get(keyPath(entityId))).toBeUndefined();

    await handshake(provider);
    await settled();
    expect(await db.yDocs.get(keyPath(entityId))).toBeDefined();
  });
});

describe('yjs connection with the store: proofs', () => {
  it("the relay's Saved for the handshake proves every row the document held as its Step2 went out, a closed tab's included", async () => {
    await seedStored('proof-1', 'offline edit', { unsynced: true });
    const { provider, state } = await mountConnection('proof-1');
    await vi.waitFor(() => expect(state()?.unsynced).toBe(true));
    expect(unloadAsks()).toBe(false);

    await handshake(provider);
    await relaySaved(provider);
    await settled();

    expect(state()?.unsynced).toBe(false);
    expect(await db.yDocs.get(keyPath('proof-1'))).toMatchObject({ unsynced: 0 });
    expect((await rows('proof-1')).every((row) => row.local === 0)).toBe(true);
  });

  it("a connection turned clean proves this tab's rows", async () => {
    const { entityId, provider, state } = await mountConnection();
    await handshake(provider);
    await relaySaved(provider);
    await editLocally(provider, 'typed');
    await settled();
    expect((await db.yDocs.get(keyPath(entityId)))?.unsynced).toBe(1);

    await relaySaved(provider);
    await settled();
    expect(state()?.unsynced).toBe(false);
    expect((await db.yDocs.get(keyPath(entityId)))?.unsynced).toBe(0);
  });
});

describe('yjs connection with the store: the unload guard', () => {
  it('asks only until a stored edit is committed: stored edits survive the tab', async () => {
    const { provider } = await mountConnection();
    await handshake(provider);
    await relaySaved(provider);
    await act(async () => onlineListener?.(false));
    provider.wsconnected = false;

    await editLocally(provider, 'offline');
    expect(unloadAsks()).toBe(true);
    await settled();
    expect(unloadAsks()).toBe(false);
  });

  it('asks for unsynced edits once storing failed for good', async () => {
    const { provider, state } = await mountConnection();
    await handshake(provider);
    await relaySaved(provider);
    await act(async () => state()?.markStored());
    await settled();
    const spy = vi.spyOn(db.yDocUpdates, 'add').mockImplementation(() => {
      throw new DOMException('full', 'QuotaExceededError');
    });
    provider.wsconnected = false;

    await editLocally(provider, 'no room');
    await settled();

    expect(state()?.storageFailed).toBe(true);
    expect(unloadAsks()).toBe(true);
    spy.mockRestore();
  });

  it('asks for unsynced edits with no database (impersonating)', async () => {
    closeLocalUserDb();
    const { provider } = await mountConnection();
    await handshake(provider);
    await relaySaved(provider);
    provider.wsconnected = false;

    await editLocally(provider, 'in memory');
    expect(unloadAsks()).toBe(true);
  });
});

describe('yjs connection with the store: sign-out', () => {
  afterEach(() => {
    useUserStore.setState({ user: null });
  });

  it('leaves the stored edits untouched and lets the connection go: the same user’s next session resumes them', async () => {
    useUserStore.setState({ user: { id: owner } as never });
    const { entityId, provider } = await mountConnection();
    await handshake(provider);
    await relaySaved(provider);
    provider.wsconnected = false;
    await editLocally(provider, 'unsaved');
    await settled();

    // Signed out: the tokens go with the user, and the editor with the page.
    await act(async () => useUserStore.setState({ user: null, yjsTokens: {} }));
    await act(async () => root?.unmount());
    root = undefined;
    await settled();

    expect(provider.destroy).toHaveBeenCalledOnce();
    expect(unloadAsks()).toBe(false);
    expect(await db.yDocs.get(keyPath(entityId))).toMatchObject({ unsynced: 1 });
    expect((await rows(entityId)).filter((row) => row.local === 1)).toHaveLength(1);
  });
});

describe('yjs connection with the store: other tabs', () => {
  /** Another tab of this user, on the app's channel. */
  function otherTab() {
    const received: { t: string; key: string; generation: string; update?: Uint8Array; vector?: Uint8Array; rowId?: number | null }[] = [];
    const channel = new BroadcastChannel(`test:${owner}:ydocs`);
    channel.onmessage = (event) => received.push(event.data);
    return { channel, received };
  }
  /** An edit made in another tab's copy of the document. */
  const peerEdit = (base: Y.Doc, text: string) => {
    const peer = new Y.Doc();
    Y.applyUpdate(peer, Y.encodeStateAsUpdate(base));
    const before = Y.encodeStateVector(peer);
    peer.getText('t').insert(peer.getText('t').length, text);
    return Y.encodeStateAsUpdate(peer, before);
  };

  it('applies an update to a connection of the same document and generation, and ignores another generation’s', async () => {
    await seedStored('tabs-1', 'base ');
    const tab = otherTab();
    const { provider } = await mountConnection('tabs-1');
    await vi.waitFor(() => expect(provider.doc.getText('t').toString()).toBe('base '));

    tab.channel.postMessage({ t: 'update', key: 'attachment:tabs-1', generation: 'gen-2', update: peerEdit(provider.doc, 'stale'), rowId: 1 });
    tab.channel.postMessage({ t: 'update', key: 'attachment:tabs-1', generation: 'gen-1', update: peerEdit(provider.doc, 'peer'), rowId: 2 });

    await vi.waitFor(() => expect(provider.doc.getText('t').toString()).toBe('base peer'));
    tab.channel.close();
  });

  it('must not store again or send an update another tab stored; one whose write failed is stored, not local', async () => {
    await seedStored('tabs-2', 'base ');
    const tab = otherTab();
    const { provider, state, conn } = await mountConnection('tabs-2');
    await vi.waitFor(() => expect(provider.doc.getText('t').toString()).toBe('base '));
    const origins: unknown[] = [];
    provider.doc.on('update', (_update: Uint8Array, origin: unknown) => origins.push(origin));
    const before = (await rows('tabs-2')).length;

    tab.channel.postMessage({ t: 'update', key: 'attachment:tabs-2', generation: 'gen-1', update: peerEdit(provider.doc, 'stored'), rowId: 99 });
    await vi.waitFor(() => expect(provider.doc.getText('t').toString()).toBe('base stored'));
    await settled();
    expect(await rows('tabs-2')).toHaveLength(before);
    expect(conn().applied.ids.has(99)).toBe(true);

    tab.channel.postMessage({ t: 'update', key: 'attachment:tabs-2', generation: 'gen-1', update: peerEdit(provider.doc, '!'), rowId: null });
    await vi.waitFor(() => expect(provider.doc.getText('t').toString()).toBe('base stored!'));
    await settled();
    expect((await rows('tabs-2')).slice(before).map((row) => row.local)).toEqual([0]);

    // Applied with the provider as origin: y-websocket does not send it, and it is no edit of this tab.
    expect(origins).toEqual([provider, provider]);
    expect(state()?.unsynced).toBe(false);
    tab.channel.close();
  });

  it('says hello after a load, and answers a hello with exactly what its vector lacks', async () => {
    await seedStored('tabs-3', 'shared ');
    const tab = otherTab();
    const { provider } = await mountConnection('tabs-3');
    await vi.waitFor(() => expect(tab.received.filter((msg) => msg.t === 'hello')).toHaveLength(1));
    expect(tab.received[0]).toMatchObject({ key: 'attachment:tabs-3', generation: 'gen-1' });

    // Another tab holds only what was stored; this one typed more since.
    const behind = new Y.Doc();
    Y.applyUpdate(behind, Y.encodeStateAsUpdate(provider.doc));
    await editLocally(provider, 'and more');
    tab.channel.postMessage({ t: 'hello', key: 'attachment:tabs-3', generation: 'gen-1', vector: Y.encodeStateVector(behind) });
    tab.channel.postMessage({ t: 'hello', key: 'attachment:tabs-3', generation: 'gen-2', vector: new Uint8Array([0]) });

    await vi.waitFor(() => expect(tab.received.filter((msg) => msg.t === 'update' && msg.rowId === null)).toHaveLength(1));
    const answer = tab.received.find((msg) => msg.t === 'update' && msg.rowId === null)!;
    const known = new Set(Y.decodeUpdate(Y.encodeStateAsUpdate(behind)).structs.map((struct) => struct.id.client));
    expect(Y.decodeUpdate(answer.update!).structs.every((struct) => !known.has(struct.id.client))).toBe(true);
    Y.applyUpdate(behind, answer.update!);
    expect(behind.getText('t').toString()).toBe('shared and more');
    tab.channel.close();
  });
});

describe('yjs connection with the store: boot resume', () => {
  it('opens a background connection that fetches its token, uploads through the handshake, and goes once clean', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'] });
    await seedStored('resume-1', 'typed offline', { unsynced: true });
    const record = (await db.yDocs.get(keyPath('resume-1')))!;
    fetchQuery.mockResolvedValueOnce('token-resume');

    const done = resumeConnection(record);
    await vi.waitFor(() => expect(providers.at(-1)?.connect).toHaveBeenCalled());
    const provider = providers.at(-1)!;
    expect(provider.params.token).toBe('token-resume');
    expect(provider.textAtConnect).toEqual(['typed offline']);

    await handshake(provider);
    await relaySaved(provider);
    await act(async () => vi.advanceTimersByTimeAsync(1_000));
    await done;
    await settled();
    expect(await db.yDocs.get(keyPath('resume-1'))).toMatchObject({ unsynced: 0 });

    // No editor holds it: it goes after the grace period.
    await act(async () => vi.advanceTimersByTimeAsync(30_000));
    expect(provider.destroy).toHaveBeenCalledOnce();
  });
});
