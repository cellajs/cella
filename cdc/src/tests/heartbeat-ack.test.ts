import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { acknowledge, api } = vi.hoisted(() => ({
  acknowledge: vi.fn(async (_lsn: string) => true),
  api: { awaySince: null as Date | null },
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
  wsClient: {
    isConnected: () => api.awaySince === null,
    get apiAwaySince() {
      return api.awaySince;
    },
  },
}));

const { createReplicationService } = await import('../pipeline/replication');
const { replicationState } = await import('../services/replication-state');

const { handleDataMessage, resetBuffers } = await import('../pipeline/handle-message');
const { dmlMessage } = await import('./factories');

// Two ticks: the idle check runs once the turn of the keepalive is over.
const settle = async () => {
  await new Promise((resolve) => setImmediate(resolve));
  await new Promise((resolve) => setImmediate(resolve));
};

/** A service that holds the subscription, as the loop sets it. */
const subscribe = () => {
  const service = createReplicationService();
  replicationState.service = service;
  return service;
};

describe('a keepalive from Postgres', () => {
  beforeEach(async () => {
    replicationState.reset();
    await resetBuffers();
    acknowledge.mockClear();
    api.awaySince = null;
  });

  it.each([
    { asked: true, case: 'when Postgres asks for a reply' },
    { asked: false, case: 'when it does not' },
  ])('acknowledges nothing while the worker is busy, $case: the status timer keeps the connection', async ({ asked }) => {
    const service = subscribe();
    replicationState.lastAckedLsn = '0/AB';
    // A source transaction is open: the keepalive position lies past what the worker has recorded.
    await handleDataMessage('0/100', { tag: 'begin', xid: 7 } as never);
    service.emit('heartbeat', '0/1F0', Date.now(), asked);
    await settle();

    expect(acknowledge).not.toHaveBeenCalled();
    expect(replicationState.lastKeepaliveLsn).toBe('0/1F0');
  });

  describe('to an idle worker', () => {
    it.each([
      { case: 'acknowledges the keepalive position, one byte back because the client adds one', acked: '0/AB', keepalive: '0/1F0', sent: '0/1EF' },
      { case: 'borrows from the high word at a segment boundary', acked: null, keepalive: '2/0', sent: '1/FFFFFFFF' },
    ])('$case', async ({ acked, keepalive, sent }) => {
      const service = subscribe();
      replicationState.lastAckedLsn = acked;
      service.emit('heartbeat', keepalive, Date.now(), true);
      await settle();

      expect(acknowledge).toHaveBeenCalledTimes(1);
      expect(acknowledge).toHaveBeenCalledWith(sent);
      expect(replicationState.lastAckedLsn).toBe(sent);
    });

    it('must not move the acknowledged position backwards for a keepalive behind it', async () => {
      const service = subscribe();
      replicationState.lastAckedLsn = '0/2F0';
      service.emit('heartbeat', '0/1F0', Date.now(), true);
      await settle();

      expect(acknowledge).not.toHaveBeenCalled();
      expect(replicationState.lastAckedLsn).toBe('0/2F0');
    });

    it('holds the position while a transaction is open, then acknowledges it at the commit', async () => {
      const service = subscribe();
      replicationState.lastAckedLsn = '0/AB';
      await handleDataMessage('0/100', { tag: 'begin', xid: 7 } as never);
      service.emit('heartbeat', '0/1F0', Date.now(), true);
      await settle();

      expect(acknowledge).not.toHaveBeenCalled();

      await handleDataMessage('0/1E0', { tag: 'commit' } as never);
      await settle();

      expect(acknowledge.mock.calls).toEqual([['0/1EF']]);
    });

    it('acknowledges past a source transaction whose rows the worker drops entirely, with one acknowledgement', async () => {
      const service = subscribe();
      replicationState.lastAckedLsn = '0/AB';
      // Two rows of a table outside the registry: the parser drops both, and nothing reaches a flush.
      await handleDataMessage('0/B0', { tag: 'begin', xid: 9 } as never);
      await handleDataMessage('0/C0', dmlMessage('update', 'not_tracked', { id: 'row-1' }));
      await handleDataMessage('0/D0', dmlMessage('update', 'not_tracked', { id: 'row-2' }));
      await handleDataMessage('0/E0', { tag: 'commit' } as never);
      await settle();
      expect(acknowledge).not.toHaveBeenCalled();

      // Postgres has sent everything: its keepalive lies past the commit.
      service.emit('heartbeat', '0/1F0', Date.now(), false);
      await settle();

      expect(acknowledge.mock.calls).toEqual([['0/1EF']]);
    });

    it('must not acknowledge a keepalive past messages of the same socket read that still wait for their handler', async () => {
      const service = subscribe();
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

      // The transaction waits for its flush: 0/1EF would acknowledge past it, and a crash now would lose it.
      expect(acknowledge).not.toHaveBeenCalledWith('0/1EF');
    });

    it('forgets the keepalive position of a stream that ended', async () => {
      subscribe();
      replicationState.lastAckedLsn = '0/AB';
      replicationState.lastKeepaliveLsn = '0/1F0';

      // A new subscription reads again from the acknowledged position: the first thing it delivers has nothing to record.
      await resetBuffers();
      await handleDataMessage('0/B0', { tag: 'commit' } as never);
      await settle();

      expect(acknowledge).not.toHaveBeenCalled();
    });

    it('acknowledges the keepalive position while the API is away: nothing was read, so nothing can be lost', async () => {
      const service = subscribe();
      api.awaySince = new Date();
      replicationState.lastAckedLsn = '0/AB';
      service.emit('heartbeat', '0/1F0', Date.now(), true);
      await settle();

      expect(acknowledge).toHaveBeenCalledWith('0/1EF');
    });

    it('keeps no position a stopped service did not send', async () => {
      const service = subscribe();
      replicationState.lastAckedLsn = '0/AB';
      acknowledge.mockResolvedValueOnce(false);
      service.emit('heartbeat', '0/1F0', Date.now(), false);
      await settle();

      expect(acknowledge).toHaveBeenCalledWith('0/1EF');
      expect(replicationState.lastAckedLsn).toBe('0/AB');
    });
  });
});

describe('replication status timer', () => {
  beforeEach(async () => {
    replicationState.reset();
    await resetBuffers();
    acknowledge.mockClear();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('repeats the last acknowledged position while a flush holds the stream, so Postgres keeps the connection', async () => {
    subscribe();
    replicationState.lastAckedLsn = '0/AB';
    // A transaction is open and nothing is read: without the timer Postgres would hear nothing for as long as that lasts.
    await handleDataMessage('0/100', { tag: 'begin', xid: 7 } as never);

    await vi.advanceTimersByTimeAsync(35_000);

    expect(acknowledge.mock.calls.map(([lsn]) => lsn)).toEqual(['0/AB', '0/AB', '0/AB']);
  });

  it('repeats 0/0 before anything was acknowledged, which leaves the slot where it is', async () => {
    subscribe();

    await vi.advanceTimersByTimeAsync(10_000);

    expect(acknowledge.mock.calls).toEqual([['0/00000000']]);
  });

  it('must not go on for a service that was replaced', async () => {
    subscribe();
    replicationState.lastAckedLsn = '0/AB';
    subscribe();
    acknowledge.mockClear();

    await vi.advanceTimersByTimeAsync(10_000);

    // One update, from the service that holds the subscription now.
    expect(acknowledge).toHaveBeenCalledTimes(1);
  });
});
