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

/** A service whose subscribe() rejects `failures` times with the stale-publication decode error, then blocks. */
function makeStaleService(failures: number): LogicalReplicationService {
  let calls = 0;
  return {
    subscribe: vi.fn(() => {
      calls += 1;
      if (calls <= failures) return Promise.reject(Object.assign(new Error('publication "cdc_pub" does not exist'), { code: '42704' }));
      return new Promise(() => {}); // never resolves: subscribed and streaming
    }),
  } as unknown as LogicalReplicationService;
}

describe('subscribeWithReconnect — stale-publication self-heal guards', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    execute.mockReset();
    // The self-heal latch is module-global; a fresh module instance per test arms it from clean.
    vi.resetModules();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('recreates the slot only after confirming the publication exists', async () => {
    const { subscribeWithReconnect } = await import('../pipeline/replication');
    // Slot exists and publication exists, so the self-heal proceeds to drop and recreate.
    execute.mockResolvedValue({ rows: [{ x: 1 }] });
    const service = makeStaleService(1);

    void subscribeWithReconnect(service, plugin);
    await vi.advanceTimersByTimeAsync(0);

    // ensure(slot) + publication check + terminate + drop + create = 5 statements.
    expect(execute).toHaveBeenCalledTimes(5);
  });

  it('does not touch the slot when the publication is missing', async () => {
    const { subscribeWithReconnect } = await import('../pipeline/replication');
    execute.mockResolvedValueOnce({ rows: [{ x: 1 }] }); // ensure: slot exists
    execute.mockResolvedValueOnce({ rows: [] }); // publication check: missing
    execute.mockResolvedValue({ rows: [{ x: 1 }] }); // any later attempt
    const service = makeStaleService(1);

    void subscribeWithReconnect(service, plugin);
    await vi.advanceTimersByTimeAsync(0);

    // ensure(slot) + publication check only; no terminate/drop/create against a slot we cannot heal.
    expect(execute).toHaveBeenCalledTimes(2);
  });

  it('recreates at most once per worker lifetime despite repeated stale errors', async () => {
    const { subscribeWithReconnect } = await import('../pipeline/replication');
    execute.mockResolvedValue({ rows: [{ x: 1 }] }); // slot + publication both present throughout
    const service = makeStaleService(3);

    void subscribeWithReconnect(service, plugin);
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(slotTakeover.retryDelayMs);
    await vi.advanceTimersByTimeAsync(slotTakeover.retryDelayMs);
    await vi.advanceTimersByTimeAsync(slotTakeover.retryDelayMs);

    // Attempt 1: ensure + (pub-check + terminate + drop + create) = 5.
    // Attempts 2 and 3: ensure only, recreation latched off = +1 each.
    // Attempt 4: ensure, then subscribe takes hold = +1. Total 8, with exactly one recreate sequence.
    expect(execute).toHaveBeenCalledTimes(8);
  });
});
