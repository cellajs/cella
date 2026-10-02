// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/** The browser socket the provider's WebSocket polyfill extends; it records what it sends. */
class FakeSocket {
  static readonly OPEN = 1;
  readonly OPEN = 1;
  readyState = 1;
  frames: Uint8Array[] = [];
  send(data: Uint8Array) {
    this.frames.push(data);
  }
  close() {}
}
vi.stubGlobal('WebSocket', FakeSocket);

/** The connection's Awareness; the provider is handed it and creates none of its own. */
class MockAwareness {
  constructor(readonly doc: MockDoc) {}
  destroy = vi.fn();
}

interface ProviderOpts {
  params: Record<string, string>;
  WebSocketPolyfill: new (url: string) => FakeSocket;
  awareness?: MockAwareness;
  connect?: boolean;
  disableBc?: boolean;
}

class MockProvider {
  params: Record<string, string>;
  opts: ProviderOpts;
  awareness: MockAwareness | undefined;
  shouldConnect: boolean;
  synced = false;
  wsconnected = false;
  ws: FakeSocket | null = null;
  doc: MockDoc;
  /** The socket class y-websocket opens each connection attempt with. */
  private socketClass: new (
    url: string,
  ) => FakeSocket;
  /** y-websocket's own sync handler, which applies a sync frame to the document. */
  readSync = vi.fn();
  /** Message type → handler, as y-websocket keeps them per provider: sync is type 0, the relay's generation frame 4, `Saved` 5. */
  messageHandlers: ((encoder: unknown, decoder: unknown, provider: unknown, emitSynced: boolean, type: number) => void)[] = [this.readSync];
  private listeners = new Map<string, Set<(...args: unknown[]) => void>>();

  constructor(_url: string, _room: string, doc: MockDoc, opts: ProviderOpts) {
    this.opts = opts;
    this.params = { ...opts.params };
    this.awareness = opts.awareness;
    this.shouldConnect = opts.connect ?? true;
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
    this.emit('status', { status: 'disconnected' });
  }
  /** A sync frame y-websocket sends: a Step1 (0), Step2 (1) or Update (2). */
  sendSync(subtype: number) {
    this.ws?.send(new Uint8Array([0, subtype, 0]));
  }
  /** The relay's answer to the handshake: its Step2, after which y-websocket reports the document synced. */
  receiveStep2() {
    this.synced = true;
    this.emit('sync', true);
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
    this.shouldConnect = true;
  });
  disconnect = vi.fn(() => {
    this.shouldConnect = false;
  });
  destroy = vi.fn();
}
const providers: MockProvider[] = [];

let onlineListener: ((online: boolean) => void) | undefined;
/** What onlineManager reports as a connection opens. */
let online = true;
const warning = vi.fn();
const invalidateQueries = vi.fn();
const fetchQuery = vi.fn();
/** Observers of the token query: an open editor holds one. */
let tokenObservers = 1;
/** The error the token query last failed with: the token route's answer, which says why a token was withdrawn. */
let tokenError: { status: number } | null = null;

/** A document that records its `update` listener, so a test can make a local edit. */
class MockDoc {
  onUpdate: ((update: Uint8Array, origin: unknown) => void) | undefined;
  getXmlFragment = () => ({});
  on = (_event: string, cb: (update: Uint8Array, origin: unknown) => void) => {
    this.onUpdate = cb;
  };
  destroy = vi.fn();
}

/** As Yjs applies an update: the document's `update` listeners run synchronously, with the origin given. */
const applyUpdate = (doc: MockDoc, update: Uint8Array, origin: unknown) => doc.onUpdate?.(update, origin);
vi.mock('y-websocket', () => ({ WebsocketProvider: MockProvider }));
vi.mock('y-protocols/awareness', () => ({ Awareness: MockAwareness }));
vi.mock('yjs', () => ({ Doc: MockDoc, applyUpdate, default: { Doc: MockDoc, applyUpdate } }));
// The generation frame's decoder stands in for the string it carries.
vi.mock('lib0/decoding', async (importOriginal) => ({
  ...(await importOriginal<typeof import('lib0/decoding')>()),
  readVarString: (decoder: unknown) => decoder,
}));
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
    invalidateQueries: (...args: unknown[]) => invalidateQueries(...args),
    fetchQuery: (...args: unknown[]) => fetchQuery(...args),
    getQueryCache: () => ({ find: () => ({ getObserversCount: () => tokenObservers }) }),
    getQueryState: () => ({ error: tokenError }),
  },
}));
vi.mock('~/modules/common/blocknote/query', () => ({
  yjsTokenKeys: { entity: (...key: unknown[]) => key },
  yjsTokenQueryOptions: (params: unknown) => ({ params }),
  // As the token route answers: 404 for a deleted entity, 403 for one the caller may not edit.
  yjsTokenRefusal: (error: { status: number } | null) => (error?.status === 404 ? 'deleted' : error?.status === 403 ? 'refused' : null),
}));
vi.mock('~/modules/common/blocknote/yjs-resync', () => ({ watchPendingStructs: () => () => {} }));
vi.mock('~/env', () => ({ isDebugMode: false }));
// The API never answers here, so the socket alone syncs; yjs-http.test.ts covers the HTTP link.
vi.mock('~/modules/common/blocknote/yjs-http', () => ({
  WS_SYNC_DEADLINE_MS: 5_000,
  createHttpLink: () => ({ enter: () => new Promise(() => {}), leave: () => {}, queue: () => {}, pull: async () => {}, clean: false }),
}));

const { useUserStore, yjsTokenKey } = await import('~/modules/user/user-store');
const { applyRemoteUpdate, useYjsConnection } = await import('~/modules/common/blocknote/yjs-connections');

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

type Connection = ReturnType<typeof useYjsConnection>;

let root: Root | undefined;
let counter = 0;

/** Mounts one editor's connection and returns a reader for its latest hook state and its provider. */
async function mountConnection() {
  const entityId = `doc-${++counter}`;
  const tokenKey = yjsTokenKey('attachment', entityId);
  useUserStore.getState().setYjsToken(tokenKey, 'token-v1');
  let latest: Connection = null;
  const Harness = () => {
    latest = useYjsConnection(entityId, 'attachment', 'tenant-1', 'org-1');
    return null;
  };
  const container = document.createElement('div');
  root = createRoot(container);
  await act(async () => root?.render(createElement(Harness)));
  const provider = providers.at(-1);
  if (!provider) throw new Error('no provider created');
  return { provider, tokenKey, state: () => latest };
}

const close = async (provider: MockProvider, code: number) => {
  await act(async () => provider.emit('connection-close', { code, reason: '' }, provider));
};

/** The relay announces the document's generation, as it does before every handshake answer. */
const announce = async (provider: MockProvider, generation: string) => {
  await act(async () => provider.messageHandlers[4]?.(undefined, generation, provider, true, 4));
};

/** A local edit, as the editor makes it: y-websocket sends it at once while connected, then the document reports it. */
const editLocally = async (provider: MockProvider) => {
  if (provider.wsconnected) provider.sendSync(2);
  await act(async () => provider.doc.onUpdate?.(new Uint8Array(), 'editor'));
};
/** An update the relay sent, a write from outside the relay among them: y-websocket applies it with itself as origin. */
const relayUpdate = (provider: MockProvider) => act(async () => provider.doc.onUpdate?.(new Uint8Array(), provider));
/** The relay's `Saved` for the oldest frame of this socket it has not confirmed yet. */
const relaySaved = (provider: MockProvider) => act(async () => provider.messageHandlers[5]?.(undefined, undefined, provider, true, 5));
/** A socket opens, y-websocket sends its Step1, the relay answers with its Step2 and Step1, and y-websocket answers that with its Step2. */
const handshake = (provider: MockProvider) =>
  act(async () => {
    provider.openSocket();
    provider.sendSync(0);
    provider.receiveStep2();
    provider.sendSync(1);
  });
/** True when the page asks before it unloads. */
const unloadAsks = () => {
  const event = new Event('beforeunload', { cancelable: true });
  window.dispatchEvent(event);
  return event.defaultPrevented;
};

beforeEach(() => {
  online = true;
  warning.mockClear();
  invalidateQueries.mockClear();
  fetchQuery.mockReset();
  tokenError = null;
});

afterEach(async () => {
  await act(async () => root?.unmount());
  root = undefined;
});

describe('yjs connection: opening', () => {
  it("must not open y-websocket's own tab channel, which merges documents of two generations: the connection owns the Awareness and connects the provider itself", async () => {
    const { provider, state } = await mountConnection();

    expect(provider.opts).toMatchObject({ disableBc: true, connect: false });
    expect(provider.awareness).toBeInstanceOf(MockAwareness);
    expect(provider.awareness?.doc).toBe(provider.doc);
    expect(state()?.awareness).toBe(provider.awareness);
    expect(provider.connect).toHaveBeenCalledOnce();
  });

  it('waits while offline, and connects once the browser is back online', async () => {
    online = false;
    const { provider } = await mountConnection();
    expect(provider.connect).not.toHaveBeenCalled();

    await act(async () => onlineListener?.(true));
    expect(provider.connect).toHaveBeenCalledOnce();
  });

  it('destroys the Awareness with its document', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    try {
      const { provider } = await mountConnection();
      await act(async () => root?.unmount());
      root = undefined;
      await act(async () => vi.advanceTimersByTime(30_000));

      expect(provider.destroy).toHaveBeenCalledTimes(1);
      expect(provider.awareness?.destroy).toHaveBeenCalledTimes(1);
      expect(provider.doc.destroy).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('yjs connection: sync frames before the generation', () => {
  /** A sync frame from the relay: a peer's update, or the handshake's answer. */
  const receiveSync = (provider: MockProvider) => act(async () => provider.messageHandlers[0]?.(undefined, undefined, provider, true, 0));

  it("must not apply a peer's update that reaches a socket before its Generation: dropped, and frames after it apply", async () => {
    const { provider } = await mountConnection();
    await act(async () => provider.openSocket());

    // The relay joined the socket to the session; a peer's update arrives before the handshake answer.
    await receiveSync(provider);
    expect(provider.readSync).not.toHaveBeenCalled();

    await announce(provider, 'gen-1');
    await receiveSync(provider);
    expect(provider.readSync).toHaveBeenCalledOnce();
  });

  it('drops them again on each new socket, until that socket received its own Generation', async () => {
    const { provider } = await mountConnection();
    await act(async () => provider.openSocket());
    await announce(provider, 'gen-1');
    await receiveSync(provider);

    await act(async () => provider.dropSocket());
    await act(async () => provider.openSocket());
    await receiveSync(provider);
    expect(provider.readSync).toHaveBeenCalledOnce();

    await announce(provider, 'gen-1');
    await receiveSync(provider);
    expect(provider.readSync).toHaveBeenCalledTimes(2);
  });

  it("must not open a rebuilt document's frames on the dropped one's Generation: it waits for its own", async () => {
    const { provider } = await mountConnection();
    await act(async () => provider.openSocket());
    await announce(provider, 'gen-1');
    await act(async () => provider.dropSocket());
    await act(async () => provider.openSocket());
    await announce(provider, 'gen-2');

    const next = providers.at(-1)!;
    expect(next).not.toBe(provider);
    await act(async () => next.openSocket());
    await receiveSync(next);
    expect(next.readSync).not.toHaveBeenCalled();
    await announce(next, 'gen-2');
    await receiveSync(next);
    expect(next.readSync).toHaveBeenCalledOnce();
  });
});

describe('yjs connection: transient closes', () => {
  it('must not stop syncing via a server restart, a dropped connection or an authorization outage', async () => {
    const { provider, tokenKey, state } = await mountConnection();

    for (const code of [1001, 1006, 4503]) await close(provider, code);

    // y-websocket backs off and resyncs with the same token.
    expect(provider.disconnect).not.toHaveBeenCalled();
    expect(useUserStore.getState().yjsTokens[tokenKey]).toBe('token-v1');
    expect(state()?.stopped).toBe(false);
    expect(warning).not.toHaveBeenCalled();
  });

  it('keeps the provider on the latest token, so a reconnect uses it', async () => {
    const { provider, tokenKey } = await mountConnection();
    await act(async () => useUserStore.getState().setYjsToken(tokenKey, 'token-v2'));
    expect(provider.params.token).toBe('token-v2');
  });
});

describe('yjs connection: final closes', () => {
  it('must not keep accepting edits once the relay denies access (4003): the connection stops for good', async () => {
    const { provider, state } = await mountConnection();

    await close(provider, 4003);

    expect(provider.disconnect).toHaveBeenCalledTimes(1);
    expect(state()?.stopped).toBe(true);
    expect(state()?.deleted).toBe(false);
    expect(warning).toHaveBeenCalledWith('error:no_permission_for_sync.text');
  });

  it('must not keep accepting edits once the relay refuses the document (4400)', async () => {
    const { provider, state } = await mountConnection();
    await close(provider, 4400);
    expect(provider.disconnect).toHaveBeenCalledTimes(1);
    expect(state()?.stopped).toBe(true);
  });

  it('must not keep an editor editable after the backend withdraws its token, even while offline', async () => {
    const { provider, tokenKey, state } = await mountConnection();
    await act(async () => onlineListener?.(false));

    await act(async () => useUserStore.getState().setYjsToken(tokenKey, null));
    expect(state()?.stopped).toBe(true);

    provider.connect.mockClear();
    await act(async () => onlineListener?.(true));
    expect(provider.connect).not.toHaveBeenCalled();
  });

  it('must not reconnect a stopped connection when the browser comes back online', async () => {
    const { provider } = await mountConnection();
    await close(provider, 4003);
    provider.connect.mockClear();

    await act(async () => onlineListener?.(true));
    expect(provider.connect).not.toHaveBeenCalled();
  });
});

describe('yjs connection: a reseeded document', () => {
  it('must not merge a surviving document into a reseeded one: another generation rebuilds the connection and reports the discarded edits', async () => {
    const { provider, state } = await mountConnection();
    await announce(provider, 'gen-1');
    await act(async () => provider.emit('sync', true));
    expect(state()?.synced).toBe(true);

    // A local edit; a reconnect announces the same generation, and nothing happens.
    provider.doc.onUpdate?.(new Uint8Array(), 'editor');
    await announce(provider, 'gen-1');
    expect(provider.destroy).not.toHaveBeenCalled();

    // The entity was deleted and restored, and the relay reseeded: this document shares no history with the new one.
    const opened = providers.length;
    await announce(provider, 'gen-2');
    expect(provider.destroy).toHaveBeenCalledTimes(1);
    expect(provider.doc.destroy).toHaveBeenCalledTimes(1);
    expect(providers).toHaveLength(opened + 1);
    const next = providers.at(-1)!;
    // The editor binds the fresh document's Awareness; the dropped one went with its document.
    expect(state()?.awareness).toBe(next.awareness);
    expect(next.awareness).not.toBe(provider.awareness);
    expect(provider.awareness?.destroy).toHaveBeenCalledTimes(1);
    expect(next.connect).toHaveBeenCalledOnce();
    expect(state()?.synced).toBe(false);
    expect(state()?.rebuilds).toBe(1);
    expect(state()?.stopped).toBe(false);
    expect(warning).toHaveBeenCalledWith('error:sync_document_replaced.text');

    // The fresh document takes the new generation as its own and syncs.
    await announce(next, 'gen-2');
    await act(async () => next.emit('sync', true));
    expect(next.destroy).not.toHaveBeenCalled();
    expect(state()?.synced).toBe(true);
  });

  it('reloads a document never edited here without a notice (positive control)', async () => {
    const { provider, state } = await mountConnection();
    await announce(provider, 'gen-1');
    await announce(provider, 'gen-2');
    expect(provider.destroy).toHaveBeenCalledTimes(1);
    expect(state()?.rebuilds).toBe(1);
    expect(warning).not.toHaveBeenCalled();
  });
});

describe('yjs connection: token refusals', () => {
  /**
   * One connection attempt the relay refuses: y-websocket opens the socket with the token in its params and reports
   * 'connecting', the socket opens, and the relay closes an unusable token right after the handshake with 4001.
   */
  const refuseToken = async (provider: MockProvider) => {
    await act(async () => provider.emit('status', { status: 'connecting' }));
    await act(async () => provider.emit('status', { status: 'connected' }));
    await close(provider, 4001);
  };
  /** The refetch a refusal starts lands a new token before the next attempt. */
  const fetchToken = (tokenKey: string, token: string) => act(async () => useUserStore.getState().setYjsToken(tokenKey, token));

  it('must not stop syncing via an API outage at token refresh: an expired token refused again never counts', async () => {
    const { provider, state } = await mountConnection();

    // The token expired while no refetch could reach the API, so every reconnect carries it again.
    for (let i = 0; i < 20; i++) await refuseToken(provider);

    expect(provider.disconnect).not.toHaveBeenCalled();
    expect(state()?.stopped).toBe(false);
    expect(warning).not.toHaveBeenCalled();
    // Each refusal asks for a fresh token.
    expect(invalidateQueries).toHaveBeenCalledTimes(20);
  });

  it('fetches its own token after a refusal while no editor observes the token query', async () => {
    const { provider, tokenKey } = await mountConnection();
    tokenObservers = 0;
    fetchQuery.mockResolvedValueOnce('token-fresh');
    try {
      await refuseToken(provider);
      await act(async () => {});

      expect(fetchQuery).toHaveBeenCalledOnce();
      expect(useUserStore.getState().yjsTokens[tokenKey]).toBe('token-fresh');
    } finally {
      tokenObservers = 1;
    }
  });

  it('leaves the refetch to the token query while an editor observes it (positive control)', async () => {
    const { provider } = await mountConnection();

    await refuseToken(provider);

    expect(invalidateQueries).toHaveBeenCalledOnce();
    expect(fetchQuery).not.toHaveBeenCalled();
  });

  it('must not retry forever via tokens the relay keeps refusing: it stops after five refused tokens', async () => {
    const { provider, tokenKey, state } = await mountConnection();

    for (let i = 2; i <= 5; i++) {
      await refuseToken(provider);
      await fetchToken(tokenKey, `token-v${i}`);
    }
    expect(provider.disconnect).not.toHaveBeenCalled();

    // The fifth token, freshly fetched, is refused too.
    await refuseToken(provider);
    expect(provider.disconnect).toHaveBeenCalledTimes(1);
    expect(state()?.stopped).toBe(true);
    expect(warning).toHaveBeenCalledWith('error:sync_token_expired.text');
  });

  it('a synced connection resets the count, so routine expiry closes never stop it (positive control)', async () => {
    const { provider, tokenKey, state } = await mountConnection();

    for (let i = 2; i < 10; i++) {
      await refuseToken(provider);
      await fetchToken(tokenKey, `token-v${i}`);
      await act(async () => provider.emit('sync', true));
    }
    expect(provider.disconnect).not.toHaveBeenCalled();
    expect(state()?.stopped).toBe(false);
  });
});

describe('yjs connection: edits the relay has not saved', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('stays unsynced until the relay saved the handshake Step2 and every frame after it', async () => {
    const { provider, state } = await mountConnection();
    await act(async () => {
      provider.openSocket();
      provider.sendSync(0);
    });
    // An edit sent before the handshake answer: the relay confirms it, but only the handshake Step2 covers what it lacked.
    await editLocally(provider);
    expect(state()?.unsynced).toBe(true);
    await act(async () => provider.receiveStep2());
    await relaySaved(provider);
    expect(state()?.unsynced).toBe(true);

    await act(async () => provider.sendSync(1));
    expect(state()?.unsynced).toBe(true);
    await relaySaved(provider);
    expect(state()?.unsynced).toBe(false);

    // A later edit waits for its own `Saved`.
    await editLocally(provider);
    expect(state()?.unsynced).toBe(true);
    await relaySaved(provider);
    expect(state()?.unsynced).toBe(false);
  });

  it('counts afresh on each socket: what the last one left unconfirmed travels in the next handshake', async () => {
    const { provider, state } = await mountConnection();
    await handshake(provider);
    await relaySaved(provider);
    await editLocally(provider);
    expect(state()?.unsynced).toBe(true);

    await act(async () => provider.dropSocket());
    await handshake(provider);
    await relaySaved(provider);
    expect(state()?.unsynced).toBe(false);
  });

  it('marks an edit made while disconnected unsynced until a later handshake Step2 is saved', async () => {
    const { provider, state } = await mountConnection();
    await handshake(provider);
    await relaySaved(provider);
    expect(state()?.unsynced).toBe(false);

    await act(async () => provider.dropSocket());
    await editLocally(provider);
    expect(state()?.unsynced).toBe(true);

    // The relay's answer alone proves nothing: the edit travels in this client's Step2.
    await act(async () => {
      provider.openSocket();
      provider.receiveStep2();
    });
    expect(state()?.unsynced).toBe(true);
    await act(async () => provider.sendSync(1));
    await relaySaved(provider);
    expect(state()?.unsynced).toBe(false);
  });

  it('falls back to synced against a relay that sends no Saved within 10 s of the handshake Step2', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const { provider, state } = await mountConnection();
    await act(async () => {
      provider.openSocket();
      provider.sendSync(0);
    });
    await editLocally(provider);
    expect(state()?.unsynced).toBe(true);

    // A relay slow to answer gets no fallback before the handshake Step2 carried what it lacks.
    await act(async () => vi.advanceTimersByTime(15_000));
    await act(async () => provider.receiveStep2());
    expect(state()?.unsynced).toBe(true);

    await act(async () => provider.sendSync(1));
    await act(async () => vi.advanceTimersByTime(9_999));
    expect(state()?.unsynced).toBe(true);
    await act(async () => vi.advanceTimersByTime(1));
    expect(state()?.unsynced).toBe(false);
  });

  it('keeps a released connection holding unsaved edits past its grace period, and destroys it once the relay saved them', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const { provider, state } = await mountConnection();
    await handshake(provider);
    await relaySaved(provider);
    expect(unloadAsks()).toBe(false);

    await act(async () => provider.dropSocket());
    await editLocally(provider);
    expect(state()?.unsynced).toBe(true);
    expect(unloadAsks()).toBe(true);

    await act(async () => root?.unmount());
    root = undefined;
    await act(async () => vi.advanceTimersByTime(30_000));
    expect(provider.destroy).not.toHaveBeenCalled();

    // Back online: the handshake carries the edit, and once the relay saved it the connection goes.
    await handshake(provider);
    expect(provider.destroy).not.toHaveBeenCalled();
    await relaySaved(provider);
    expect(provider.destroy).toHaveBeenCalledTimes(1);
    expect(unloadAsks()).toBe(false);
  });

  it('destroys a released connection with nothing unsaved when its grace period ends (positive control)', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const { provider } = await mountConnection();
    await handshake(provider);
    await editLocally(provider);
    await relaySaved(provider);
    await relaySaved(provider);

    await act(async () => root?.unmount());
    root = undefined;
    await act(async () => vi.advanceTimersByTime(29_999));
    expect(provider.destroy).not.toHaveBeenCalled();
    await act(async () => vi.advanceTimersByTime(1));
    expect(provider.destroy).toHaveBeenCalledTimes(1);
  });

  it('keeps the document of a stopped connection that holds unsaved edits, until sign-out discards it', async () => {
    const { provider, tokenKey, state } = await mountConnection();
    await handshake(provider);
    await relaySaved(provider);
    await editLocally(provider);
    await close(provider, 4003);
    expect(state()?.stopped).toBe(true);
    expect(state()?.unsynced).toBe(true);
    expect(state()?.deleted).toBe(false);

    await act(async () => root?.unmount());
    root = undefined;
    expect(provider.destroy).not.toHaveBeenCalled();

    // Signed out: the token goes with the user, and so do the edits.
    await act(async () => useUserStore.getState().setYjsToken(tokenKey, null));
    expect(provider.destroy).toHaveBeenCalledTimes(1);
    expect(unloadAsks()).toBe(false);
  });

  it('drops a reseeded document without a notice once the relay saved every edit it held', async () => {
    const { provider, state } = await mountConnection();
    await announce(provider, 'gen-1');
    await handshake(provider);
    await editLocally(provider);
    await relaySaved(provider);
    await relaySaved(provider);
    expect(state()?.unsynced).toBe(false);

    await announce(provider, 'gen-2');
    expect(provider.destroy).toHaveBeenCalledTimes(1);
    expect(state()?.rebuilds).toBe(1);
    expect(warning).not.toHaveBeenCalled();
  });
});

describe('yjs connection: a write from outside the relay', () => {
  it('must not rebuild on a write from outside the relay: it arrives as an update and the generation stays', async () => {
    const { provider, state } = await mountConnection();
    await announce(provider, 'gen-1');
    await handshake(provider);
    await relaySaved(provider);
    await editLocally(provider);

    // The write lands while this tab holds an edit the relay has not saved, and again after a reconnect.
    const opened = providers.length;
    await relayUpdate(provider);
    await act(async () => provider.dropSocket());
    await announce(provider, 'gen-1');
    await handshake(provider);
    await relayUpdate(provider);

    expect(provider.destroy).not.toHaveBeenCalled();
    expect(providers).toHaveLength(opened);
    expect(state()?.awareness).toBe(provider.awareness);
    expect(state()?.rebuilds).toBe(0);
    expect(state()?.synced).toBe(true);
    expect(warning).not.toHaveBeenCalled();

    // The edit survives in the same document, and the handshake Step2 saves it.
    await relaySaved(provider);
    expect(state()?.unsynced).toBe(false);
  });

  it('must not count an update the relay sent as an edit of this tab: unsynced and the ledger stay as they were', async () => {
    const { provider, state } = await mountConnection();
    await handshake(provider);
    await relaySaved(provider);

    await relayUpdate(provider);
    expect(state()?.unsynced).toBe(false);
    expect(unloadAsks()).toBe(false);

    // A later edit clears with its own `Saved`: the relayed update was never counted as sent.
    await editLocally(provider);
    expect(state()?.unsynced).toBe(true);
    await relaySaved(provider);
    expect(state()?.unsynced).toBe(false);
  });
});

describe('yjs connection: updates from the HTTP routes and other tabs', () => {
  it('must not count an update from the HTTP routes or another tab as an edit of this tab', async () => {
    const { provider, state } = await mountConnection();
    await handshake(provider);
    await relaySaved(provider);
    // The connection as the HTTP link and the tab channel hold it: its document and provider.
    const conn = { yDoc: provider.doc, provider } as unknown as Parameters<typeof applyRemoteUpdate>[0];

    await act(async () => applyRemoteUpdate(conn, new Uint8Array([1]), { kind: 'http' }));
    await act(async () => applyRemoteUpdate(conn, new Uint8Array([2]), { kind: 'tab', rowId: 7 }));
    expect(state()?.unsynced).toBe(false);
    expect(unloadAsks()).toBe(false);

    // A local edit after them counts again, and clears with its own `Saved`.
    await editLocally(provider);
    expect(state()?.unsynced).toBe(true);
    await relaySaved(provider);
    expect(state()?.unsynced).toBe(false);
  });
});

describe('yjs connection: a deleted entity', () => {
  afterEach(() => {
    vi.useRealTimers();
    useUserStore.setState({ user: null });
  });

  it('must not keep edits nothing can save once the entity is deleted (4410): it stops, discards them and says so', async () => {
    const { provider, state } = await mountConnection();
    await handshake(provider);
    await relaySaved(provider);
    await editLocally(provider);
    expect(unloadAsks()).toBe(true);

    await close(provider, 4410);

    expect(provider.disconnect).toHaveBeenCalledTimes(1);
    expect(state()?.stopped).toBe(true);
    expect(state()?.deleted).toBe(true);
    expect(state()?.unsynced).toBe(false);
    expect(unloadAsks()).toBe(false);
    expect(warning).toHaveBeenCalledExactlyOnceWith('error:sync_deleted.text');

    // Nothing is left to keep: the editor's release destroys the connection.
    await act(async () => root?.unmount());
    root = undefined;
    expect(provider.destroy).toHaveBeenCalledTimes(1);
  });

  it('ends without a toast when the document held no unsaved edits (positive control)', async () => {
    const { provider, state } = await mountConnection();
    await handshake(provider);
    await relaySaved(provider);

    await close(provider, 4410);

    expect(state()?.stopped).toBe(true);
    expect(state()?.deleted).toBe(true);
    expect(warning).not.toHaveBeenCalled();
  });

  it('destroys a released connection kept only for its unsaved edits once the entity is deleted', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const { provider } = await mountConnection();
    await handshake(provider);
    await relaySaved(provider);
    await act(async () => provider.dropSocket());
    await editLocally(provider);
    await act(async () => root?.unmount());
    root = undefined;
    await act(async () => vi.advanceTimersByTime(30_000));
    expect(provider.destroy).not.toHaveBeenCalled();

    // Its reconnect finds the entity deleted.
    await close(provider, 4410);

    expect(provider.destroy).toHaveBeenCalledTimes(1);
    expect(warning).toHaveBeenCalledExactlyOnceWith('error:sync_deleted.text');
    expect(unloadAsks()).toBe(false);
  });

  it('must not report a deleted entity as denied: a token a 404 withdrew ends the connection as deleted', async () => {
    const { provider, tokenKey, state } = await mountConnection();
    useUserStore.setState({ user: { id: 'user-1' } as never });
    await handshake(provider);
    await relaySaved(provider);
    await editLocally(provider);

    tokenError = { status: 404 };
    await act(async () => useUserStore.getState().setYjsToken(tokenKey, null));

    expect(state()?.stopped).toBe(true);
    expect(state()?.deleted).toBe(true);
    expect(state()?.unsynced).toBe(false);
    expect(warning).toHaveBeenCalledExactlyOnceWith('error:sync_deleted.text');
  });

  it('a token a 403 withdrew stops the connection as denied (positive control)', async () => {
    const { tokenKey, state } = await mountConnection();
    useUserStore.setState({ user: { id: 'user-1' } as never });

    tokenError = { status: 403 };
    await act(async () => useUserStore.getState().setYjsToken(tokenKey, null));

    expect(state()?.stopped).toBe(true);
    expect(state()?.deleted).toBe(false);
    expect(warning).toHaveBeenCalledExactlyOnceWith('error:no_permission_for_sync.text');
  });
});
