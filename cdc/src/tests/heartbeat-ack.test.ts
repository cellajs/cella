import { beforeEach, describe, expect, it, vi } from 'vitest';

const { acknowledge, ws } = vi.hoisted(() => ({
  acknowledge: vi.fn(async (_lsn: string) => {}),
  ws: { connected: false },
}));

vi.mock('pg-logical-replication', async () => {
  const { EventEmitter } = await import('node:events');
  class LogicalReplicationService extends EventEmitter {
    acknowledge = acknowledge;
  }
  return { LogicalReplicationService, PgoutputPlugin: class {} };
});

vi.mock('../lib/db', () => ({
  cdcDb: { execute: vi.fn() },
  buildVerifiedSsl: () => undefined,
  stripSslParams: (url: string) => url,
}));

vi.mock('../network/websocket-client', () => ({
  wsClient: {
    isConnected: () => ws.connected,
    inGracePeriod: () => false,
    setCallbacks: vi.fn(),
    connect: vi.fn(),
    close: vi.fn(),
  },
}));

const { createReplicationService } = await import('../pipeline/replication');
const { replicationState } = await import('../services/replication-state');

const { handleDataMessage, releaseHeldAck } = await import('../pipeline/handle-message');

// Two ticks: the heartbeat handler defers its reply by one.
const settle = async () => {
  await new Promise((resolve) => setImmediate(resolve));
  await new Promise((resolve) => setImmediate(resolve));
};

describe('replication heartbeat acknowledgement', () => {
  beforeEach(() => {
    replicationState.reset();
    acknowledge.mockClear();
    ws.connected = false;
  });

  it('replies with 0/0 before anything was acknowledged, leaving the slot untouched', async () => {
    const service = createReplicationService();
    service.emit('heartbeat', '0/1F0', Date.now(), true);
    await settle();

    expect(acknowledge).toHaveBeenCalledTimes(1);
    expect(acknowledge).toHaveBeenCalledWith('0/00000000');
  });

  it('repeats the last acknowledged LSN instead of the keepalive position', async () => {
    const service = createReplicationService();
    replicationState.lastAckedLsn = '0/AB';
    service.emit('heartbeat', '0/1F0', Date.now(), true);
    await settle();

    expect(acknowledge).toHaveBeenCalledWith('0/AB');
    expect(acknowledge).not.toHaveBeenCalledWith('0/1F0');
  });

  it('stays silent when the server does not ask for a reply', async () => {
    const service = createReplicationService();
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
      {
        case: 'confirms the keepalive position, one byte back because the client adds one',
        acked: '0/AB',
        keepalive: '0/1F0',
        reply: '0/1EF',
      },
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

    it('stays put after a withheld acknowledgment', async () => {
      const service = connect();
      replicationState.lastAckedLsn = '0/AB';
      replicationState.heldAckLsn = '0/C0';
      service.emit('heartbeat', '0/1F0', Date.now(), true);
      await settle();

      expect(acknowledge).toHaveBeenCalledTimes(1);
      expect(acknowledge).toHaveBeenCalledWith('0/AB');
    });

    it('sends the withheld acknowledgment once the WebSocket returns, then confirms the keepalive', async () => {
      connect();
      replicationState.lastAckedLsn = '0/AB';
      replicationState.heldAckLsn = '0/C0';
      replicationState.lastKeepaliveLsn = '0/1F0';
      await releaseHeldAck();

      expect(acknowledge.mock.calls.map(([lsn]) => lsn)).toEqual(['0/C0', '0/1EF']);
      expect(replicationState.heldAckLsn).toBeNull();
    });

    it('keeps the acknowledgment withheld while the WebSocket is still down', async () => {
      connect();
      ws.connected = false;
      replicationState.heldAckLsn = '0/C0';
      await releaseHeldAck();

      expect(acknowledge).not.toHaveBeenCalled();
      expect(replicationState.heldAckLsn).toBe('0/C0');
    });
  });
});
