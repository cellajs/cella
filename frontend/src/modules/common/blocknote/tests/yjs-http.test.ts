// @vitest-environment jsdom
import * as encoding from 'lib0/encoding';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as Y from 'yjs';
import type { YjsConnection } from '~/modules/common/blocknote/yjs-connections';

/** The browser socket the provider's WebSocket polyfill extends; it records what it sends. */
class FakeSocket {
  static readonly OPEN = 1;
  readonly OPEN = 1;
  readyState = 1;
  send(_data: Uint8Array) {}
  close() {}
}
vi.stubGlobal('WebSocket', FakeSocket);

class MockAwareness {
  destroy = vi.fn();
}

/** y-websocket's provider on a real document: no socket opens, and a test drives its attempts, syncs and frames. */
class MockProvider {
  params: Record<string, string>;
  synced = false;
  wsconnected = false;
  ws: FakeSocket | null = null;
  doc: Y.Doc;
  private socketClass: new (
    url: string,
  ) => FakeSocket;
  messageHandlers: ((encoder: unknown, decoder: unknown, provider: unknown, emitSynced: boolean, type: number) => void)[] = [() => {}];
  private listeners = new Map<string, Set<(...args: unknown[]) => void>>();

  constructor(_url: string, _room: string, doc: Y.Doc, opts: { params: Record<string, string>; WebSocketPolyfill: new (url: string) => FakeSocket }) {
    this.params = { ...opts.params };
    this.doc = doc;
    this.socketClass = opts.WebSocketPolyfill;
    providers.push(this);
  }

  /** A connection attempt that opens, as y-websocket makes it: a new socket, 'connecting', then 'connected'. */
  openSocket() {
    this.ws = new this.socketClass('ws://relay');
    this.emit('status', { status: 'connecting' });
    this.wsconnected = true;
    this.emit('status', { status: 'connected' });
  }
  /** The socket closes; y-websocket resets `synced` with it. */
  dropSocket() {
    this.ws = null;
    this.wsconnected = false;
    this.synced = false;
    this.emit('sync', false);
    this.emit('status', { status: 'disconnected' });
  }
  /** A sync frame y-websocket sends: a Step1 (0), Step2 (1) or Update (2). */
  sendSync(subtype: number) {
    this.ws?.send(new Uint8Array([0, subtype, 0]));
  }
  /** The relay's answer to the handshake, after which y-websocket reports the document synced. */
  receiveStep2() {
    this.synced = true;
    this.emit('sync', true);
  }

  on(event: string, cb: (...args: unknown[]) => void) {
    if (!this.listeners.has(event)) this.listeners.set(event, new Set());
    this.listeners.get(event)?.add(cb);
  }
  off(event: string, cb: (...args: unknown[]) => void) {
    this.listeners.get(event)?.delete(cb);
  }
  emit(event: string, ...args: unknown[]) {
    for (const cb of this.listeners.get(event) ?? []) cb(...args);
  }

  connect = vi.fn();
  disconnect = vi.fn();
  destroy = vi.fn();
}
const providers: MockProvider[] = [];

let onlineListener: ((online: boolean) => void) | undefined;
let online = true;
const warning = vi.fn();

const base64url = (bytes: Uint8Array) => Buffer.from(bytes).toString('base64url');
const fromBase64url = (text: string) => new Uint8Array(Buffer.from(text, 'base64url'));

/** The server's copy of the document, which the mocked routes read and append to, and what each push carried. */
const server = { doc: new Y.Doc(), generation: 'gen-1', pushes: [] as Uint8Array[] };
const pullYjsDocument = vi.fn(async ({ body }: { body: { stateVector: string } }) => ({
  generation: server.generation,
  update: base64url(Y.encodeStateAsUpdate(server.doc, fromBase64url(body.stateVector))),
  stateVector: base64url(Y.encodeStateVector(server.doc)),
}));
const pushYjsUpdate = vi.fn(async ({ body }: { body: { update: string; generation: string } }) => {
  const update = fromBase64url(body.update);
  server.pushes.push(update);
  Y.applyUpdate(server.doc, update);
  return { status: 'appended' as const };
});
vi.mock('sdk', () => ({
  getYjsToken: vi.fn(),
  pullYjsDocument: (options: { body: { stateVector: string } }) => pullYjsDocument(options),
  pushYjsUpdate: (options: { body: { update: string; generation: string } }) => pushYjsUpdate(options),
}));

vi.mock('y-websocket', () => ({ WebsocketProvider: MockProvider }));
vi.mock('y-protocols/awareness', () => ({ Awareness: MockAwareness }));
vi.mock('~/modules/common/toaster/toaster', () => ({ toaster: { warning: (...args: unknown[]) => warning(...args) } }));
vi.mock('i18next', () => ({ default: { t: (k: string) => k }, t: (k: string) => k }));
vi.mock('shared', () => ({ appConfig: { yjsUrl: 'http://localhost:1234' } }));
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
    fetchQuery: vi.fn(),
    getQueryCache: () => ({ find: () => ({ getObserversCount: () => 1 }) }),
    getQueryState: () => ({ error: null }),
  },
}));
vi.mock('~/modules/common/blocknote/yjs-resync', () => ({ watchPendingStructs: () => () => {} }));
vi.mock('~/env', () => ({ isDebugMode: false }));

// The real link, recording the connection each one is built for, so a test can hand it a writer.
const linked: YjsConnection[] = [];
let http: typeof import('~/modules/common/blocknote/yjs-http') | undefined;
vi.mock('~/modules/common/blocknote/yjs-http', () => ({
  WS_SYNC_DEADLINE_MS: 5_000,
  createHttpLink: (...args: Parameters<typeof import('~/modules/common/blocknote/yjs-http').createHttpLink>) => {
    linked.push(args[0]);
    if (!http) throw new Error('the HTTP link module is not loaded');
    return http.createHttpLink(...args);
  },
}));
http = await vi.importActual<typeof import('~/modules/common/blocknote/yjs-http')>('~/modules/common/blocknote/yjs-http');
const { HTTP_CHUNK_BYTES, batchUpdates } = http;
const { ApiError } = await import('~/lib/api');
const { useUserStore, yjsTokenKey } = await import('~/modules/user/user-store');
const { useYjsConnection } = await import('~/modules/common/blocknote/yjs-connections');

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/** The store's writer, as the connection calls it: the proofs it hands on and the documents it parks. */
const writer = {
  start: vi.fn(),
  append: vi.fn(),
  prove: vi.fn(async () => {}),
  park: vi.fn(async () => {}),
  drop: vi.fn(async () => {}),
  failed: false,
  pending: false,
};

let root: Root | undefined;
let counter = 0;
let visibility: DocumentVisibilityState = 'visible';
Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => visibility });

/** Mounts one editor's connection, stored with the mock writer; returns its provider, document and latest hook state. */
async function mountConnection() {
  const entityId = `doc-${++counter}`;
  useUserStore.getState().setYjsToken(yjsTokenKey('attachment', entityId), 'token-v1');
  let latest: ReturnType<typeof useYjsConnection> = null;
  const Harness = () => {
    latest = useYjsConnection(entityId, 'attachment', 'tenant-1', 'org-1');
    return null;
  };
  root = createRoot(document.createElement('div'));
  await act(async () => root?.render(createElement(Harness)));
  const provider = providers.at(-1);
  const conn = linked.at(-1);
  if (!provider || !conn) throw new Error('no connection opened');
  conn.writer = writer;
  return { provider, conn, doc: provider.doc, state: () => latest };
}

const advance = (ms: number) => act(() => vi.advanceTimersByTimeAsync(ms));

/** A socket attempt that never syncs, run out to the deadline: HTTP takes over. */
async function enterHttp(provider: MockProvider) {
  await act(async () => provider.openSocket());
  await advance(5_000);
}

/** A local edit, as the editor makes it: an update whose origin is not the provider. */
const edit = (doc: Y.Doc, text: string) => act(async () => doc.getText('t').insert(doc.getText('t').length, text));

/** The socket's full handshake, saved by the relay: the ledger proves the whole document by itself. */
const socketHandshake = (provider: MockProvider) =>
  act(async () => {
    provider.openSocket();
    provider.sendSync(0);
    provider.receiveStep2();
    provider.sendSync(1);
    provider.messageHandlers[5]?.(undefined, undefined, provider, true, 5);
  });

const refusal = (status: 400 | 403 | 404 | 409 | 429 | 503, meta?: Record<string, string | null>) => new ApiError({ status, type: 'refused', meta });

/** A promise a test settles by hand: a request in flight. */
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

beforeEach(() => {
  vi.useFakeTimers();
  online = true;
  visibility = 'visible';
  server.doc = new Y.Doc();
  server.doc.getText('t').insert(0, 'stored. ');
  server.generation = 'gen-1';
  server.pushes = [];
  pullYjsDocument.mockClear();
  pushYjsUpdate.mockClear();
  warning.mockClear();
  for (const fn of [writer.append, writer.prove, writer.park]) fn.mockClear();
});

afterEach(async () => {
  await act(async () => root?.unmount());
  root = undefined;
  vi.useRealTimers();
});

describe('yjs over HTTP: the switch', () => {
  it('must not leave the relay out of reach unsynced: no sync 5 s after the socket started, while online, pulls, then runs over HTTP', async () => {
    const { provider, conn, doc, state } = await mountConnection();
    await act(async () => provider.openSocket());

    await advance(4_999);
    expect(pullYjsDocument).not.toHaveBeenCalled();
    expect(state()?.ready).toBe(false);

    await advance(1);
    expect(pullYjsDocument).toHaveBeenCalledOnce();
    expect(state()?.transport).toBe('http');
    expect(state()?.ready).toBe(true);
    // The pull is the handshake's answer: the server's document and its generation.
    expect(doc.getText('t').toString()).toBe('stored. ');
    expect(conn.generation).toBe('gen-1');
    expect(writer.append).toHaveBeenCalledWith(expect.any(Uint8Array), false, undefined);
  });

  it('does not pull while offline: the deadline waits until the browser is back and the socket starts again', async () => {
    const { provider, state } = await mountConnection();
    await act(async () => provider.openSocket());
    await act(async () => onlineListener?.(false));

    await advance(30_000);
    expect(pullYjsDocument).not.toHaveBeenCalled();
    expect(state()?.transport).toBe('none');

    online = true;
    await act(async () => onlineListener?.(true));
    expect(provider.connect).toHaveBeenCalled();
    await enterHttp(provider);
    expect(pullYjsDocument).toHaveBeenCalledOnce();
    expect(state()?.transport).toBe('http');
  });

  it('does not switch when the socket syncs in time (positive control)', async () => {
    const { provider, state } = await mountConnection();
    await act(async () => provider.openSocket());
    await advance(4_000);
    await act(async () => provider.receiveStep2());

    await advance(30_000);
    expect(pullYjsDocument).not.toHaveBeenCalled();
    expect(state()?.transport).toBe('ws');
    expect(state()?.ready).toBe(true);
  });

  it('takes over again when a socket lost mid-session has not synced 5 s after its reconnect started', async () => {
    const { provider, state } = await mountConnection();
    await act(async () => provider.openSocket());
    await act(async () => provider.receiveStep2());
    await act(async () => provider.dropSocket());

    await enterHttp(provider);
    expect(pullYjsDocument).toHaveBeenCalledOnce();
    expect(state()?.transport).toBe('http');
  });

  it("names the document's generation from the pull: the socket announcing the same one later keeps the document", async () => {
    const { provider, state } = await mountConnection();
    await enterHttp(provider);

    const frame = encoding.createEncoder();
    encoding.writeVarString(frame, 'gen-1');
    const { createDecoder } = await import('lib0/decoding');
    await act(async () => provider.messageHandlers[4]?.(undefined, createDecoder(encoding.toUint8Array(frame)), provider, true, 4));
    await act(async () => provider.receiveStep2());

    expect(providers.at(-1)).toBe(provider);
    expect(state()?.rebuilds).toBe(0);
    expect(state()?.transport).toBe('ws');
  });
});

describe('yjs over HTTP: the ledger', () => {
  it("proves the handshake with its post's 200: the server then holds the document, and the stored rows it covered are cleared", async () => {
    const { provider, doc, state } = await mountConnection();
    await act(async () => provider.openSocket());
    await edit(doc, 'typed while the relay was down');
    expect(state()?.unsynced).toBe(true);

    await advance(5_000);
    expect(pushYjsUpdate).toHaveBeenCalledOnce();
    expect(server.doc.getText('t').toString()).toBe(doc.getText('t').toString());
    expect(writer.prove).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'handshake', applied: { upTo: 0, ids: new Set() }, vector: expect.any(Uint8Array) }),
    );
    // Turning clean proves this tab's own rows too.
    expect(writer.prove).toHaveBeenLastCalledWith({ kind: 'clean' });
    expect(state()?.unsynced).toBe(false);
  });

  it('proves a clean document at once, with no post (positive control)', async () => {
    const { provider, state } = await mountConnection();
    await enterHttp(provider);

    expect(pushYjsUpdate).not.toHaveBeenCalled();
    expect(writer.prove).not.toHaveBeenCalled();
    expect(state()?.unsynced).toBe(false);
  });

  it('debounces local edits into one post, whose 200 turns the document clean', async () => {
    const { provider, doc, state } = await mountConnection();
    await enterHttp(provider);

    await edit(doc, 'one ');
    await advance(300);
    await edit(doc, 'two');
    expect(state()?.unsynced).toBe(true);
    await advance(499);
    expect(pushYjsUpdate).not.toHaveBeenCalled();

    await advance(1);
    expect(pushYjsUpdate).toHaveBeenCalledOnce();
    expect(server.doc.getText('t').toString()).toBe('stored. one two');
    expect(state()?.unsynced).toBe(false);
  });

  it('posts within 2 s while edits keep coming', async () => {
    const { provider, doc } = await mountConnection();
    await enterHttp(provider);

    for (let i = 0; i < 5; i++) {
      await edit(doc, `${i}`);
      await advance(400);
    }
    expect(pushYjsUpdate).toHaveBeenCalledOnce();
    expect(server.doc.getText('t').toString()).toBe('stored. 01234');
  });

  it('must not report clean while a post is in flight', async () => {
    const { provider, doc, state } = await mountConnection();
    await enterHttp(provider);
    const answer = deferred<{ status: 'appended' }>();
    pushYjsUpdate.mockImplementationOnce(() => answer.promise);

    await edit(doc, 'edit');
    await advance(500);
    expect(pushYjsUpdate).toHaveBeenCalledOnce();
    expect(state()?.unsynced).toBe(true);

    await act(async () => answer.resolve({ status: 'appended' }));
    expect(state()?.unsynced).toBe(false);
  });
});

describe('yjs over HTTP: final answers', () => {
  /** HTTP mode with one unsaved edit, whose post the given answer refuses. */
  async function refusedEdit(error: unknown) {
    const mounted = await mountConnection();
    await enterHttp(mounted.provider);
    pushYjsUpdate.mockRejectedValueOnce(error);
    await edit(mounted.doc, 'edit');
    await advance(500);
    return mounted;
  }

  it('must not post into a reseeded document: a 409 with another generation rebuilds the connection on a fresh document', async () => {
    const { provider, state } = await refusedEdit(refusal(409, { generation: 'gen-2' }));

    expect(provider.destroy).toHaveBeenCalledOnce();
    expect(providers.at(-1)).not.toBe(provider);
    expect(state()?.rebuilds).toBe(1);
    expect(state()?.ready).toBe(false);
    expect(state()?.transport).toBe('none');
  });

  it('pulls on a 409 with no document, which seeds it, then posts again', async () => {
    const { state } = await refusedEdit(refusal(409, { generation: null }));

    expect(pullYjsDocument).toHaveBeenCalledTimes(2);
    expect(pushYjsUpdate).toHaveBeenCalledTimes(2);
    expect(server.doc.getText('t').toString()).toBe('stored. edit');
    expect(state()?.unsynced).toBe(false);
  });

  it('must not drop unsaved edits of a deleted entity (404): they are parked, and the connection ends as deleted', async () => {
    const { conn, state } = await refusedEdit(refusal(404));

    expect(writer.park).toHaveBeenCalledExactlyOnceWith('deleted', conn.yDoc);
    expect(state()?.deleted).toBe(true);
    expect(state()?.stopped).toBe(true);
  });

  it('must not drop unsaved edits once edit rights are gone (403): they are parked, and the connection stops as denied', async () => {
    const { conn, provider, state } = await refusedEdit(refusal(403));

    expect(writer.park).toHaveBeenCalledExactlyOnceWith('denied', conn.yDoc);
    expect(state()?.stopped).toBe(true);
    expect(state()?.stopReason).toBe('denied');
    expect(provider.disconnect).toHaveBeenCalledOnce();
  });

  it('must not retry an update the routes refuse (400): it is parked, and the connection stops as refused', async () => {
    const { conn, state } = await refusedEdit(refusal(400));

    expect(writer.park).toHaveBeenCalledExactlyOnceWith('refused', conn.yDoc);
    expect(state()?.stopReason).toBe('refused');
    await advance(120_000);
    expect(pushYjsUpdate).toHaveBeenCalledOnce();
  });

  it('parks nothing for a clean document whose pull is refused (positive control)', async () => {
    const { provider, state } = await mountConnection();
    await enterHttp(provider);
    pullYjsDocument.mockRejectedValueOnce(refusal(403));

    await advance(10_000);
    expect(writer.park).not.toHaveBeenCalled();
    expect(state()?.stopReason).toBe('denied');
  });

  it('backs off on 429 and 5xx: the post goes again after 1 s, then 2 s, and the status stays', async () => {
    const { provider, doc, state } = await mountConnection();
    await enterHttp(provider);
    pushYjsUpdate.mockRejectedValueOnce(refusal(429)).mockRejectedValueOnce(refusal(503));

    await edit(doc, 'edit');
    await advance(500);
    expect(pushYjsUpdate).toHaveBeenCalledTimes(1);
    await advance(999);
    expect(pushYjsUpdate).toHaveBeenCalledTimes(1);
    await advance(1);
    expect(pushYjsUpdate).toHaveBeenCalledTimes(2);
    await advance(2_000);
    expect(pushYjsUpdate).toHaveBeenCalledTimes(3);
    expect(state()?.unsynced).toBe(false);
    expect(state()?.stopped).toBe(false);
  });

  it('retries the entering pull with backoff while the API fails, and stays not ready meanwhile', async () => {
    const { provider, state } = await mountConnection();
    pullYjsDocument.mockRejectedValueOnce(refusal(503));

    await enterHttp(provider);
    expect(pullYjsDocument).toHaveBeenCalledOnce();
    expect(state()?.ready).toBe(false);
    await advance(1_000);
    expect(pullYjsDocument).toHaveBeenCalledTimes(2);
    expect(state()?.transport).toBe('http');
  });
});

describe('yjs over HTTP: chunks', () => {
  const insertUpdate = (size: number) => {
    const scratch = new Y.Doc();
    let update: Uint8Array = new Uint8Array();
    scratch.on('update', (u: Uint8Array) => {
      update = u;
    });
    scratch.getText('t').insert(0, 'x'.repeat(size));
    return update;
  };

  it('batches consecutive updates into posts under the cap, and leaves out one over it', () => {
    const small = insertUpdate(200_000);
    const big = insertUpdate(HTTP_CHUNK_BYTES + 1);
    const { batches, oversize } = batchUpdates([small, small, big, small]);

    expect(oversize).toBe(1);
    expect(batches).toHaveLength(2);
    expect(batches.every((batch) => batch.length <= HTTP_CHUNK_BYTES)).toBe(true);
  });

  it('must not post more than 512 KB at once: a backlog over it goes as batches of its edits, then a final diff', async () => {
    const { provider, doc, state } = await mountConnection();
    await enterHttp(provider);

    // Offline, the edits wait for the next handshake.
    await act(async () => onlineListener?.(false));
    for (let i = 0; i < 3; i++) await edit(doc, String(i).repeat(200_000));
    await act(async () => onlineListener?.(true));
    await enterHttp(provider);

    expect(server.pushes).toHaveLength(3);
    expect(server.pushes.every((update) => update.length <= HTTP_CHUNK_BYTES)).toBe(true);
    // The batches, then a pull for the server's vector, before the final diff.
    expect(pullYjsDocument).toHaveBeenCalledTimes(3);
    expect(server.doc.getText('t').toString()).toBe(doc.getText('t').toString());
    expect(state()?.unsynced).toBe(false);
  });

  it('must not post an edit over 512 KB: it waits for the socket, which saves it', async () => {
    const { provider, doc, state } = await mountConnection();
    await enterHttp(provider);

    await edit(doc, 'x'.repeat(HTTP_CHUNK_BYTES + 1));
    await advance(2_000);
    expect(pushYjsUpdate).not.toHaveBeenCalled();
    expect(state()?.unsynced).toBe(true);

    await socketHandshake(provider);
    expect(state()?.transport).toBe('ws');
    expect(state()?.unsynced).toBe(false);
  });

  it('holds a handshake over 512 KB with no edits to batch: nothing is posted, and the document waits for the socket', async () => {
    const { provider, doc, state } = await mountConnection();
    await act(async () => provider.openSocket());
    await edit(doc, 'x'.repeat(HTTP_CHUNK_BYTES + 1));

    await advance(5_000);
    expect(state()?.transport).toBe('http');
    expect(pushYjsUpdate).not.toHaveBeenCalled();
    expect(state()?.unsynced).toBe(true);
  });
});

describe('yjs over HTTP: pulls', () => {
  it("pulls peers' edits every 10 s while an editor holds the connection and the tab is visible", async () => {
    const { provider, doc } = await mountConnection();
    await enterHttp(provider);
    expect(pullYjsDocument).toHaveBeenCalledTimes(1);

    server.doc.getText('t').insert(server.doc.getText('t').length, 'from a peer');
    await advance(10_000);
    expect(pullYjsDocument).toHaveBeenCalledTimes(2);
    expect(doc.getText('t').toString()).toBe('stored. from a peer');

    visibility = 'hidden';
    await advance(30_000);
    expect(pullYjsDocument).toHaveBeenCalledTimes(2);

    // Back in view: a pull at once, then the cadence again.
    visibility = 'visible';
    await act(async () => document.dispatchEvent(new Event('visibilitychange')));
    expect(pullYjsDocument).toHaveBeenCalledTimes(3);
  });

  it('pulls on focus, at most every 2 s', async () => {
    const { provider } = await mountConnection();
    await enterHttp(provider);
    await advance(2_000);

    await act(async () => window.dispatchEvent(new Event('focus')));
    expect(pullYjsDocument).toHaveBeenCalledTimes(2);
    await advance(1_000);
    await act(async () => window.dispatchEvent(new Event('focus')));
    expect(pullYjsDocument).toHaveBeenCalledTimes(2);
    await advance(1_000);
    await act(async () => window.dispatchEvent(new Event('focus')));
    expect(pullYjsDocument).toHaveBeenCalledTimes(3);
  });

  it('pulls nothing for a connection no editor holds, which stays only to post its edits', async () => {
    const { provider, doc } = await mountConnection();
    await enterHttp(provider);
    const answer = deferred<{ status: 'appended' }>();
    pushYjsUpdate.mockImplementationOnce(() => answer.promise);
    await edit(doc, 'edit');
    await advance(500);

    await act(async () => root?.unmount());
    root = undefined;
    await advance(60_000);
    expect(pullYjsDocument).toHaveBeenCalledTimes(1);
    expect(provider.destroy).not.toHaveBeenCalled();

    // Its post's 200 turns it clean, and it goes.
    await act(async () => answer.resolve({ status: 'appended' }));
    expect(provider.destroy).toHaveBeenCalledOnce();
  });
});

describe('yjs over HTTP: back to the socket', () => {
  it("hands back at the socket's first sync: pulls stop, and the handshake post in flight still proves its rows", async () => {
    const { provider, doc, state } = await mountConnection();
    await act(async () => provider.openSocket());
    await edit(doc, 'edit');
    const answer = deferred<{ status: 'appended' }>();
    pushYjsUpdate.mockImplementationOnce(() => answer.promise);
    await advance(5_000);
    expect(state()?.transport).toBe('http');
    expect(pushYjsUpdate).toHaveBeenCalledOnce();

    await act(async () => provider.receiveStep2());
    expect(state()?.transport).toBe('ws');
    await advance(30_000);
    expect(pullYjsDocument).toHaveBeenCalledOnce();

    await act(async () => answer.resolve({ status: 'appended' }));
    expect(writer.prove).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ kind: 'handshake' }));
    expect(pushYjsUpdate).toHaveBeenCalledOnce();
  });

  it("must not retry a post that failed after the switch: unsynced stays with the socket's ledger until the relay saves", async () => {
    const { provider, doc, state } = await mountConnection();
    await act(async () => provider.openSocket());
    await edit(doc, 'edit');
    const answer = deferred<{ status: 'appended' }>();
    pushYjsUpdate.mockImplementationOnce(() => answer.promise);
    await advance(5_000);

    await act(async () => provider.dropSocket());
    await act(async () => {
      provider.openSocket();
      provider.sendSync(0);
      provider.receiveStep2();
      provider.sendSync(1);
    });
    // Within the socket ledger's 10 s wait for a first `Saved`, past several retry delays.
    await act(async () => answer.reject(refusal(503)));
    await advance(9_000);
    expect(pushYjsUpdate).toHaveBeenCalledOnce();
    expect(writer.prove).not.toHaveBeenCalled();
    expect(state()?.unsynced).toBe(true);

    await act(async () => provider.messageHandlers[5]?.(undefined, undefined, provider, true, 5));
    expect(state()?.unsynced).toBe(false);
  });

  it('must not disconnect the provider or remount the editor across ws, http and ws again', async () => {
    const { provider, state } = await mountConnection();
    await act(async () => provider.openSocket());
    await act(async () => provider.receiveStep2());
    const { awareness, fragment } = state() ?? {};

    await act(async () => provider.dropSocket());
    await enterHttp(provider);
    expect(state()?.transport).toBe('http');
    await act(async () => provider.receiveStep2());
    expect(state()?.transport).toBe('ws');

    expect(provider.disconnect).not.toHaveBeenCalled();
    expect(provider.destroy).not.toHaveBeenCalled();
    expect(providers.at(-1)).toBe(provider);
    expect(state()?.awareness).toBe(awareness);
    expect(state()?.fragment).toBe(fragment);
    expect(state()?.rebuilds).toBe(0);
  });
});
