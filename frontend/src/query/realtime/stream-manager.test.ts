import type { PostAppCatchupResponse, StreamChange, StreamSignal } from 'sdk';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { LeaderMessage } from '~/query/realtime/tab-coordinator';

vi.mock('shared', () => ({ appConfig: { backendUrl: 'http://api.test', slug: 'test' } }));
vi.mock('~/env', () => ({ isDebugMode: false }));
vi.mock('~/lib/tracing', () => ({ reportCriticalError: vi.fn() }));
vi.mock('~/query/realtime/sync-store', () => ({ syncStore: { getState: () => ({ getCatchupViews: () => [] }) } }));
vi.mock('~/query/realtime/view-declaration', () => ({ declareViewsFromMemberships: vi.fn() }));
vi.mock('~/query/basic/entity-query-registry', () => ({ getRegisteredProductEntityTypes: () => [] }));

// Each case imports a fresh page, so the modules it mocks hand out these same functions every time.
const sink = vi.hoisted(() => ({
  postAppCatchup: vi.fn(),
  processAppCatchup: vi.fn((_response: PostAppCatchupResponse) => Promise.resolve()),
  handleStreamChange: vi.fn(),
  handleStreamSignal: vi.fn(),
  setSyncStreamHealthy: vi.fn(),
  setSyncWorkerAway: vi.fn(),
}));
vi.mock('sdk', () => ({ postAppCatchup: sink.postAppCatchup }));
vi.mock('~/query/realtime/catchup-processor', () => ({ processAppCatchup: sink.processAppCatchup }));
vi.mock('~/query/realtime/app-stream-handler', () => ({ handleStreamChange: sink.handleStreamChange }));
vi.mock('~/query/realtime/signal-handlers', () => ({ handleStreamSignal: sink.handleStreamSignal }));
vi.mock('~/query/basic/sync-stale-state', () => ({ setSyncStreamHealthy: sink.setSyncStreamHealthy, setSyncWorkerAway: sink.setSyncWorkerAway }));

// The tab coordinator: a leadership the cases flip, what this tab posts, and what the leader tab posted to this one.
const tabs = vi.hoisted(() => {
  const state = { isLeader: true };
  const subscribers = new Set<(state: { isLeader: boolean }) => void>();
  let handler: ((message: LeaderMessage) => void) | null = null;
  return {
    initTabCoordinator: vi.fn(() => Promise.resolve()),
    postToFollowers: vi.fn<(message: LeaderMessage) => void>(),
    onLeaderMessage: (fn: (message: LeaderMessage) => void) => {
      handler = fn;
    },
    /** What the leader tab posted, as the coordinator hands it to a follower. */
    receive: (message: LeaderMessage) => handler?.(message),
    isLeader: () => state.isLeader,
    store: {
      getState: () => ({ isLeader: state.isLeader }),
      subscribe: (fn: (state: { isLeader: boolean }) => void) => {
        subscribers.add(fn);
        return () => subscribers.delete(fn);
      },
    },
    setLeader: (next: boolean) => {
      state.isLeader = next;
      for (const fn of subscribers) fn({ isLeader: next });
    },
    reset: () => {
      state.isLeader = true;
      subscribers.clear();
    },
  };
});
vi.mock('~/query/realtime/tab-coordinator', () => ({
  initTabCoordinator: tabs.initTabCoordinator,
  isLeader: tabs.isLeader,
  onLeaderMessage: tabs.onLeaderMessage,
  postToFollowers: tabs.postToFollowers,
  tabCoordinatorStore: tabs.store,
}));

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

/** Flush pending microtasks so awaited catchup continuations run. */
const tick = () => new Promise((r) => setTimeout(r, 0));

const answer: PostAppCatchupResponse = { organizations: {}, generation: 3 };
const answered = () => Promise.resolve(answer);

/** What this tab posted to the follower tabs, of one kind. */
const posted = (type: LeaderMessage['type']) => tabs.postToFollowers.mock.calls.flatMap(([message]) => (message.type === type ? [message] : []));

let current: { disconnect: () => void } | undefined;

/**
 * The stream manager of a fresh page, whose module holds the one manager and the gate paused writes wait on. It records
 * the start and the end of each catchup request and each change it applies; a request waits for `resolveCatchup`
 * unless `catchup` answers it.
 */
async function createHarness(catchup?: () => Promise<PostAppCatchupResponse>) {
  vi.resetModules();
  const { appStreamManager: manager, waitForActiveCatchup } = await import('~/query/realtime/stream-manager');
  current = manager;
  const order: string[] = [];
  let resolveCatchup: (() => void) | undefined;

  sink.postAppCatchup.mockImplementation(
    catchup ??
      (() =>
        new Promise<PostAppCatchupResponse>((resolve) => {
          order.push('catchup-start');
          resolveCatchup = () => {
            order.push('catchup-done');
            resolve(answer);
          };
        })),
  );
  sink.handleStreamChange.mockImplementation((change: { id?: string }) => order.push(`process:${change.id}`));

  return {
    manager,
    order,
    waitForActiveCatchup,
    resolveCatchup: () => resolveCatchup?.(),
    get es() {
      return FakeEventSource.instances.at(-1) as FakeEventSource;
    },
  };
}

beforeEach(() => {
  FakeEventSource.instances = [];
  tabs.reset();
});

afterEach(() => {
  current?.disconnect();
  current = undefined;
  vi.useRealTimers();
  vi.resetAllMocks();
});

describe('StreamManager subscribe-then-snapshot', () => {
  it('applies a change committed while catchup reads once, after the catchup: the stream opens first and catchup starts at its offset', async () => {
    const h = await createHarness();
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
      const h = await createHarness(() => {
        reads++;
        if (reads <= bursts) for (let i = 0; i < 501; i++) h.es.emit('change', JSON.stringify({ id: `r${reads}-${i}` }));
        return answered();
      });
      await h.manager.connect();
      h.es.emit('offset');
      await tick();
      return { h, reads };
    };

    // The dropped batch is covered by the second catchup read.
    const once = await connectThroughBursts(1);
    expect(once.reads).toBe(2);
    expect(sink.handleStreamChange).not.toHaveBeenCalled();
    expect(once.h.manager.store.getState().state).toBe('live');
    once.h.manager.disconnect();

    // A burst that outlasts the second read ends the cycle, and no third read follows.
    const twice = await connectThroughBursts(2);
    expect(twice.reads).toBe(2);
    expect(twice.h.manager.store.getState().state).toBe('error');
    expect(twice.h.es.readyState).toBe(FakeEventSource.CLOSED);
  });
});

describe('StreamManager leader promotion', () => {
  it('opens an SSE when a broadcast-only follower is promoted to leader', async () => {
    tabs.setLeader(false); // start as a follower
    const h = await createHarness();

    await h.manager.connect();

    // Follower parks in broadcast-only 'live' with no SSE.
    expect(FakeEventSource.instances).toHaveLength(0);
    expect(h.manager.store.getState().state).toBe('live');

    // Leader tab closes: the Web Lock transfers and this tab is promoted.
    tabs.setLeader(true);
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
  /** Whether the gate of the page opened by now. */
  const releasedBy = (waitForActiveCatchup: () => Promise<void>) => Promise.race([waitForActiveCatchup().then(() => true), tick().then(() => false)]);

  it('must not stay closed in a follower tab, which runs no catchup of its own', async () => {
    tabs.setLeader(false);
    const { manager, waitForActiveCatchup } = await createHarness();

    // Positive control: before any tab connected, the gate is closed.
    expect(await releasedBy(waitForActiveCatchup)).toBe(false);

    await manager.connect();

    expect(FakeEventSource.instances).toHaveLength(0);
    expect(await releasedBy(waitForActiveCatchup)).toBe(true);
  });

  // A server error frame reconnected without counting a failure, so a server that kept ending the stream that way held the gate for good.
  it.each([
    ['in transport', (stream?: FakeEventSource) => stream?.onerror?.()],
    ['by a server error frame', (stream?: FakeEventSource) => stream?.emitServerError('access_changed')],
  ])('opens once a stream that keeps failing %s gives up, and stays closed while it reconnects', async (_how, fail) => {
    vi.useFakeTimers();
    const { manager, waitForActiveCatchup } = await createHarness(answered);
    let released = false;
    void waitForActiveCatchup().then(() => {
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
  });

  it('must not open before catchup when the tab wins leadership while it connects, which reconnects it', async () => {
    // The election this tab waits on in connect() makes it the leader.
    tabs.setLeader(false);
    tabs.initTabCoordinator.mockImplementationOnce(async () => tabs.setLeader(true));
    const h = await createHarness();

    await h.manager.connect();
    await tick();
    expect(FakeEventSource.instances).toHaveLength(1);
    expect(await releasedBy(h.waitForActiveCatchup)).toBe(false);

    h.es.emit('offset');
    await tick();
    expect(await releasedBy(h.waitForActiveCatchup)).toBe(false);

    h.resolveCatchup();
    await tick();
    expect(await releasedBy(h.waitForActiveCatchup)).toBe(true);
  });
});

describe('StreamManager server-sent errors', () => {
  const closedByServer = async (code: string) => {
    vi.useFakeTimers();
    const h = await createHarness();
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

  /** The server writes a `ping` event this often. */
  const keepaliveMs = 30_000;
  /** The watchdog's limit: 2.5 keepalive intervals. */
  const silenceMs = 75_000;

  const liveStream = async () => {
    const h = await createHarness(answered);
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
  });
});

describe('a catchup answer, from the leader to its follower tabs', () => {
  it('is passed on by the leader before it processes the answer itself', async () => {
    const h = await createHarness(answered);

    await h.manager.connect();
    h.es.emit('offset');
    await tick();

    expect(posted('catchup')).toEqual([{ type: 'catchup', response: answer }]);
    expect(sink.processAppCatchup).toHaveBeenCalledExactlyOnceWith(answer);
    const postedAt = tabs.postToFollowers.mock.calls.findIndex(([message]) => message.type === 'catchup');
    expect(tabs.postToFollowers.mock.invocationCallOrder[postedAt]).toBeLessThan(sink.processAppCatchup.mock.invocationCallOrder[0]);
    expect(h.manager.store.getState().state).toBe('live');
  });

  it('is processed by a follower, which sends no request of its own', async () => {
    tabs.setLeader(false);
    const h = await createHarness();
    await h.manager.connect();

    tabs.receive({ type: 'catchup', response: answer });
    await tick();

    expect(sink.processAppCatchup).toHaveBeenCalledExactlyOnceWith(answer);
    expect(sink.postAppCatchup).not.toHaveBeenCalled();
    expect(FakeEventSource.instances).toHaveLength(0);
    // A follower passes nothing on: the leader told every tab.
    expect(posted('catchup')).toEqual([]);
  });
});

describe('StreamManager changes and signals in follower tabs', () => {
  const change: StreamChange = {
    action: 'update',
    productType: 'attachment',
    organizationId: 'org-1',
    tenantId: null,
    channelId: null,
    rows: [],
    overflow: null,
    spreadWindow: null,
    propagation: null,
  };
  const signal: StreamSignal = { type: 'notification.read', organizationId: null, subjectId: null };

  it('passes a change on when the leader applies it: one that arrived during catchup follows the catchup answer', async () => {
    const h = await createHarness();
    await h.manager.connect();
    h.es.emit('offset');

    h.es.emit('change', JSON.stringify({ id: 'a1' }));
    expect(posted('stream-change')).toEqual([]);

    h.resolveCatchup();
    await tick();
    expect(posted('stream-change')).toEqual([{ type: 'stream-change', change: { id: 'a1' } }]);

    h.es.emit('change', JSON.stringify({ id: 'b1' }));
    expect(posted('stream-change').at(-1)).toEqual({ type: 'stream-change', change: { id: 'b1' } });
    const frames = tabs.postToFollowers.mock.calls.flatMap(([message]) => (message.type === 'sync-health' ? [] : [message.type]));
    expect(frames).toEqual(['catchup', 'stream-change', 'stream-change']);
    expect(h.order).toEqual(['catchup-start', 'catchup-done', 'process:a1', 'process:b1']);
  });

  it('applies what the leader posted while it follows, and nothing once the tab left the app', async () => {
    tabs.setLeader(false);
    const h = await createHarness();
    await h.manager.connect();

    tabs.receive({ type: 'stream-change', change });
    tabs.receive({ type: 'stream-signal', signal });
    expect(sink.handleStreamChange).toHaveBeenCalledExactlyOnceWith(change);
    expect(sink.handleStreamSignal).toHaveBeenCalledExactlyOnceWith(signal);

    // A public page disconnects the stream: the tab keeps its channel, and takes no frame or answer from it.
    h.manager.disconnect();
    tabs.receive({ type: 'stream-change', change });
    tabs.receive({ type: 'stream-signal', signal });
    tabs.receive({ type: 'catchup', response: answer });
    await tick();

    expect(sink.handleStreamChange).toHaveBeenCalledOnce();
    expect(sink.handleStreamSignal).toHaveBeenCalledOnce();
    expect(sink.processAppCatchup).not.toHaveBeenCalled();
  });
});

describe('the health of live delivery', () => {
  /** The app stream of a leader tab, open and past its catchup. */
  const connectLive = async () => {
    const h = await createHarness(answered);
    await h.manager.connect();
    h.es.emit('offset');
    await tick();
    return h.es;
  };
  const lastHealthPosted = () => posted('sync-health').at(-1);

  it("takes from a ping that the server's worker is away, and from a later one that it is back", async () => {
    const stream = await connectLive();

    stream.emit('ping', 'worker_away');
    expect(sink.setSyncWorkerAway).toHaveBeenLastCalledWith(true);
    expect(lastHealthPosted()).toEqual({ type: 'sync-health', health: { streamHealthy: true, workerAway: true } });

    stream.emit('ping', '');
    expect(sink.setSyncWorkerAway).toHaveBeenLastCalledWith(false);
    expect(lastHealthPosted()).toEqual({ type: 'sync-health', health: { streamHealthy: true, workerAway: false } });
  });

  it('tells the follower tabs that the stream failed', async () => {
    const stream = await connectLive();

    stream.emitServerError('internal');

    expect(sink.setSyncStreamHealthy).toHaveBeenLastCalledWith(false);
    expect(lastHealthPosted()).toEqual({ type: 'sync-health', health: { streamHealthy: false, workerAway: false } });
  });

  it("must not take a follower's own store for the health of a stream: it has none, and takes the leader's word, before it connects and after", async () => {
    tabs.setLeader(false);
    const h = await createHarness();

    tabs.receive({ type: 'sync-health', health: { streamHealthy: false, workerAway: true } });
    await h.manager.connect();
    expect(h.manager.store.getState().state).toBe('live');

    expect(sink.setSyncStreamHealthy).toHaveBeenCalledExactlyOnceWith(false);
    expect(sink.setSyncWorkerAway).toHaveBeenCalledExactlyOnceWith(true);

    tabs.receive({ type: 'sync-health', health: { streamHealthy: true, workerAway: false } });
    expect(sink.setSyncStreamHealthy).toHaveBeenLastCalledWith(true);
    expect(sink.setSyncWorkerAway).toHaveBeenLastCalledWith(false);
    expect(posted('sync-health')).toEqual([]);
  });

  it('says what its own stream shows once a follower leads, whatever it last heard', async () => {
    tabs.setLeader(false);
    const h = await createHarness(answered);
    await h.manager.connect();
    tabs.receive({ type: 'sync-health', health: { streamHealthy: false, workerAway: true } });

    tabs.setLeader(true);
    await tick();
    h.es.emit('ping', '');

    expect(sink.setSyncStreamHealthy).toHaveBeenLastCalledWith(true);
    expect(sink.setSyncWorkerAway).toHaveBeenLastCalledWith(false);
    expect(lastHealthPosted()).toEqual({ type: 'sync-health', health: { streamHealthy: true, workerAway: false } });
  });
});
