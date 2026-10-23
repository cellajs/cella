// @vitest-environment jsdom
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
const appendToServer = async ({ body }: { body: { update: string; generation: string } }) => {
  const update = fromBase64url(body.update);
  server.pushes.push(update);
  Y.applyUpdate(server.doc, update);
  return { status: 'appended' as const };
};
const pushYjsUpdate = vi.fn(appendToServer);
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
    query: vi.fn(),
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
  wsSyncDeadlineMs: 5_000,
  createHttpLink: (...args: Parameters<typeof import('~/modules/common/blocknote/yjs-http').createHttpLink>) => {
    linked.push(args[0]);
    if (!http) throw new Error('the HTTP link module is not loaded');
    return http.createHttpLink(...args);
  },
}));
http = await vi.importActual<typeof import('~/modules/common/blocknote/yjs-http')>('~/modules/common/blocknote/yjs-http');
const { httpChunkBytes } = http;
const { ApiError } = await import('~/lib/api');
const { userStore, yjsTokenKey } = await import('~/modules/user/user-store');
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
  userStore.getState().setYjsToken(yjsTokenKey('attachment', entityId), 'token-v1');
  let latest: ReturnType<typeof useYjsConnection> = null;
  const Harness = () => {
    latest = useYjsConnection({ entityType: 'attachment', entityId, tenantId: 'tenant-1', organizationId: 'org-1', enabled: true });
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
});

describe('yjs over HTTP: the ledger', () => {
  it("must not report clean or prove rows before the server's 200: the handshake post proves them, and each later post holds unsynced until its own", async () => {
    const { provider, doc, state } = await mountConnection();
    await act(async () => provider.openSocket());
    await edit(doc, 'typed while the relay was down');
    const handshake = deferred<void>();
    pushYjsUpdate.mockImplementationOnce(async (options) => {
      await handshake.promise;
      return appendToServer(options);
    });

    await advance(5_000);
    expect(pushYjsUpdate).toHaveBeenCalledOnce();
    expect(writer.prove).not.toHaveBeenCalled();
    expect(state()?.unsynced).toBe(true);

    await act(async () => handshake.resolve());
    expect(server.doc.getText('t').toString()).toBe(doc.getText('t').toString());
    expect(writer.prove).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'handshake', applied: { upTo: 0, ids: new Set() }, vector: expect.any(Uint8Array) }),
    );
    // Turning clean proves this tab's own rows too.
    expect(writer.prove).toHaveBeenLastCalledWith({ kind: 'clean' });
    expect(state()?.unsynced).toBe(false);

    const later = deferred<void>();
    pushYjsUpdate.mockImplementationOnce(async (options) => {
      await later.promise;
      return appendToServer(options);
    });
    await edit(doc, ' and later');
    await advance(500);
    expect(pushYjsUpdate).toHaveBeenCalledTimes(2);
    expect(state()?.unsynced).toBe(true);

    await act(async () => later.resolve());
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

  it('must not drop or retry edits the routes refuse for good: each final answer parks them under the reason it names', async () => {
    const answers = [
      [refusal(404), 'deleted'],
      [refusal(403), 'denied'],
      [refusal(400), 'refused'],
      [refusal(409, { generation: 'gen-2' }), 'replaced'],
    ] as const;

    for (const [error, reason] of answers) {
      pushYjsUpdate.mockClear();
      writer.park.mockClear();
      const { doc } = await refusedEdit(error);
      await advance(120_000);

      expect(writer.park, reason).toHaveBeenCalledExactlyOnceWith(reason, doc);
      expect(pushYjsUpdate, reason).toHaveBeenCalledOnce();
      await act(async () => root?.unmount());
      root = undefined;
    }
  });

  it('pulls on a 409 with no document, which seeds it, then posts again', async () => {
    const { state } = await refusedEdit(refusal(409, { generation: null }));

    expect(pullYjsDocument).toHaveBeenCalledTimes(2);
    expect(pushYjsUpdate).toHaveBeenCalledTimes(2);
    expect(server.doc.getText('t').toString()).toBe('stored. edit');
    expect(state()?.unsynced).toBe(false);
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
});

describe('yjs over HTTP: chunks', () => {
  it('must not post more than 512 KB at once: a backlog goes as batches then a final diff, and an edit over it waits for the socket', async () => {
    const { provider, doc, state } = await mountConnection();
    await enterHttp(provider);

    // Offline, the edits wait for the next handshake.
    await act(async () => onlineListener?.(false));
    for (let i = 0; i < 3; i++) await edit(doc, String(i).repeat(200_000));
    await act(async () => onlineListener?.(true));
    await enterHttp(provider);

    expect(server.pushes).toHaveLength(3);
    expect(server.doc.getText('t').toString()).toBe(doc.getText('t').toString());
    expect(state()?.unsynced).toBe(false);

    // One edit over the cap cannot go over HTTP at all: the socket saves it.
    await edit(doc, 'x'.repeat(httpChunkBytes + 1));
    await advance(2_000);
    expect(server.pushes).toHaveLength(3);
    expect(state()?.unsynced).toBe(true);

    await socketHandshake(provider);
    expect(state()?.transport).toBe('ws');
    expect(state()?.unsynced).toBe(false);
    expect(server.pushes.every((update) => update.length <= httpChunkBytes)).toBe(true);
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
});

describe('yjs over HTTP: back to the socket', () => {
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
