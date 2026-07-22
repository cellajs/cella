import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('shared', () => ({
  appConfig: { backendUrl: 'http://api.test', slug: 'test' },
}));
vi.mock('~/env', () => ({ isDebugMode: false }));
vi.mock('~/lib/tracing', () => ({ reportCriticalError: vi.fn() }));
vi.mock('~/query/basic/sync-stale-config', () => ({ setSyncStreamLive: vi.fn() }));
vi.mock('~/query/realtime/sync-store', () => ({
  useSyncStore: {
    getState: () => ({
      cursor: null,
      setCursor: vi.fn(),
      setLastSyncAt: vi.fn(),
      getCatchupViews: () => [],
    }),
  },
}));
vi.mock('./app-stream-handler', () => ({ handleAppStreamNotification: vi.fn() }));
vi.mock('./view-declaration', () => ({ declareViewsFromMemberships: vi.fn() }));
vi.mock('./catchup-processor', () => ({ catchupEntityTypes: () => [], processAppCatchup: vi.fn() }));
// Controllable leader state so tests can drive the follower -> leader promotion transition.
const leaderControl = vi.hoisted(() => {
  const state = { isLeader: true };
  const subscribers = new Set<(s: { isLeader: boolean }, p: { isLeader: boolean }) => void>();
  return {
    isLeader: () => state.isLeader,
    getState: () => ({ isLeader: state.isLeader }),
    subscribe: (fn: (s: { isLeader: boolean }, p: { isLeader: boolean }) => void) => {
      subscribers.add(fn);
      return () => subscribers.delete(fn);
    },
    setLeader: (next: boolean) => {
      const prev = state.isLeader;
      state.isLeader = next;
      for (const fn of subscribers) fn({ isLeader: next }, { isLeader: prev });
    },
    reset: () => {
      state.isLeader = true;
      subscribers.clear();
    },
  };
});

vi.mock('./tab-coordinator', () => ({
  broadcastNotification: vi.fn(),
  initTabCoordinator: vi.fn(() => Promise.resolve()),
  isLeader: () => leaderControl.isLeader(),
  onNotification: vi.fn(() => () => {}),
  useTabCoordinatorStore: { getState: () => leaderControl.getState(), subscribe: leaderControl.subscribe },
}));
vi.mock('sdk', () => ({ postAppCatchup: vi.fn() }));

/** Test double for the browser EventSource: records instances, lets tests emit named events. */
class FakeEventSource {
  static instances: FakeEventSource[] = [];
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSED = 2;

  url: string;
  readyState = FakeEventSource.OPEN;
  onopen: (() => void) | null = null;
  onerror: (() => void) | null = null;
  private listeners = new Map<string, Array<(e: MessageEvent) => void>>();

  constructor(url: string) {
    this.url = url;
    FakeEventSource.instances.push(this);
  }

  addEventListener(type: string, fn: (e: MessageEvent) => void) {
    const list = this.listeners.get(type) ?? [];
    list.push(fn);
    this.listeners.set(type, list);
  }

  emit(type: string, data: string, lastEventId = '') {
    for (const fn of this.listeners.get(type) ?? []) fn({ data, lastEventId } as MessageEvent);
  }

  close() {
    this.readyState = FakeEventSource.CLOSED;
  }
}

vi.stubGlobal('EventSource', FakeEventSource);
vi.stubGlobal('document', {
  addEventListener: vi.fn(),
  removeEventListener: vi.fn(),
  visibilityState: 'visible',
});

const { StreamManager } = await import('./stream-store');

/** Flush pending microtasks so awaited catchup continuations run. */
const tick = () => new Promise((r) => setTimeout(r, 0));

let managerCount = 0;

function createHarness(overrides?: {
  fetchAndProcessCatchup?: (cursor: string | null) => Promise<string | null>;
  useTabCoordination?: boolean;
}) {
  const order: string[] = [];
  const processed: unknown[] = [];
  let resolveCatchup: ((cursor: string | null) => void) | undefined;

  const manager = new StreamManager(`TestStream-${managerCount++}`, {
    endpoint: 'http://api.test/stream',
    withCredentials: false,
    useTabCoordination: overrides?.useTabCoordination ?? false,
    fetchAndProcessCatchup:
      overrides?.fetchAndProcessCatchup ??
      (() =>
        new Promise<string | null>((resolve) => {
          order.push('catchup-start');
          resolveCatchup = (cursor) => {
            order.push('catchup-done');
            resolve(cursor);
          };
        })),
    processNotification: (n) => {
      order.push(`process:${(n as { id: string }).id}`);
      processed.push(n);
    },
  });

  return {
    manager,
    order,
    processed,
    resolveCatchup: (cursor: string | null = 'c1') => resolveCatchup?.(cursor),
    get es() {
      return FakeEventSource.instances.at(-1) as FakeEventSource;
    },
  };
}

beforeEach(() => {
  FakeEventSource.instances = [];
  leaderControl.reset();
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('StreamManager subscribe-then-snapshot', () => {
  it('opens SSE before catchup and starts catchup on the offset event', async () => {
    const h = createHarness();
    await h.manager.connect();

    expect(FakeEventSource.instances).toHaveLength(1);
    expect(h.order).toEqual([]); // catchup waits for the server offset

    h.es.emit('offset', '100');
    expect(h.order).toEqual(['catchup-start']);
    expect(h.manager.useStore.getState().state).toBe('catching-up');
  });

  it('processes a notification arriving during catchup exactly once, after catchup', async () => {
    const h = createHarness();
    await h.manager.connect();
    h.es.emit('offset', '100');

    // Committed between the catchup read and its response: must buffer, not process.
    h.es.emit('change', JSON.stringify({ id: 'a1' }), '101');
    expect(h.processed).toHaveLength(0);

    h.resolveCatchup('c1');
    await tick();

    expect(h.order).toEqual(['catchup-start', 'catchup-done', 'process:a1']);
    expect(h.processed).toHaveLength(1);
    expect(h.manager.useStore.getState().state).toBe('live');
    // Cursor advanced by the drained notification (its eventId is newer than the catchup cursor).
    expect(h.manager.useStore.getState().cursor).toBe('101');
  });

  it('processes notifications directly once live', async () => {
    const h = createHarness();
    await h.manager.connect();
    h.es.emit('offset', '100');
    h.resolveCatchup('c1');
    await tick();

    h.es.emit('change', JSON.stringify({ id: 'b1' }), '102');
    expect(h.order.at(-1)).toBe('process:b1');
    expect(h.manager.useStore.getState().cursor).toBe('102');
  });

  it('re-runs catchup once when the buffer overflows, dropping the buffered batch', async () => {
    let round = 0;
    const h = createHarness({
      fetchAndProcessCatchup: () => {
        round++;
        if (round === 1) {
          // Simulate a burst during the first catchup round: overflow the buffer.
          for (let i = 0; i < 501; i++) h.es.emit('change', JSON.stringify({ id: `n${i}` }), String(i));
        }
        return Promise.resolve(`c${round}`);
      },
    });

    await h.manager.connect();
    h.es.emit('offset', '100');
    await tick();

    expect(round).toBe(2); // one retry after overflow
    expect(h.processed).toHaveLength(0); // dropped batch is covered by the second catchup read
    expect(h.manager.useStore.getState().state).toBe('live');
  });

  it('fails the connect cycle when the buffer overflows twice', async () => {
    let round = 0;
    const h = createHarness({
      fetchAndProcessCatchup: () => {
        round++;
        for (let i = 0; i < 501; i++) h.es.emit('change', JSON.stringify({ id: `r${round}-${i}` }), String(i));
        return Promise.resolve(`c${round}`);
      },
    });

    await h.manager.connect();
    h.es.emit('offset', '100');
    await tick();

    expect(round).toBe(2);
    expect(h.manager.useStore.getState().state).toBe('error');
    expect(h.es.readyState).toBe(FakeEventSource.CLOSED);
  });

  it('closes the open SSE connection when catchup fails', async () => {
    const h = createHarness({ fetchAndProcessCatchup: () => Promise.reject(new Error('boom')) });

    await h.manager.connect();
    h.es.emit('offset', '100');
    await tick();

    expect(h.manager.useStore.getState().state).toBe('error');
    expect(h.es.readyState).toBe(FakeEventSource.CLOSED);
  });
});

describe('StreamManager leader promotion', () => {
  it('opens an SSE when a broadcast-only follower is promoted to leader', async () => {
    leaderControl.setLeader(false); // start as a follower
    const h = createHarness({ useTabCoordination: true });

    await h.manager.connect();

    // Follower parks in broadcast-only 'live' with no SSE.
    expect(FakeEventSource.instances).toHaveLength(0);
    expect(h.manager.useStore.getState().state).toBe('live');

    // Leader tab closes: the Web Lock transfers and this tab is promoted.
    leaderControl.setLeader(true);
    await tick();

    // Regression: the promoted tab must open a real SSE, not early-return on the stale 'live' state.
    expect(FakeEventSource.instances).toHaveLength(1);
    expect(h.manager.isConnected()).toBe(true);

    // And it drives through catchup to a genuine SSE-backed live state.
    h.es.emit('offset', '100');
    h.resolveCatchup('c1');
    await tick();

    expect(h.manager.useStore.getState().state).toBe('live');
  });
});
