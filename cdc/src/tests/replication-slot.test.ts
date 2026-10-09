import type { SQL } from 'drizzle-orm';
import { PgDialect } from 'drizzle-orm/pg-core';
import type { LogicalReplicationService, PgoutputPlugin } from 'pg-logical-replication';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/** A stand-in for Postgres: whether it answers, whether the slot exists, and every statement it was sent. */
const postgres = vi.hoisted(() => ({ reachable: true, slot: true, heldByAnother: false, statements: [] as string[] }));
const books = vi.hoisted(() => ({ rebuildAllowed: true }));

vi.mock('../lib/db', () => {
  const dialect = new PgDialect();
  return {
    cdcDb: {
      execute: async (query: SQL) => {
        const text = dialect.sqlToQuery(query).sql;
        postgres.statements.push(text);
        if (!postgres.reachable) throw new Error('ECONNREFUSED');
        if (text.includes('pg_create_logical_replication_slot')) postgres.slot = true;
        if (text.includes('pg_drop_replication_slot')) postgres.slot = false;
        if (text.includes('FROM pg_replication_slots'))
          return { rows: postgres.slot ? [{ wal_status: 'reserved', active: postgres.heldByAnother }] : [] };
        return { rows: [] };
      },
    },
    buildVerifiedSsl: () => undefined,
    stripSslParams: (url: string) => url,
  };
});

vi.mock('../network/websocket-client', () => ({ wsClient: { isConnected: () => true, whenConnected: async () => {}, apiAwaySince: null } }));

// The lost cases have their own tests: here the loop gets a `settle` step, and only the rebuild limit is read.
vi.mock('../pipeline/verify', () => ({
  rebuildAllowed: () => books.rebuildAllowed,
  readLostCaseFacts: vi.fn(),
  rebuildBooks: vi.fn(),
  rebuildWasInterrupted: vi.fn(),
  ensureBooksStateRestored: vi.fn(),
}));

import { RESOURCE_LIMITS } from '../constants';
import { runBetweenFlushes } from '../pipeline/handle-message';
import { subscribeWithReconnect } from '../pipeline/replication';
import { replicationState } from '../services/replication-state';

const { slotTakeover } = RESOURCE_LIMITS;

const slotIsMissing = Object.assign(new Error('replication slot "cdc_slot" does not exist'), { code: '42704' });
const slotPredatesPublication = Object.assign(new Error('publication "cdc_pub" does not exist'), { code: '42704' });

/** A service whose subscribe() rejects `failures` times with `error`, then stays pending as a live subscription does. */
function makeService(failures: number, error: Error = slotIsMissing): LogicalReplicationService {
  let calls = 0;
  return {
    subscribe: vi.fn(() => {
      calls += 1;
      return calls <= failures ? Promise.reject(error) : new Promise(() => {});
    }),
    stop: vi.fn(async () => {}),
  } as unknown as LogicalReplicationService;
}

/** How many statements holding `fragment` the worker sent. */
const sent = (fragment: string) => postgres.statements.filter((statement) => statement.includes(fragment)).length;
const slotLookups = () => sent('FROM pg_replication_slots');
const slotsMade = () => sent('pg_create_logical_replication_slot');
const slotsDropped = () => sent('pg_drop_replication_slot');

const plugin = {} as PgoutputPlugin;
/** The setup check and the lost cases have their own tests; here every statement is the slot's. */
const noOtherSteps = { checkSetup: async () => [], settle: async () => {} };

beforeEach(() => {
  vi.useFakeTimers();
  replicationState.reset();
  Object.assign(postgres, { reachable: true, slot: true, heldByAnother: false, statements: [] });
  books.rebuildAllowed = true;
});

afterEach(() => {
  // A loop left waiting on a timer ends there.
  replicationState.stopping = true;
  vi.useRealTimers();
});

describe('subscribeWithReconnect: replication slot lifecycle', () => {
  it('stops the service of an attempt that failed before the next one starts', async () => {
    const service = makeService(1);
    void subscribeWithReconnect(plugin, { createService: () => service, ...noOtherSteps });
    await vi.advanceTimersByTimeAsync(slotTakeover.retryDelayMs + 10);

    expect(service.stop).toHaveBeenCalledTimes(1);
    expect(service.subscribe).toHaveBeenCalledTimes(2);
  });

  it('is subscribed from the moment it subscribes until that subscription ends', async () => {
    let endSubscription: (error: Error) => void = () => {};
    const service = {
      subscribe: vi.fn(
        () =>
          new Promise((_resolve, reject) => {
            endSubscription = reject;
          }),
      ),
      stop: vi.fn(async () => {}),
    } as unknown as LogicalReplicationService;

    expect(replicationState.subscribed).toBe(false);
    void subscribeWithReconnect(plugin, { createService: () => service, ...noOtherSteps });
    await vi.advanceTimersByTimeAsync(0);
    expect(replicationState.subscribed).toBe(true);

    endSubscription(new Error('Connection terminated unexpectedly'));
    await vi.advanceTimersByTimeAsync(0);
    // Between two subscriptions: health reports the worker as not reading.
    expect(replicationState.subscribed).toBe(false);
  });

  it('must not read from a setup that does not match the worker: it reports the problem and tries again', async () => {
    const service = makeService(0);
    let checks = 0;
    const checkSetup = async () => (++checks < 3 ? ["publication 'cdc_pub' lacks tracked tables: attachments"] : []);

    void subscribeWithReconnect(plugin, { createService: () => service, checkSetup, settle: async () => {} });
    await vi.advanceTimersByTimeAsync(0);

    expect(service.subscribe).not.toHaveBeenCalled();
    expect(replicationState.setupProblems).toEqual(["publication 'cdc_pub' lacks tracked tables: attachments"]);

    // Once the setup holds, the worker reads.
    await vi.advanceTimersByTimeAsync(slotTakeover.retryDelayMs * 2 + 10);
    expect(service.subscribe).toHaveBeenCalledTimes(1);
    expect(replicationState.setupProblems).toEqual([]);
  });

  it('must not make a slot ahead of a publication that is missing: such a slot can never be read', async () => {
    postgres.slot = false;
    const service = makeService(0);
    const checkSetup = async () => ["publication 'cdc_pub' lacks tracked tables: attachments, tenants"];

    void subscribeWithReconnect(plugin, { createService: () => service, checkSetup, settle: async () => {} });
    await vi.advanceTimersByTimeAsync(slotTakeover.retryDelayMs * 3);

    expect(slotsMade()).toBe(0);
    expect(service.subscribe).not.toHaveBeenCalled();
  });

  it('looks for the slot again before every subscribe attempt', async () => {
    const service = makeService(3);

    void subscribeWithReconnect(plugin, { createService: () => service, ...noOtherSteps });
    await vi.advanceTimersByTimeAsync(0);
    expect(slotLookups()).toBe(1);

    // Each attempt looks again: a database that was dropped took its slots with it.
    await vi.advanceTimersByTimeAsync(slotTakeover.retryDelayMs);
    expect(slotLookups()).toBe(2);

    await vi.advanceTimersByTimeAsync(slotTakeover.retryDelayMs);
    expect(slotLookups()).toBe(3);
  });

  it('makes the slot once the database becomes reachable (worker started while it was down)', async () => {
    // The incident: the worker starts against an unreachable database, so the slot cannot be made. Looking for it
    // at startup only would leave replication dead for good.
    postgres.reachable = false;
    postgres.slot = false;
    const service = makeService(1);

    void subscribeWithReconnect(plugin, { createService: () => service, ...noOtherSteps });
    await vi.advanceTimersByTimeAsync(0);
    expect(slotLookups()).toBe(1);
    expect(slotsMade()).toBe(0);

    postgres.reachable = true;
    await vi.advanceTimersByTimeAsync(slotTakeover.retryDelayMs);

    expect(slotsMade()).toBe(1);
    expect(service.subscribe).toHaveBeenCalledTimes(2);
  });

  it('must not fight the outgoing worker for a slot that already exists', async () => {
    // A rolling deploy keeps the slot in the outgoing worker until handoff: subscribe() rejects with 55006 meanwhile.
    const held = Object.assign(new Error('replication slot "cdc_slot" is active for PID 4242'), { code: '55006' });
    const service = makeService(2, held);

    void subscribeWithReconnect(plugin, { createService: () => service, ...noOtherSteps });
    await vi.advanceTimersByTimeAsync(slotTakeover.retryDelayMs * 2);

    expect(service.subscribe).toHaveBeenCalledTimes(3);
    expect(slotsMade()).toBe(0);
    expect(slotsDropped()).toBe(0);
    expect(sent('pg_terminate_backend')).toBe(0);
  });
});

describe('subscribeWithReconnect: between two subscriptions', () => {
  it('must not settle the lost cases while another worker still reads the slot: its flushes go on beside a rebuild', async () => {
    // A deploy: the outgoing worker holds the slot, so the subscribe is refused until it lets go.
    const held = Object.assign(new Error('replication slot "cdc_slot" is active for PID 4242'), { code: '55006' });
    const service = makeService(2, held);
    const settle = vi.fn(async () => {});
    postgres.heldByAnother = true;

    void subscribeWithReconnect(plugin, { createService: () => service, checkSetup: async () => [], settle });
    await vi.advanceTimersByTimeAsync(slotTakeover.retryDelayMs + 10);
    expect(service.subscribe).toHaveBeenCalledTimes(2);
    expect(settle).not.toHaveBeenCalled();

    // The outgoing worker is gone: this attempt settles, then subscribes.
    postgres.heldByAnother = false;
    await vi.advanceTimersByTimeAsync(slotTakeover.retryDelayMs);
    expect(settle).toHaveBeenCalledTimes(1);
    expect(service.subscribe).toHaveBeenCalledTimes(3);
  });

  it('must not settle the lost cases while a flush of the subscription that ended is in flight', async () => {
    // What holds the buffer: a flush that is still recording, or a verify taking its snapshot.
    let finish: () => void = () => {};
    void runBetweenFlushes(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        }),
    );
    const settle = vi.fn(async () => {});
    const service = makeService(0);

    void subscribeWithReconnect(plugin, { createService: () => service, checkSetup: async () => [], settle });
    await vi.advanceTimersByTimeAsync(5000);
    const settledMeanwhile = settle.mock.calls.length;
    finish();
    await vi.advanceTimersByTimeAsync(0);

    // A rebuild beside that flush would count its changes a second time.
    expect(settledMeanwhile).toBe(0);
    expect(settle).toHaveBeenCalledOnce();
    expect(service.subscribe).toHaveBeenCalledOnce();
  });
});

describe('subscribeWithReconnect: a slot that predates its publication', () => {
  it('drops the slot, and treats the new one as a lost case', async () => {
    const service = makeService(1, slotPredatesPublication);
    const settle = vi.fn(async () => {});

    void subscribeWithReconnect(plugin, { createService: () => service, checkSetup: async () => [], settle });
    await vi.advanceTimersByTimeAsync(0);

    // The sender is ended first, then the slot goes. Nothing is made here.
    expect(sent('pg_terminate_backend')).toBe(1);
    expect(slotsDropped()).toBe(1);
    expect(slotsMade()).toBe(0);
    expect(settle).toHaveBeenCalledExactlyOnceWith(false);

    await vi.advanceTimersByTimeAsync(slotTakeover.retryDelayMs);

    // The next attempt finds no slot and makes one, and the loss is handled before the stream is read.
    expect(slotsMade()).toBe(1);
    expect(settle).toHaveBeenLastCalledWith(true);
    expect(service.subscribe).toHaveBeenCalledTimes(2);
  });

  it('must not drop a slot again while a rebuild is not allowed: every given-up position shares one limit', async () => {
    books.rebuildAllowed = false;
    const service = makeService(4, slotPredatesPublication);

    void subscribeWithReconnect(plugin, { createService: () => service, ...noOtherSteps });
    await vi.advanceTimersByTimeAsync(slotTakeover.retryDelayMs * 2);

    expect(service.subscribe).toHaveBeenCalledTimes(3);
    expect(slotsDropped()).toBe(0);

    // The interval has passed: the slot goes now.
    books.rebuildAllowed = true;
    await vi.advanceTimersByTimeAsync(slotTakeover.retryDelayMs);
    expect(slotsDropped()).toBe(1);
  });
});
