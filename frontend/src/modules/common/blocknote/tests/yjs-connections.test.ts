// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

class MockProvider {
  params: Record<string, string>;
  shouldConnect = true;
  synced = false;
  doc: MockDoc;
  /** Message type → handler, as y-websocket keeps them per provider; the relay's generation frame is type 4. */
  messageHandlers: ((
    encoder: unknown,
    decoder: unknown,
    provider: unknown,
    emitSynced: boolean,
    type: number,
  ) => void)[] = [];
  private listeners = new Map<string, Set<(...args: unknown[]) => void>>();

  constructor(_url: string, _room: string, doc: MockDoc, opts: { params: Record<string, string> }) {
    this.params = { ...opts.params };
    this.doc = doc;
    providers.push(this);
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
const warning = vi.fn();
const invalidateQueries = vi.fn();

/** A document that records its `update` listener, so a test can make a local edit. */
class MockDoc {
  onUpdate: ((update: Uint8Array, origin: unknown) => void) | undefined;
  getXmlFragment = () => ({});
  on = (_event: string, cb: (update: Uint8Array, origin: unknown) => void) => {
    this.onUpdate = cb;
  };
  destroy = vi.fn();
}

vi.mock('y-websocket', () => ({ WebsocketProvider: MockProvider }));
vi.mock('yjs', () => ({ Doc: MockDoc, default: { Doc: MockDoc } }));
// The generation frame's decoder stands in for the string it carries.
vi.mock('lib0/decoding', () => ({ readVarString: (decoder: unknown) => decoder }));
vi.mock('~/modules/common/toaster/toaster', () => ({ toaster: { warning: (...args: unknown[]) => warning(...args) } }));
vi.mock('i18next', () => ({ default: { t: (k: string) => k }, t: (k: string) => k }));
vi.mock('shared', () => ({ appConfig: { yjsUrl: 'http://localhost:1234' } }));
vi.mock('@tanstack/react-query', () => ({
  onlineManager: {
    isOnline: () => true,
    subscribe: (listener: (online: boolean) => void) => {
      onlineListener = listener;
      return () => {};
    },
  },
}));
vi.mock('~/query/query-client', () => ({
  queryClient: { invalidateQueries: (...args: unknown[]) => invalidateQueries(...args) },
}));
vi.mock('~/modules/common/blocknote/query', () => ({ yjsTokenKeys: { entity: (...key: unknown[]) => key } }));
vi.mock('~/modules/common/blocknote/yjs-resync', () => ({ watchPendingStructs: () => () => {} }));
vi.mock('~/env', () => ({ isDebugMode: false }));

const { useUserStore, yjsTokenKey } = await import('~/modules/user/user-store');
const { useYjsConnection } = await import('~/modules/common/blocknote/yjs-connections');

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
    latest = useYjsConnection(entityId, 'attachment', 'tenant-1');
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

beforeEach(() => {
  warning.mockClear();
  invalidateQueries.mockClear();
});

afterEach(async () => {
  await act(async () => root?.unmount());
  root = undefined;
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

    // The description was written elsewhere and the relay reseeded: this document shares no history with the new one.
    const opened = providers.length;
    await announce(provider, 'gen-2');
    expect(provider.destroy).toHaveBeenCalledTimes(1);
    expect(provider.doc.destroy).toHaveBeenCalledTimes(1);
    expect(providers).toHaveLength(opened + 1);
    const next = providers.at(-1)!;
    expect(state()?.provider).toBe(next);
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
  const fetchToken = (tokenKey: string, token: string) =>
    act(async () => useUserStore.getState().setYjsToken(tokenKey, token));

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
