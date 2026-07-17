import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { LogicalReplicationService, PgoutputPlugin } from 'pg-logical-replication';

const execute = vi.fn();

vi.mock('../lib/db', () => ({
  cdcDb: { execute: (...args: unknown[]) => execute(...args) },
  buildVerifiedSsl: () => undefined,
  stripSslParams: (url: string) => url,
}));

vi.mock('../lib/pino', () => ({
  log: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), trace: vi.fn(), debug: vi.fn() },
}));

vi.mock('../network/websocket-client', () => ({
  wsClient: {
    isConnected: () => true,
    inGracePeriod: () => false,
    setCallbacks: vi.fn(),
    connect: vi.fn(),
    close: vi.fn(),
  },
}));

import { RESOURCE_LIMITS } from '../constants';
import { subscribeWithReconnect } from '../pipeline/replication';

const { slotTakeover } = RESOURCE_LIMITS;

/** A service whose subscribe() fails `failures` times, then blocks as a live subscription would. */
function makeService(failures: number): LogicalReplicationService {
  let calls = 0;
  return {
    subscribe: vi.fn(() => {
      calls += 1;
      if (calls <= failures) return Promise.reject(Object.assign(new Error('replication slot "cdc_slot" does not exist'), { code: '42704' }));
      return new Promise(() => {}); // never resolves: subscribed and streaming
    }),
  } as unknown as LogicalReplicationService;
}

const plugin = {} as PgoutputPlugin;

describe('subscribeWithReconnect — replication slot lifecycle', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    execute.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('re-ensures the slot before every subscribe attempt', async () => {
    // Slot already exists → ensureReplicationSlot() issues exactly one catalog SELECT per call,
    // so the execute count is the number of times the slot was ensured.
    execute.mockResolvedValue({ rows: [{ exists: 1 }] });
    const service = makeService(3);

    void subscribeWithReconnect(service, plugin);
    await vi.advanceTimersByTimeAsync(0);
    expect(execute).toHaveBeenCalledTimes(1);

    // Each retry must ensure again, not just re-subscribe.
    await vi.advanceTimersByTimeAsync(slotTakeover.retryDelayMs);
    expect(execute).toHaveBeenCalledTimes(2);

    await vi.advanceTimersByTimeAsync(slotTakeover.retryDelayMs);
    expect(execute).toHaveBeenCalledTimes(3);
  });

  it('creates the slot once the database becomes reachable (worker booted while it was down)', async () => {
    // The incident: the worker starts against an unreachable database, so the slot cannot be
    // created. A startup-only ensure would never retry and replication would stay dead forever.
    execute.mockRejectedValueOnce(new Error('ECONNREFUSED')); // attempt 1: database unreachable
    execute.mockResolvedValueOnce({ rows: [] }); // attempt 2: reachable, slot missing
    execute.mockResolvedValueOnce({ rows: [] }); // attempt 2: pg_create_logical_replication_slot

    const service = makeService(1);

    void subscribeWithReconnect(service, plugin);
    await vi.advanceTimersByTimeAsync(0);
    expect(execute).toHaveBeenCalledTimes(1); // ensure attempted, swallowed the connection error

    await vi.advanceTimersByTimeAsync(slotTakeover.retryDelayMs);

    // Slot check + creation both issued on the retry, and the subscription then took hold.
    expect(execute).toHaveBeenCalledTimes(3);
    expect(service.subscribe).toHaveBeenCalledTimes(2);
  });

  it('does not fight the outgoing worker for a slot that already exists', async () => {
    // A rolling deploy keeps the slot in the outgoing worker until handoff. Ensuring an existing
    // slot must remain a no-op read while subscribe() rejects with 55006.
    execute.mockResolvedValue({ rows: [{ exists: 1 }] });
    const service = makeService(2);

    void subscribeWithReconnect(service, plugin);
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(slotTakeover.retryDelayMs);
    await vi.advanceTimersByTimeAsync(slotTakeover.retryDelayMs);

    // Three ensures, three reads, zero creates.
    expect(execute).toHaveBeenCalledTimes(3);
  });
});
