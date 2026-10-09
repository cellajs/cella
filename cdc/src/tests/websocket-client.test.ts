import type { EventEmitter } from 'node:events';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/** The socket as the client uses it, with what a test does to it from the API's side. */
interface FakeSocket extends EventEmitter {
  sent: string[];
  ping: () => void;
  /** The API accepts the connection. */
  open(): void;
  /** An open connection is lost. */
  drop(): void;
  /** A connection attempt fails: no API listens. */
  refuse(): void;
}

/** Every socket the client made, newest last. */
const sockets = vi.hoisted(() => [] as FakeSocket[]);

vi.mock('ws', async () => {
  const { EventEmitter } = await import('node:events');
  class Socket extends EventEmitter {
    readyState = 0;
    sent: string[] = [];
    ping = vi.fn();
    constructor() {
      super();
      sockets.push(this);
    }
    send(message: string) {
      this.sent.push(message);
    }
    close() {
      this.readyState = 3;
      this.emit('close', 1000, Buffer.from(''));
    }
    open() {
      this.readyState = 1;
      this.emit('open');
    }
    drop() {
      this.readyState = 3;
      this.emit('close', 1006, Buffer.from(''));
    }
    refuse() {
      this.emit('error', Object.assign(new Error('connect ECONNREFUSED'), { code: 'ECONNREFUSED' }));
      this.drop();
    }
  }
  return { default: Socket };
});

vi.mock('../lib/db', () => ({ cdcDb: { execute: vi.fn(async () => ({ rows: [] })) } }));
// The real monitor measures this test process, which is busy at times.
vi.mock('shared/utils/event-loop-monitor', () => ({ getEventLoopLagMs: () => 0 }));

const latest = () => sockets.at(-1) as FakeSocket;

/** A client of its own for every test: the module keeps one for the life of the worker. */
const freshClient = async () => (await import('../network/websocket-client')).wsClient;

beforeEach(() => {
  vi.resetModules();
  vi.useFakeTimers();
  sockets.length = 0;
});

afterEach(() => {
  vi.useRealTimers();
});

describe('wsClient: since when the API is away', () => {
  it('is not away while the first attempt runs', async () => {
    const wsClient = await freshClient();
    wsClient.connect();

    expect(wsClient.apiAwaySince).toBeNull();
    expect(wsClient.isConnected()).toBe(false);
  });

  it('counts from the first attempt that failed when no connection was ever open, and keeps that moment', async () => {
    const wsClient = await freshClient();
    wsClient.connect();
    latest().refuse();
    const since = wsClient.apiAwaySince;
    expect(since).toEqual(new Date());

    // Every later attempt fails too: the outage started at the first one.
    for (let attempt = 0; attempt < 3; attempt++) {
      await vi.advanceTimersByTimeAsync(6000);
      latest().refuse();
    }
    expect(sockets.length).toBe(4);
    expect(wsClient.apiAwaySince).toBe(since);
  });

  it('counts from the moment an open connection closes, and no longer once one opens', async () => {
    const wsClient = await freshClient();
    wsClient.connect();
    latest().open();
    expect(wsClient.apiAwaySince).toBeNull();

    await vi.advanceTimersByTimeAsync(30_000);
    latest().drop();
    expect(wsClient.apiAwaySince).toEqual(new Date());

    // The client connects again by itself, within its backoff of 1 to 5 seconds.
    await vi.advanceTimersByTimeAsync(1300);
    expect(sockets.length).toBe(2);
    latest().open();
    expect(wsClient.apiAwaySince).toBeNull();
    expect(wsClient.isConnected()).toBe(true);
  });

  it('logs one line when the API goes away and one when it is back, however many attempts lie between', async () => {
    const { log } = await import('../lib/pino');
    const lines = (level: 'info' | 'warn', text: string) => vi.mocked(log[level]).mock.calls.filter(([message]) => String(message).includes(text));
    const before = { away: lines('warn', 'API away').length, reachable: lines('info', 'API reachable').length };
    const wsClient = await freshClient();

    wsClient.connect();
    latest().open();
    latest().drop();
    for (let attempt = 0; attempt < 4; attempt++) {
      await vi.advanceTimersByTimeAsync(6000);
      latest().refuse();
    }
    await vi.advanceTimersByTimeAsync(6000);
    latest().open();

    expect(lines('warn', 'API away').length - before.away).toBe(1);
    expect(lines('info', 'API reachable').length - before.reachable).toBe(2);
  });

  it('sends no ping of its own: the health push is its traffic', async () => {
    const wsClient = await freshClient();
    wsClient.connect();
    latest().open();

    await vi.advanceTimersByTimeAsync(120_000);

    expect(latest().ping).not.toHaveBeenCalled();
  });
});

describe('wsClient.send', () => {
  it('sends the message as JSON over an open connection', async () => {
    const wsClient = await freshClient();
    wsClient.connect();
    latest().open();

    wsClient.send({ activity: { id: 'a-1' } });

    expect(latest().sent).toEqual(['{"activity":{"id":"a-1"}}']);
    expect(wsClient.messagesSent).toBe(1);
  });

  it('throws that the API is unreachable when no connection is open: a passing failure', async () => {
    const wsClient = await freshClient();
    const { ApiUnreachableError, isPassingError } = await import('../services/failure');
    wsClient.connect();

    let thrown: unknown;
    try {
      wsClient.send({ activity: { id: 'a-1' } });
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(ApiUnreachableError);
    expect(isPassingError(thrown)).toBe(true);
    expect(wsClient.messagesSent).toBe(0);
  });

  it('must not report a row that cannot be serialized as the API being away: it fails its flush, and counts toward stuck', async () => {
    const wsClient = await freshClient();
    const { sendMessageToApi } = await import('../services/activity-service');
    const { FlushBuffer } = await import('../services/flush-buffer');
    const { replicationState } = await import('../services/replication-state');
    const { RESOURCE_LIMITS } = await import('../constants');
    const { mockCdcActivity, mockPendingEvent } = await import('./factories');
    wsClient.connect();
    latest().open();

    // The flush hands its one row to the API. A BigInt has no JSON form, so the row itself is the cause.
    const acknowledge = vi.fn(async () => {});
    const buffer = new FlushBuffer(async () => sendMessageToApi(mockCdcActivity(), { id: 'row-1', size: 10n }, {} as never), acknowledge, 10, 1);
    buffer.onFailed = (error, position) => replicationState.recordFailure(position, error);

    for (let read = 1; read <= RESOURCE_LIMITS.reread.stuckAfter; read++) {
      await buffer.enqueue([mockPendingEvent({ lsn: '0/50' })]);
      expect(replicationState.failure).toMatchObject({ position: '0/50', count: read, passing: false, error: expect.stringContaining('BigInt') });
      await buffer.reset();
    }

    expect(replicationState.stuck).toBe(true);
    expect(acknowledge).not.toHaveBeenCalled();
    expect(latest().sent).toEqual([]);
  });
});

describe('wsClient: waiting for the API', () => {
  it('lets a flush wait until a connection opens', async () => {
    const wsClient = await freshClient();
    wsClient.connect();
    let connected = false;
    void wsClient.whenConnected().then(() => {
      connected = true;
    });
    await vi.advanceTimersByTimeAsync(0);
    expect(connected).toBe(false);

    latest().open();
    await vi.advanceTimersByTimeAsync(0);
    expect(connected).toBe(true);
  });

  it('rejects the wait when the worker closes the client for good, and connects no more', async () => {
    const wsClient = await freshClient();
    wsClient.connect();
    const waiting = wsClient.whenConnected();

    wsClient.close();

    await expect(waiting).rejects.toThrow('The API is not reachable');
    await vi.advanceTimersByTimeAsync(60_000);
    expect(sockets.length).toBe(1);
  });
});

describe('the health push at connect', () => {
  it('pushes health as soon as a connection opens, so the API shows no stale report of a worker that just connected', async () => {
    const wsClient = await freshClient();
    const { startHealthReporter, stopHealthReporter } = await import('../network/health-reporter');
    startHealthReporter();
    try {
      wsClient.connect();
      latest().open();

      // At once: the timer would bring the first report 15 seconds later.
      expect(latest().sent).toHaveLength(1);
      expect(JSON.parse(latest().sent[0])).toEqual({
        _control: 'health',
        payload: { status: 'degraded', reasons: ['replication_stopped'], details: expect.any(Object), generation: 1 },
      });

      await vi.advanceTimersByTimeAsync(15_000);
      expect(latest().sent).toHaveLength(2);
    } finally {
      stopHealthReporter();
    }
  });
});
