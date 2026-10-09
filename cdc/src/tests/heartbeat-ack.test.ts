import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { acknowledge, ws } = vi.hoisted(() => ({
  acknowledge: vi.fn(async (_lsn: string) => true),
  ws: { connected: false },
}));

vi.mock('pg-logical-replication', async () => {
  const { EventEmitter } = await import('node:events');
  class LogicalReplicationService extends EventEmitter {
    acknowledge = acknowledge;
  }
  return { LogicalReplicationService, PgoutputPlugin: class {} };
});

vi.mock('../lib/db', () => ({ cdcDb: { execute: vi.fn() }, buildVerifiedSsl: () => undefined, stripSslParams: (url: string) => url }));

vi.mock('../network/websocket-client', () => ({
  wsClient: { isConnected: () => ws.connected, inGracePeriod: () => false, setCallbacks: vi.fn(), connect: vi.fn(), close: vi.fn() },
}));

const { createReplicationService } = await import('../pipeline/replication');
const { replicationState } = await import('../services/replication-state');

const { handleDataMessage, resetBuffers } = await import('../pipeline/handle-message');
const { dmlMessage } = await import('./factories');

// Two ticks: the heartbeat handler defers its reply by one.
const settle = async () => {
  await new Promise((resolve) => setImmediate(resolve));
  await new Promise((resolve) => setImmediate(resolve));
};

describe('replication heartbeat acknowledgement', () => {
  beforeEach(() => {
    replicationState.reset();
    resetBuffers();
    acknowledge.mockClear();
    ws.connected = false;
  });

  /** A worker in the middle of a transaction: the keepalive position lies past what it has recorded. */
  const busyService = async () => {
    const service = createReplicationService();
    replicationState.service = service;
    await handleDataMessage('0/100', { tag: 'begin', xid: 7 } as never);
    return service;
  };

  it('replies with 0/0 before anything was acknowledged, leaving the slot untouched', async () => {
    const service = await busyService();
    service.emit('heartbeat', '0/1F0', Date.now(), true);
    await settle();

    expect(acknowledge).toHaveBeenCalledTimes(1);
    expect(acknowledge).toHaveBeenCalledWith('0/00000000');
  });

  it('repeats the last acknowledged LSN instead of the keepalive position', async () => {
    const service = await busyService();
    replicationState.lastAckedLsn = '0/AB';
    service.emit('heartbeat', '0/1F0', Date.now(), true);
    await settle();

    expect(acknowledge).toHaveBeenCalledWith('0/AB');
    expect(acknowledge).not.toHaveBeenCalledWith('0/1F0');
  });

  it('stays silent when the server does not ask for a reply', async () => {
    const service = await busyService();
    service.emit('heartbeat', '0/1F0', Date.now(), false);
    await settle();

    expect(acknowledge).not.toHaveBeenCalled();
  });

  describe('idle worker', () => {
    const connect = () => {
      ws.connected = true;
      const service = createReplicationService();
      replicationState.service = service;
      return service;
    };

    it.each([
      { case: 'confirms the keepalive position, one byte back because the client adds one', acked: '0/AB', keepalive: '0/1F0', reply: '0/1EF' },
      { case: 'borrows from the high word at a segment boundary', acked: null, keepalive: '2/0', reply: '1/FFFFFFFF' },
      { case: 'never moves backwards', acked: '0/2F0', keepalive: '0/1F0', reply: '0/2F0' },
    ])('$case', async ({ acked, keepalive, reply }) => {
      const service = connect();
      replicationState.lastAckedLsn = acked;
      service.emit('heartbeat', keepalive, Date.now(), true);
      await settle();

      expect(acknowledge).toHaveBeenCalledTimes(1);
      expect(acknowledge).toHaveBeenCalledWith(reply);
    });

    it('holds the position while a transaction is open, then confirms it at the commit', async () => {
      const service = connect();
      replicationState.lastAckedLsn = '0/AB';
      await handleDataMessage('0/100', { tag: 'begin', xid: 7 } as never);
      service.emit('heartbeat', '0/1F0', Date.now(), true);
      await settle();

      expect(acknowledge).toHaveBeenCalledTimes(1);
      expect(acknowledge).toHaveBeenCalledWith('0/AB');

      await handleDataMessage('0/1E0', { tag: 'commit' } as never);
      await settle();

      expect(acknowledge).toHaveBeenLastCalledWith('0/1EF');
    });

    it('must not confirm a keepalive past messages of the same socket read that still wait for their handler', async () => {
      const service = connect();
      replicationState.lastAckedLsn = '0/AB';
      // One socket read, as the client parses it: a commit with nothing to record, a whole transaction, a keepalive.
      // The keepalive is announced at once; the data messages reach their handlers one after another, with no turn
      // of the event loop between them.
      service.emit('heartbeat', '0/1F0', Date.now(), false);
      await handleDataMessage('0/B0', { tag: 'commit' } as never);
      await handleDataMessage('0/C0', { tag: 'begin', xid: 9 } as never);
      await handleDataMessage('0/D0', dmlMessage('insert', 'attachments', { id: 'att-1' }));
      await handleDataMessage('0/E0', { tag: 'commit' } as never);
      await settle();

      // The transaction waits for its flush: 0/1EF would confirm past it, and a crash now would lose it.
      expect(acknowledge).not.toHaveBeenCalledWith('0/1EF');
    });

    it('forgets the keepalive position of a stream that ended', async () => {
      connect();
      replicationState.lastAckedLsn = '0/AB';
      replicationState.lastKeepaliveLsn = '0/1F0';

      // A new subscription reads again from the confirmed position: the first thing it delivers has nothing to record.
      resetBuffers();
      await handleDataMessage('0/B0', { tag: 'commit' } as never);
      await settle();

      expect(acknowledge).not.toHaveBeenCalled();
    });

    it('records no position a stopped service did not send', async () => {
      const service = connect();
      replicationState.lastAckedLsn = '0/AB';
      acknowledge.mockResolvedValueOnce(false);
      service.emit('heartbeat', '0/1F0', Date.now(), false);
      await settle();

      expect(acknowledge).toHaveBeenCalledWith('0/1EF');
      expect(replicationState.lastAckedLsn).toBe('0/AB');
    });

    it('confirms the keepalive position while the API is away: nothing was consumed, so nothing can be lost', async () => {
      const service = connect();
      ws.connected = false;
      replicationState.lastAckedLsn = '0/AB';
      service.emit('heartbeat', '0/1F0', Date.now(), true);
      await settle();

      expect(acknowledge).toHaveBeenCalledWith('0/1EF');
    });
  });
});

describe('replication status timer', () => {
  beforeEach(() => {
    replicationState.reset();
    resetBuffers();
    acknowledge.mockClear();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('repeats the last confirmed position while a flush holds the stream, so the server keeps the connection', async () => {
    const service = createReplicationService();
    replicationState.service = service;
    replicationState.lastAckedLsn = '0/AB';
    // A transaction is open and nothing is read: without the timer the server would hear nothing for as long as that lasts.
    await handleDataMessage('0/100', { tag: 'begin', xid: 7 } as never);

    await vi.advanceTimersByTimeAsync(35_000);

    expect(acknowledge.mock.calls.map(([lsn]) => lsn)).toEqual(['0/AB', '0/AB', '0/AB']);
  });

  it('must not go on for a service that was replaced', async () => {
    const old = createReplicationService();
    replicationState.service = old;
    replicationState.lastAckedLsn = '0/AB';
    replicationState.service = createReplicationService();
    acknowledge.mockClear();

    await vi.advanceTimersByTimeAsync(10_000);

    // One update, from the service that holds the subscription now.
    expect(acknowledge).toHaveBeenCalledTimes(1);
  });
});
