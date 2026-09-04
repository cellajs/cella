import { beforeEach, describe, expect, it, vi } from 'vitest';

const { acknowledge } = vi.hoisted(() => ({ acknowledge: vi.fn(async (_lsn: string) => {}) }));

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
    isConnected: () => false,
    inGracePeriod: () => false,
    setCallbacks: vi.fn(),
    connect: vi.fn(),
    close: vi.fn(),
  },
}));

const { createReplicationService } = await import('../pipeline/replication');
const { replicationState } = await import('../services/replication-state');

const settle = () => new Promise((resolve) => setImmediate(resolve));

describe('replication heartbeat acknowledgement', () => {
  beforeEach(() => {
    replicationState.reset();
    acknowledge.mockClear();
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
});
