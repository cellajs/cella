import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// ── Mocks ───────────────────────────────────────────────────────────────────

class MockProvider {
  params: Record<string, string>;
  private listeners = new Map<string, Set<(...args: unknown[]) => void>>();

  constructor(_url: string, _room: string, _doc: unknown, opts: { params: Record<string, string> }) {
    this.params = { ...opts.params };
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

  connect = vi.fn();
  disconnect = vi.fn();
  destroy = vi.fn();
  synced = false;
}

vi.mock('y-websocket', () => ({ WebsocketProvider: MockProvider }));
vi.mock('yjs', () => {
  class Doc {
    getXmlFragment = () => ({});
    destroy = vi.fn();
  }
  return { Doc, default: { Doc } };
});
vi.mock('~/modules/common/toaster/toaster', () => ({ toaster: vi.fn() }));
vi.mock('i18next', () => ({ default: { t: (k: string) => k }, t: (k: string) => k }));
vi.mock('shared', () => ({
  appConfig: { yjsUrl: 'http://localhost:1234' },
  toWsUrl: (u: string) => u.replace(/^http/, 'ws'),
}));
vi.mock('@tanstack/react-query', () => ({
  onlineManager: { isOnline: () => true, subscribe: () => () => {} },
}));
vi.mock('~/env', () => ({ isDebugMode: false }));

// ── Module under test (imported after mocks) ────────────────────────────────

const { useUserStore, yjsTokenKey } = await import('~/modules/user/user-store');

// ── Helpers ─────────────────────────────────────────────────────────────────

const TEST_TOKEN_KEY = yjsTokenKey('task', 'tenant-1');

/** Create a provider and wire the store→params subscription (mirrors acquireConnection). */
function createProviderWithTokenSync(token: string) {
  useUserStore.setState({ yjsTokens: { [TEST_TOKEN_KEY]: token } });

  const provider = new MockProvider(
    'ws://localhost:1234',
    'test-session',
    {},
    {
      params: { token, entityType: 'task', tenantId: 'tenant-1' },
    },
  );

  const unsubToken = useUserStore.subscribe((state) => {
    const newToken = state.yjsTokens[TEST_TOKEN_KEY];
    if (newToken && provider.params) {
      provider.params.token = newToken;
    }
  });

  return { provider, unsubToken };
}

/** Wire close-code handler (mirrors acquireConnection logic). */
function wireCloseHandler(provider: MockProvider) {
  const handleConnectionClose = (event: { code: number } | null) => {
    if (!event || event.code === 1000) return;
    if (event.code === 4001) return; // Recoverable, let provider retry
    provider.disconnect();
  };
  provider.on('connection-close', handleConnectionClose as (...args: unknown[]) => void);
}

// ── Tests ───────────────────────────────────────────────────────────────────

describe('yjs-connections token refresh', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useUserStore.setState({ yjsTokens: { [TEST_TOKEN_KEY]: 'initial-token' } });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should update provider.params.token when store token changes', () => {
    const { provider, unsubToken } = createProviderWithTokenSync('token-v1');
    expect(provider.params.token).toBe('token-v1');

    useUserStore.getState().setYjsToken(TEST_TOKEN_KEY, 'token-v2');
    expect(provider.params.token).toBe('token-v2');

    unsubToken();
  });

  it('should update provider.params.token across multiple refreshes', () => {
    const { provider, unsubToken } = createProviderWithTokenSync('token-v1');

    useUserStore.getState().setYjsToken(TEST_TOKEN_KEY, 'token-v2');
    expect(provider.params.token).toBe('token-v2');

    useUserStore.getState().setYjsToken(TEST_TOKEN_KEY, 'token-v3');
    expect(provider.params.token).toBe('token-v3');

    unsubToken();
  });

  it('should not update provider.params.token when token is set to null', () => {
    const { provider, unsubToken } = createProviderWithTokenSync('token-v1');

    useUserStore.getState().setYjsToken(TEST_TOKEN_KEY, null);
    expect(provider.params.token).toBe('token-v1');

    unsubToken();
  });

  it('should stop updating after unsubscribe', () => {
    const { provider, unsubToken } = createProviderWithTokenSync('token-v1');
    unsubToken();

    useUserStore.getState().setYjsToken(TEST_TOKEN_KEY, 'token-v2');
    expect(provider.params.token).toBe('token-v1');
  });
});

describe('yjs-connections close code handling', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useUserStore.setState({ yjsTokens: { [TEST_TOKEN_KEY]: 'initial-token' } });
  });

  it('should NOT disconnect provider on TOKEN_INVALID (4001)', () => {
    const { provider } = createProviderWithTokenSync('token-v1');
    wireCloseHandler(provider);

    provider.emit('connection-close', { code: 4001, reason: 'Invalid or expired token' });
    expect(provider.disconnect).not.toHaveBeenCalled();
  });

  it('should disconnect provider on ACCESS_DENIED (4003)', () => {
    const { provider } = createProviderWithTokenSync('token-v1');
    wireCloseHandler(provider);

    provider.emit('connection-close', { code: 4003, reason: 'Access denied' });
    expect(provider.disconnect).toHaveBeenCalledOnce();
  });

  it('should disconnect provider on BACKEND_UNAVAILABLE (4503)', () => {
    const { provider } = createProviderWithTokenSync('token-v1');
    wireCloseHandler(provider);

    provider.emit('connection-close', { code: 4503, reason: 'Backend unavailable' });
    expect(provider.disconnect).toHaveBeenCalledOnce();
  });

  it('should NOT disconnect on normal close (1000)', () => {
    const { provider } = createProviderWithTokenSync('token-v1');
    wireCloseHandler(provider);

    provider.emit('connection-close', { code: 1000, reason: 'Normal closure' });
    expect(provider.disconnect).not.toHaveBeenCalled();
  });

  it('should allow retry with fresh token after 4001', () => {
    const { provider, unsubToken } = createProviderWithTokenSync('expired-token');
    wireCloseHandler(provider);

    // Server rejects with 4001
    provider.emit('connection-close', { code: 4001, reason: 'Invalid or expired token' });
    expect(provider.disconnect).not.toHaveBeenCalled();

    // Token fetcher provides fresh token
    useUserStore.getState().setYjsToken(TEST_TOKEN_KEY, 'fresh-token');
    expect(provider.params.token).toBe('fresh-token');

    unsubToken();
  });
});

describe('yjs-connections edge cases', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useUserStore.setState({ yjsTokens: { [TEST_TOKEN_KEY]: 'initial-token' } });
  });

  it('should not crash on null close event', () => {
    const { provider } = createProviderWithTokenSync('token-v1');
    wireCloseHandler(provider);

    expect(() => provider.emit('connection-close', null)).not.toThrow();
    expect(provider.disconnect).not.toHaveBeenCalled();
  });

  it('should not crash on close event missing code property', () => {
    const { provider } = createProviderWithTokenSync('token-v1');
    wireCloseHandler(provider);

    expect(() => provider.emit('connection-close', {})).not.toThrow();
    expect(() => provider.emit('connection-close', { reason: 'no code' })).not.toThrow();
  });

  it('should stay stable under rapid 4001 spam', () => {
    const { provider, unsubToken } = createProviderWithTokenSync('token-v1');
    wireCloseHandler(provider);

    for (let i = 0; i < 50; i++) {
      provider.emit('connection-close', { code: 4001, reason: 'Invalid or expired token' });
    }

    expect(provider.disconnect).not.toHaveBeenCalled();

    useUserStore.getState().setYjsToken(TEST_TOKEN_KEY, 'post-spam-token');
    expect(provider.params.token).toBe('post-spam-token');

    unsubToken();
  });

  it('should not accept empty string as a valid token', () => {
    const { provider, unsubToken } = createProviderWithTokenSync('valid-token');

    useUserStore.getState().setYjsToken(TEST_TOKEN_KEY, '' as unknown as string);
    expect(provider.params.token).toBe('valid-token');

    unsubToken();
  });

  it('should pass forged tokens through to provider params (server-side HMAC is the real gate)', () => {
    const { provider, unsubToken } = createProviderWithTokenSync('valid-token');

    // A forged token will be pushed to params; the frontend has no way to verify HMAC.
    // Defense-in-depth: the yjs server's verifyToken() rejects it (see yjs/src/tests/auth.test.ts).
    const forgedPayload = Buffer.from(JSON.stringify({ userId: 'attacker', exp: Date.now() + 99999999 })).toString(
      'base64url',
    );
    const forgedToken = `${forgedPayload}.fakesig123456789`;

    useUserStore.getState().setYjsToken(TEST_TOKEN_KEY, forgedToken);
    expect(provider.params.token).toBe(forgedToken);

    unsubToken();
  });
});
