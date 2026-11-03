import type { PostAppCatchupResponse } from 'sdk';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('shared', () => ({ appConfig: { backendUrl: 'http://api.test', slug: 'test' } }));
vi.mock('~/env', () => ({ isDebugMode: false }));
vi.mock('~/lib/tracing', () => ({ reportCriticalError: vi.fn() }));
vi.mock('~/query/basic/sync-stale-state', () => ({ setSyncStreamHealthy: vi.fn(), setSyncWorkerAway: vi.fn() }));
vi.mock('~/query/realtime/sync-store', () => ({ syncStore: { getState: () => ({ getCatchupViews: () => [] }) } }));
vi.mock('~/query/realtime/app-stream-handler', () => ({ handleStreamChange: vi.fn() }));
vi.mock('~/query/realtime/view-declaration', () => ({ declareViewsFromMemberships: vi.fn() }));
vi.mock('~/query/realtime/catchup-processor', () => ({ processAppCatchup: vi.fn(() => Promise.resolve()) }));
vi.mock('~/query/basic/entity-query-registry', () => ({ getRegisteredProductEntityTypes: () => [] }));
// Controllable leader state so tests can drive the follower -> leader promotion transition, and hand a tab what the leader posted.
const leaderControl = vi.hoisted(() => {
  const state = { isLeader: true };
  const subscribers = new Set<(state: { isLeader: boolean }, previous: { isLeader: boolean }) => void>();
  const catchupHandlers = new Set<(response: PostAppCatchupResponse) => void>();
  const healthHandlers = new Set<(health: { streamHealthy: boolean; workerAway: boolean }) => void>();
  return {
    onSyncHealth: (fn: (health: { streamHealthy: boolean; workerAway: boolean }) => void) => {
      healthHandlers.add(fn);
      return () => healthHandlers.delete(fn);
    },
    /** The health of the leader's stream, as the coordinator hands it to this tab. */
    receiveSyncHealth: (health: { streamHealthy: boolean; workerAway: boolean }) => {
      for (const fn of healthHandlers) fn(health);
    },
    isLeader: () => state.isLeader,
    getState: () => ({ isLeader: state.isLeader }),
    subscribe: (fn: (state: { isLeader: boolean }, previous: { isLeader: boolean }) => void) => {
      subscribers.add(fn);
      return () => subscribers.delete(fn);
    },
    setLeader: (next: boolean) => {
      const previous = state.isLeader;
      state.isLeader = next;
      for (const fn of subscribers) fn({ isLeader: next }, { isLeader: previous });
    },
    onCatchup: (fn: (response: PostAppCatchupResponse) => void) => {
      catchupHandlers.add(fn);
      return () => catchupHandlers.delete(fn);
    },
    /** A catchup answer the leader tab posted, as the coordinator hands it to this tab. */
    receiveCatchup: (response: PostAppCatchupResponse) => {
      for (const fn of catchupHandlers) fn(response);
    },
    reset: () => {
      state.isLeader = true;
      subscribers.clear();
      catchupHandlers.clear();
    },
  };
});

vi.mock('~/query/realtime/tab-coordinator', () => ({
  broadcastCatchup: vi.fn(),
  broadcastStreamChange: vi.fn(),
  broadcastStreamSignal: vi.fn(),
  broadcastSyncHealth: vi.fn(),
  onSyncHealth: leaderControl.onSyncHealth,
  initTabCoordinator: vi.fn(() => Promise.resolve()),
  isLeader: () => leaderControl.isLeader(),
  onCatchup: leaderControl.onCatchup,
  onStreamChange: vi.fn(() => () => {}),
  onStreamSignal: vi.fn(() => () => {}),
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

  emit(type: string, data = '') {
    for (const fn of this.listeners.get(type) ?? []) fn({ data } as MessageEvent);
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
const { processAppCatchup } = await import('~/query/realtime/catchup-processor');
const { broadcastCatchup, broadcastStreamChange, broadcastSyncHealth } = await import('~/query/realtime/tab-coordinator');
const { setSyncStreamHealthy, setSyncWorkerAway } = await import('~/query/basic/sync-stale-state');
const { StreamManager, appStreamManager } = await import('~/query/realtime/stream-manager');

/** Flush pending microtasks so awaited catchup continuations run. */
const tick = () => new Promise((r) => setTimeout(r, 0));

let managerCount = 0;

function createHarness(overrides?: { fetchAndProcessCatchup?: () => Promise<void>; useTabCoordination?: boolean }) {
  const order: string[] = [];
  const processed: unknown[] = [];
  let resolveCatchup: (() => void) | undefined;

  const manager = new StreamManager(`TestStream-${managerCount++}`, {
    endpoint: 'http://api.test/stream',
    withCredentials: false,
    useTabCoordination: overrides?.useTabCoordination ?? false,
    fetchAndProcessCatchup:
      overrides?.fetchAndProcessCatchup ??
      (() =>
        new Promise<void>((resolve) => {
          order.push('catchup-start');
          resolveCatchup = () => {
            order.push('catchup-done');
            resolve();
          };
        })),
    processLeaderCatchup: () => Promise.resolve(),
    processChange: (n: unknown) => {
      order.push(`process:${(n as { id: string }).id}`);
      processed.push(n);
    },
    processSignal: () => {},
  });

  return {
    manager,
    order,
    processed,
    resolveCatchup: () => resolveCatchup?.(),
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
  it('applies a change committed while catchup reads once, after the catchup: the stream opens first and catchup starts at its offset', async () => {
    const h = createHarness();
    await h.manager.connect();

    expect(FakeEventSource.instances).toHaveLength(1);
    expect(h.order).toEqual([]); // catchup waits for the server offset

    h.es.emit('offset');
    // Committed between the catchup read and its response: must buffer, not process.
    h.es.emit('change', JSON.stringify({ id: 'a1' }));
    expect(h.order).toEqual(['catchup-start']);

    h.resolveCatchup();
    await tick();

    expect(h.order).toEqual(['catchup-start', 'catchup-done', 'process:a1']);
    expect(h.manager.store.getState().state).toBe('live');
  });

  it('covers a burst that overflows the buffer with one more catchup read, and ends the cycle when that read overflows as well', async () => {
    /** Connects through a catchup whose first `bursts` reads each see more changes arrive than the buffer holds. */
    const connectThroughBursts = async (bursts: number) => {
      let reads = 0;
      const h = createHarness({
        fetchAndProcessCatchup: () => {
          reads++;
          if (reads <= bursts) for (let i = 0; i < 501; i++) h.es.emit('change', JSON.stringify({ id: `r${reads}-${i}` }));
          return Promise.resolve();
        },
      });
      await h.manager.connect();
      h.es.emit('offset');
      await tick();
      return { h, reads };
    };

    // The dropped batch is covered by the second catchup read.
    const once = await connectThroughBursts(1);
    expect(once.reads).toBe(2);
    expect(once.h.processed).toHaveLength(0);
    expect(once.h.manager.store.getState().state).toBe('live');

    // A burst that outlasts the second read ends the cycle, and no third read follows.
    const twice = await connectThroughBursts(2);
    expect(twice.reads).toBe(2);
    expect(twice.h.manager.store.getState().state).toBe('error');
    expect(twice.h.es.readyState).toBe(FakeEventSource.CLOSED);
  });
});

describe('StreamManager leader promotion', () => {
  it('opens an SSE when a broadcast-only follower is promoted to leader', async () => {
    leaderControl.setLeader(false); // start as a follower
    const h = createHarness({ useTabCoordination: true });

    await h.manager.connect();

    // Follower parks in broadcast-only 'live' with no SSE.
    expect(FakeEventSource.instances).toHaveLength(0);
    expect(h.manager.store.getState().state).toBe('live');

    // Leader tab closes: the Web Lock transfers and this tab is promoted.
    leaderControl.setLeader(true);
    await tick();

    // Regression: the promoted tab must open a real SSE, not early-return on the stale 'live' state.
    expect(FakeEventSource.instances).toHaveLength(1);
    expect(h.manager.isConnected()).toBe(true);

    // And it drives through catchup to a genuine SSE-backed live state.
    h.es.emit('offset');
    h.resolveCatchup();
    await tick();

    expect(h.manager.store.getState().state).toBe('live');
  });
});

/** Longest first reconnect delay: the initial backoff plus the full jitter. */
const firstReconnectMs = 7_000;

describe('the gate that paused writes wait on', () => {
  afterEach(() => vi.useRealTimers());

  it('must not stay closed in a follower tab, which runs no catchup of its own', async () => {
    // The gate lives for the page: a fresh module is a fresh page.
    vi.resetModules();
    const fresh = await import('~/query/realtime/stream-manager');
    leaderControl.setLeader(false);
    const manager = new fresh.StreamManager(`TestStream-${managerCount++}`, {
      endpoint: 'http://api.test/stream',
      withCredentials: false,
      useTabCoordination: true,
      fetchAndProcessCatchup: () => Promise.resolve(),
      processLeaderCatchup: () => Promise.resolve(),
      processChange: () => {},
      processSignal: () => {},
    });
    const released = () => Promise.race([fresh.waitForActiveCatchup().then(() => true), tick().then(() => false)]);

    // Positive control: before any tab connected, the gate is closed.
    expect(await released()).toBe(false);

    await manager.connect();

    expect(FakeEventSource.instances).toHaveLength(0);
    expect(await released()).toBe(true);
    manager.disconnect();
  });

  // A server error frame reconnected without counting a failure, so a server that kept ending the stream that way held the gate for good.
  it.each([
    ['in transport', (stream?: FakeEventSource) => stream?.onerror?.()],
    ['by a server error frame', (stream?: FakeEventSource) => stream?.emitServerError('access_changed')],
  ])('opens once a stream that keeps failing %s gives up, and stays closed while it reconnects', async (_how, fail) => {
    vi.useFakeTimers();
    vi.resetModules();
    const fresh = await import('~/query/realtime/stream-manager');
    const manager = new fresh.StreamManager(`TestStream-${managerCount++}`, {
      endpoint: 'http://api.test/stream',
      withCredentials: false,
      useTabCoordination: false,
      fetchAndProcessCatchup: () => Promise.resolve(),
      processLeaderCatchup: () => Promise.resolve(),
      processChange: () => {},
      processSignal: () => {},
    });
    let released = false;
    void fresh.waitForActiveCatchup().then(() => {
      released = true;
    });
    // The stream opens and fails before its offset event, so no catchup runs.
    const failStream = () => fail(FakeEventSource.instances.at(-1));

    await manager.connect();
    failStream();
    await vi.advanceTimersByTimeAsync(firstReconnectMs);
    failStream();
    await vi.advanceTimersByTimeAsync(2 * firstReconnectMs);
    expect(FakeEventSource.instances).toHaveLength(3);
    expect(released).toBe(false);

    // The third failure in a row opens the circuit: queued writes replay through the API.
    failStream();
    await vi.advanceTimersByTimeAsync(0);
    expect(released).toBe(true);
    manager.disconnect();
  });

  it('must not open before catchup when the tab wins leadership while it connects, which reconnects it', async () => {
    vi.resetModules();
    const fresh = await import('~/query/realtime/stream-manager');
    const coordinator = await import('~/query/realtime/tab-coordinator');
    // The election this tab waits on in connect() makes it the leader.
    leaderControl.setLeader(false);
    vi.mocked(coordinator.initTabCoordinator).mockImplementationOnce(async () => leaderControl.setLeader(true));
    let finishCatchup = () => {};
    const manager = new fresh.StreamManager(`TestStream-${managerCount++}`, {
      endpoint: 'http://api.test/stream',
      withCredentials: false,
      useTabCoordination: true,
      fetchAndProcessCatchup: () =>
        new Promise((resolve) => {
          finishCatchup = () => resolve();
        }),
      processLeaderCatchup: () => Promise.resolve(),
      processChange: () => {},
      processSignal: () => {},
    });
    const released = () => Promise.race([fresh.waitForActiveCatchup().then(() => true), tick().then(() => false)]);

    await manager.connect();
    await tick();
    expect(FakeEventSource.instances).toHaveLength(1);
    expect(await released()).toBe(false);

    FakeEventSource.instances[0].emit('offset');
    await tick();
    expect(await released()).toBe(false);

    finishCatchup();
    await tick();
    expect(await released()).toBe(true);
    manager.disconnect();
  });
});

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

    await vi.advanceTimersByTimeAsync(firstReconnectMs);

    expect(FakeEventSource.instances).toHaveLength(2);
    expect(h.es.readyState).toBe(FakeEventSource.OPEN);
    h.manager.disconnect();
  });

  it('stays closed after unauthorized: the session is gone, and the next request signs the user out', async () => {
    const h = await closedByServer('unauthorized');

    await vi.advanceTimersByTimeAsync(5 * 60_000);

    expect(FakeEventSource.instances).toHaveLength(1);
    expect(h.manager.store.getState().state).toBe('error');
  });
});

describe('StreamManager silence watchdog', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  /** The server writes a `ping` event this often. */
  const keepaliveMs = 30_000;
  /** The watchdog's limit: 2.5 keepalive intervals. */
  const silenceMs = 75_000;

  const liveStream = async () => {
    const h = createHarness({ fetchAndProcessCatchup: () => Promise.resolve() });
    await h.manager.connect();
    h.es.emit('offset');
    await vi.advanceTimersByTimeAsync(0);
    expect(h.manager.store.getState().state).toBe('live');
    return h;
  };

  it('fails a stream that brings no event for 75 seconds and reconnects after the backoff, while a ping or a change keeps it open', async () => {
    const h = await liveStream();
    const stream = h.es;

    // The server's keepalive holds it open for minutes.
    for (let i = 0; i < 10; i++) {
      await vi.advanceTimersByTimeAsync(keepaliveMs);
      stream.emit('ping', '');
    }
    // A change counts as well: the 75 seconds run from it, not from the last ping.
    await vi.advanceTimersByTimeAsync(60_000);
    stream.emit('change', JSON.stringify({ id: 'a1' }));

    await vi.advanceTimersByTimeAsync(silenceMs - 1);
    expect(stream.readyState).toBe(FakeEventSource.OPEN);
    expect(h.manager.store.getState().state).toBe('live');

    await vi.advanceTimersByTimeAsync(1);
    expect(stream.readyState).toBe(FakeEventSource.CLOSED);
    expect(h.manager.store.getState().state).toBe('error');

    await vi.advanceTimersByTimeAsync(firstReconnectMs);
    expect(FakeEventSource.instances).toHaveLength(2);
    expect(h.es.readyState).toBe(FakeEventSource.OPEN);
    h.manager.disconnect();
  });
});

describe('a catchup answer, from the leader to its follower tabs', () => {
  const answer: PostAppCatchupResponse = { organizations: {}, generation: 3 };

  afterEach(() => appStreamManager.disconnect());

  it('is passed on by the leader before it processes the answer itself', async () => {
    vi.mocked(postAppCatchup).mockResolvedValueOnce(answer);

    await appStreamManager.connect();
    FakeEventSource.instances.at(-1)?.emit('offset');
    await tick();

    expect(broadcastCatchup).toHaveBeenCalledExactlyOnceWith(answer);
    expect(processAppCatchup).toHaveBeenCalledExactlyOnceWith(answer);
    expect(vi.mocked(broadcastCatchup).mock.invocationCallOrder[0]).toBeLessThan(vi.mocked(processAppCatchup).mock.invocationCallOrder[0]);
    expect(appStreamManager.store.getState().state).toBe('live');
  });

  it('is processed by a follower, which sends no request of its own', async () => {
    leaderControl.setLeader(false);
    await appStreamManager.connect();

    leaderControl.receiveCatchup(answer);
    await tick();

    expect(processAppCatchup).toHaveBeenCalledExactlyOnceWith(answer);
    expect(postAppCatchup).not.toHaveBeenCalled();
    expect(FakeEventSource.instances).toHaveLength(0);
    // A follower passes nothing on: the leader told every tab.
    expect(broadcastCatchup).not.toHaveBeenCalled();
  });
});

describe('StreamManager changes to follower tabs', () => {
  it('passes a change on when the leader applies it: one that arrived during catchup follows the catchup answer', async () => {
    const h = createHarness({ useTabCoordination: true });
    await h.manager.connect();
    h.es.emit('offset');

    h.es.emit('change', JSON.stringify({ id: 'a1' }));
    expect(broadcastStreamChange).not.toHaveBeenCalled();

    h.resolveCatchup();
    await tick();
    expect(broadcastStreamChange).toHaveBeenCalledExactlyOnceWith({ id: 'a1' });

    h.es.emit('change', JSON.stringify({ id: 'b1' }));
    expect(broadcastStreamChange).toHaveBeenLastCalledWith({ id: 'b1' });
    expect(h.order).toEqual(['catchup-start', 'catchup-done', 'process:a1', 'process:b1']);
    h.manager.disconnect();
  });
});

describe('the health of live delivery', () => {
  afterEach(() => appStreamManager.disconnect());

  /** The app stream of a leader tab, open and past its catchup. */
  const connectLive = async () => {
    vi.mocked(postAppCatchup).mockResolvedValueOnce({ organizations: {}, generation: 1 });
    await appStreamManager.connect();
    const stream = FakeEventSource.instances.at(-1) as FakeEventSource;
    stream.emit('offset');
    await tick();
    return stream;
  };

  it("takes from a ping that the server's worker is away, and from a later one that it is back", async () => {
    const stream = await connectLive();

    stream.emit('ping', 'worker_away');
    expect(setSyncWorkerAway).toHaveBeenLastCalledWith(true);
    expect(broadcastSyncHealth).toHaveBeenLastCalledWith({ streamHealthy: true, workerAway: true });

    stream.emit('ping', '');
    expect(setSyncWorkerAway).toHaveBeenLastCalledWith(false);
    expect(broadcastSyncHealth).toHaveBeenLastCalledWith({ streamHealthy: true, workerAway: false });
  });

  it('tells the follower tabs that the stream failed', async () => {
    const stream = await connectLive();

    stream.emitServerError('internal');

    expect(setSyncStreamHealthy).toHaveBeenLastCalledWith(false);
    expect(broadcastSyncHealth).toHaveBeenLastCalledWith({ streamHealthy: false, workerAway: false });
  });

  it("must not take a follower's own store for the health of a stream: it has none, and takes the leader's word", async () => {
    leaderControl.setLeader(false);
    await appStreamManager.connect();
    expect(appStreamManager.store.getState().state).toBe('live');
    expect(setSyncStreamHealthy).not.toHaveBeenCalled();

    leaderControl.receiveSyncHealth({ streamHealthy: false, workerAway: true });

    expect(setSyncStreamHealthy).toHaveBeenLastCalledWith(false);
    expect(setSyncWorkerAway).toHaveBeenLastCalledWith(true);
    expect(broadcastSyncHealth).not.toHaveBeenCalled();
  });

  it('says what its own stream shows once a follower leads, whatever it last heard', async () => {
    leaderControl.setLeader(false);
    await appStreamManager.connect();
    leaderControl.receiveSyncHealth({ streamHealthy: false, workerAway: true });

    leaderControl.setLeader(true);
    await tick();
    FakeEventSource.instances.at(-1)?.emit('ping', '');

    expect(setSyncStreamHealthy).toHaveBeenLastCalledWith(true);
    expect(setSyncWorkerAway).toHaveBeenLastCalledWith(false);
    expect(broadcastSyncHealth).toHaveBeenLastCalledWith({ streamHealthy: true, workerAway: false });
  });
});
