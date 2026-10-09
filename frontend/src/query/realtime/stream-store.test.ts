import type { PostAppCatchupResponse } from 'sdk';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('shared', () => ({ appConfig: { backendUrl: 'http://api.test', slug: 'test' } }));
vi.mock('~/env', () => ({ isDebugMode: false }));
vi.mock('~/lib/tracing', () => ({ reportCriticalError: vi.fn() }));
vi.mock('~/query/basic/sync-stale-state', () => ({ setSyncStreamHealthy: vi.fn() }));
// The stream cursor of this tab's sync store: settable, and its writes observed.
const syncControl = vi.hoisted(() => ({ cursor: null as string | null, setCursor: vi.fn() }));
vi.mock('~/query/realtime/sync-store', () => ({
  syncStore: {
    getState: () => ({ cursor: syncControl.cursor, setCursor: syncControl.setCursor, setLastSyncAt: vi.fn(), getCatchupViews: () => [] }),
  },
}));
vi.mock('./app-stream-handler', () => ({ handleAppStreamNotification: vi.fn() }));
vi.mock('./view-declaration', () => ({ declareViewsFromMemberships: vi.fn() }));
vi.mock('./catchup-processor', () => ({ catchupEntityTypes: () => [], processAppCatchup: vi.fn(() => Promise.resolve()) }));
// Controllable leader state so tests can drive the follower -> leader promotion transition, and hand a tab what the leader posted.
const leaderControl = vi.hoisted(() => {
  const state = { isLeader: true };
  const subscribers = new Set<(s: { isLeader: boolean }, p: { isLeader: boolean }) => void>();
  const catchupHandlers = new Set<(response: PostAppCatchupResponse, baselineOnly: boolean) => void>();
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
    onCatchup: (fn: (response: PostAppCatchupResponse, baselineOnly: boolean) => void) => {
      catchupHandlers.add(fn);
      return () => catchupHandlers.delete(fn);
    },
    /** A catchup answer the leader tab posted, as the coordinator hands it to this tab. */
    receiveCatchup: (response: PostAppCatchupResponse, baselineOnly: boolean) => {
      for (const fn of catchupHandlers) fn(response, baselineOnly);
    },
    reset: () => {
      state.isLeader = true;
      subscribers.clear();
      catchupHandlers.clear();
    },
  };
});

vi.mock('./tab-coordinator', () => ({
  broadcastCatchup: vi.fn(),
  broadcastNotification: vi.fn(),
  initTabCoordinator: vi.fn(() => Promise.resolve()),
  isLeader: () => leaderControl.isLeader(),
  onCatchup: leaderControl.onCatchup,
  onNotification: vi.fn(() => () => {}),
  tabCoordinatorStore: { getState: () => leaderControl.getState(), subscribe: leaderControl.subscribe },
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

  /** The server's typed `error` event, which the browser delivers as a MessageEvent (a transport failure is a bare Event). */
  emitServerError(code: string) {
    const event = new MessageEvent('error', { data: JSON.stringify({ code, message: code }) });
    for (const fn of this.listeners.get('error') ?? []) fn(event);
  }

  close() {
    this.readyState = FakeEventSource.CLOSED;
  }
}

vi.stubGlobal('EventSource', FakeEventSource);
vi.stubGlobal('document', { addEventListener: vi.fn(), removeEventListener: vi.fn(), visibilityState: 'visible' });

const { postAppCatchup } = await import('sdk');
const { processAppCatchup } = await import('./catchup-processor');
const { broadcastCatchup, broadcastNotification } = await import('./tab-coordinator');
const { StreamManager, appStreamManager } = await import('./stream-store');

/** Flush pending microtasks so awaited catchup continuations run. */
const tick = () => new Promise((r) => setTimeout(r, 0));

let managerCount = 0;

function createHarness(overrides?: { fetchAndProcessCatchup?: (cursor: string | null) => Promise<string | null>; useTabCoordination?: boolean }) {
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
    processLeaderCatchup: () => Promise.resolve(),
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
  syncControl.cursor = null;
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

describe('the gate that paused writes wait on', () => {
  it('must not stay closed in a follower tab, which runs no catchup of its own', async () => {
    // The gate lives for the page: a fresh module is a fresh page.
    vi.resetModules();
    const fresh = await import('./stream-store');
    leaderControl.setLeader(false);
    const manager = new fresh.StreamManager(`TestStream-${managerCount++}`, {
      endpoint: 'http://api.test/stream',
      withCredentials: false,
      useTabCoordination: true,
      fetchAndProcessCatchup: () => Promise.resolve(null),
      processLeaderCatchup: () => Promise.resolve(),
      processNotification: () => {},
    });
    const released = () => Promise.race([fresh.waitForActiveCatchup().then(() => true), tick().then(() => false)]);

    // Positive control: before any tab connected, the gate is closed.
    expect(await released()).toBe(false);

    await manager.connect();

    expect(FakeEventSource.instances).toHaveLength(0);
    expect(await released()).toBe(true);
    manager.disconnect();
  });
});

/** Longest first reconnect delay: the initial backoff plus the full jitter. */
const FIRST_RECONNECT_MS = 7_000;

describe('StreamManager server-sent errors', () => {
  afterEach(() => vi.useRealTimers());

  const closedByServer = async (code: string) => {
    vi.useFakeTimers();
    const h = createHarness();
    await h.manager.connect();
    const closed = h.es;
    closed.emitServerError(code);
    expect(closed.readyState).toBe(FakeEventSource.CLOSED);
    return h;
  };

  it.each(['session_replaced', 'access_changed'])('reconnects after %s: the browser still holds a session', async (code) => {
    const h = await closedByServer(code);

    await vi.advanceTimersByTimeAsync(FIRST_RECONNECT_MS);

    expect(FakeEventSource.instances).toHaveLength(2);
    expect(h.es.readyState).toBe(FakeEventSource.OPEN);
    h.manager.disconnect();
  });

  it('stays closed after unauthorized: the session is gone, and the next request signs the user out', async () => {
    const h = await closedByServer('unauthorized');

    await vi.advanceTimersByTimeAsync(5 * 60_000);

    expect(FakeEventSource.instances).toHaveLength(1);
    expect(h.manager.useStore.getState().state).toBe('error');
  });
});

describe('StreamManager silence watchdog', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  /** The server writes a `ping` event this often. */
  const KEEPALIVE_MS = 30_000;
  /** The watchdog's limit: 2.5 keepalive intervals. */
  const SILENCE_MS = 75_000;

  const liveStream = async () => {
    const h = createHarness({ fetchAndProcessCatchup: () => Promise.resolve('c1') });
    await h.manager.connect();
    h.es.emit('offset', '100');
    await vi.advanceTimersByTimeAsync(0);
    expect(h.manager.useStore.getState().state).toBe('live');
    return h;
  };

  it('keeps a stream open for minutes while a ping arrives every 30 seconds', async () => {
    const h = await liveStream();

    for (let i = 0; i < 20; i++) {
      await vi.advanceTimersByTimeAsync(KEEPALIVE_MS);
      h.es.emit('ping', '');
    }

    expect(FakeEventSource.instances).toHaveLength(1);
    expect(h.es.readyState).toBe(FakeEventSource.OPEN);
    expect(h.manager.useStore.getState().state).toBe('live');
    h.manager.disconnect();
  });

  it('closes a stream that stays open but silent for 75 seconds, and reconnects after the backoff', async () => {
    const h = await liveStream();
    const silent = h.es;

    await vi.advanceTimersByTimeAsync(SILENCE_MS - 1);
    expect(silent.readyState).toBe(FakeEventSource.OPEN);

    await vi.advanceTimersByTimeAsync(1);
    expect(silent.readyState).toBe(FakeEventSource.CLOSED);
    expect(h.manager.useStore.getState().state).toBe('error');
    // Only the reconnect is pending: the watchdog ended with its stream.
    expect(vi.getTimerCount()).toBe(1);
    expect(FakeEventSource.instances).toHaveLength(1);

    await vi.advanceTimersByTimeAsync(FIRST_RECONNECT_MS);
    expect(FakeEventSource.instances).toHaveLength(2);
    expect(h.es.readyState).toBe(FakeEventSource.OPEN);
    h.manager.disconnect();
  });

  it('counts a change as activity as well (positive control)', async () => {
    const h = await liveStream();

    await vi.advanceTimersByTimeAsync(60_000);
    h.es.emit('change', JSON.stringify({ id: 'a1' }), '101');

    // No ping arrived since the stream opened 135 seconds before: the 75 seconds count from the change.
    await vi.advanceTimersByTimeAsync(SILENCE_MS - 1);
    expect(h.es.readyState).toBe(FakeEventSource.OPEN);
    expect(h.manager.useStore.getState().state).toBe('live');

    await vi.advanceTimersByTimeAsync(1);
    expect(h.es.readyState).toBe(FakeEventSource.CLOSED);
    h.manager.disconnect();
  });

  it('must not fire after disconnect: no timer is left behind', async () => {
    const h = await liveStream();

    h.manager.disconnect();
    expect(vi.getTimerCount()).toBe(0);

    await vi.advanceTimersByTimeAsync(10 * 60_000);
    expect(h.manager.useStore.getState().state).toBe('disconnected');
    expect(FakeEventSource.instances).toHaveLength(1);
  });

  it('must not outlive a stream the server ended for good', async () => {
    const h = await liveStream();

    h.es.emitServerError('unauthorized');

    // The circuit is open: neither a reconnect nor a watchdog is pending.
    expect(vi.getTimerCount()).toBe(0);
  });

  it('must not outlive a stream that failed in transport: only the reconnect is pending, and nothing once the circuit opens', async () => {
    const h = createHarness({ fetchAndProcessCatchup: () => Promise.resolve('c1') });
    await h.manager.connect();

    h.es.onerror?.();
    expect(vi.getTimerCount()).toBe(1);

    await vi.advanceTimersByTimeAsync(FIRST_RECONNECT_MS);
    h.es.onerror?.();
    await vi.advanceTimersByTimeAsync(2 * FIRST_RECONNECT_MS);
    expect(FakeEventSource.instances).toHaveLength(3);

    h.es.onerror?.();
    expect(vi.getTimerCount()).toBe(0);
    expect(h.manager.useStore.getState().state).toBe('error');
  });
});

describe('a catchup answer, from the leader to its follower tabs', () => {
  const answer: PostAppCatchupResponse = { cursor: 'c9', changes: {}, generation: 3 };

  afterEach(() => appStreamManager.disconnect());

  it('is passed on by the leader before it processes the answer itself', async () => {
    syncControl.cursor = 'c1';
    vi.mocked(postAppCatchup).mockResolvedValueOnce(answer);

    await appStreamManager.connect();
    FakeEventSource.instances.at(-1)?.emit('offset', '100');
    await tick();

    expect(broadcastCatchup).toHaveBeenCalledExactlyOnceWith(answer, false);
    expect(processAppCatchup).toHaveBeenCalledExactlyOnceWith(answer, false);
    expect(vi.mocked(broadcastCatchup).mock.invocationCallOrder[0]).toBeLessThan(vi.mocked(processAppCatchup).mock.invocationCallOrder[0]);
    expect(appStreamManager.useStore.getState().state).toBe('live');
  });

  it('is processed by a follower, which stores its cursor and sends no request of its own', async () => {
    leaderControl.setLeader(false);
    await appStreamManager.connect();

    leaderControl.receiveCatchup(answer, false);
    await tick();

    expect(processAppCatchup).toHaveBeenCalledExactlyOnceWith(answer, false);
    expect(syncControl.setCursor).toHaveBeenCalledExactlyOnceWith('c9');
    expect(postAppCatchup).not.toHaveBeenCalled();
    expect(FakeEventSource.instances).toHaveLength(0);
    // A follower passes nothing on: the leader told every tab.
    expect(broadcastCatchup).not.toHaveBeenCalled();
  });

  it('must not move the cursor of a follower that failed to process it', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    leaderControl.setLeader(false);
    vi.mocked(processAppCatchup).mockRejectedValueOnce(new Error('memberships unreachable'));
    await appStreamManager.connect();

    leaderControl.receiveCatchup(answer, false);
    await tick();

    expect(syncControl.setCursor).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledOnce();
    warn.mockRestore();
  });

  it('must not be processed by a tab that disconnected', async () => {
    leaderControl.setLeader(false);
    await appStreamManager.connect();
    appStreamManager.disconnect();

    leaderControl.receiveCatchup(answer, false);
    await tick();

    expect(processAppCatchup).not.toHaveBeenCalled();
    expect(syncControl.setCursor).not.toHaveBeenCalled();
  });

  it('must not store its cursor in a follower that was promoted while it processed the answer', async () => {
    let finish: () => void = () => {};
    vi.mocked(processAppCatchup).mockReturnValueOnce(new Promise<void>((resolve) => (finish = resolve)));
    leaderControl.setLeader(false);
    await appStreamManager.connect();
    leaderControl.receiveCatchup(answer, false);

    // The leader tab closed: this tab now sends its own request, from the cursor it holds.
    leaderControl.setLeader(true);
    finish();
    await tick();

    expect(syncControl.setCursor).not.toHaveBeenCalledWith('c9');
  });
});

describe('StreamManager notifications to follower tabs', () => {
  it('passes a notification on when the leader applies it: one that arrived during catchup follows the catchup answer', async () => {
    const h = createHarness({ useTabCoordination: true });
    await h.manager.connect();
    h.es.emit('offset', '100');

    h.es.emit('change', JSON.stringify({ id: 'a1' }), '101');
    expect(broadcastNotification).not.toHaveBeenCalled();

    h.resolveCatchup('c1');
    await tick();
    expect(broadcastNotification).toHaveBeenCalledExactlyOnceWith({ id: 'a1' }, 'user');

    h.es.emit('change', JSON.stringify({ id: 'b1' }), '102');
    expect(broadcastNotification).toHaveBeenLastCalledWith({ id: 'b1' }, 'user');
    expect(h.order).toEqual(['catchup-start', 'catchup-done', 'process:a1', 'process:b1']);
    h.manager.disconnect();
  });
});
