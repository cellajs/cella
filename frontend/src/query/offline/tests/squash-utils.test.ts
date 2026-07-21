import { MutationObserver, onlineManager, QueryClient } from '@tanstack/react-query';
import type { StxBase } from 'sdk';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { removePausedCreates, squashIntoPendingCreate, squashPendingMutation } from '../squash-utils';

/** Build a minimal stx carrying the given field timestamps. */
function stxWith(fieldTimestamps: Record<string, string> = {}): StxBase {
  return { mutationId: `mut-${Object.keys(fieldTimestamps).join('-') || 'x'}`, sourceId: 'test', fieldTimestamps };
}

/**
 * Helper: create a QUEUED (offline-parked) mutation. Coalescing only runs while offline, so these
 * helpers keep the client offline for the duration of the test (afterEach restores online).
 */
function queuePausedMutation(
  queryClient: QueryClient,
  mutationKey: readonly unknown[],
  variables: Record<string, unknown> | unknown[],
): void {
  onlineManager.setOnline(false);
  const observer = new MutationObserver(queryClient, {
    mutationKey,
    mutationFn: async (_vars: Record<string, unknown>) => ({}),
  });
  observer.mutate(variables as Record<string, unknown>).catch(() => {});
}

/**
 * Helper: create an IN-FLIGHT (active: pending, not paused) mutation that never resolves.
 * networkMode 'always' keeps it running regardless of connectivity, so it stays active even while
 * the client is offline (the state coalescing runs in), modelling a request truly on the wire.
 */
function queueInFlightMutation(
  queryClient: QueryClient,
  mutationKey: readonly unknown[],
  variables: Record<string, unknown>,
): () => void {
  let resolve: () => void;
  const neverResolve = new Promise<Record<string, unknown>>((r) => {
    resolve = () => r({});
  });
  const observer = new MutationObserver(queryClient, {
    mutationKey,
    networkMode: 'always',
    mutationFn: (_vars: Record<string, unknown>) => neverResolve,
  });
  observer.mutate(variables).catch(() => {});
  return () => resolve();
}

// Covers same-entity mutation squashing and pending-create coalescing. Only PAUSED mutations
// participate: in-flight requests are on the wire and must be left alone.
describe('squashPendingMutation', () => {
  let queryClient: QueryClient;
  const mutationKey = ['task', 'update'] as const;
  const cleanups: (() => void)[] = [];

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: { mutations: { retry: false } },
    });
  });

  afterEach(() => {
    for (const fn of cleanups) fn();
    cleanups.length = 0;
    onlineManager.setOnline(true);
    queryClient.clear();
  });

  it('returns new fields when no paused mutation exists', () => {
    onlineManager.setOnline(false);
    const result = squashPendingMutation(
      queryClient,
      mutationKey,
      'entity-1',
      { name: 'New' },
      stxWith({ name: 't1' }),
    );
    expect(result.ops).toEqual({ name: 'New' });
    expect(result.stx.fieldTimestamps).toEqual({ name: 't1' });
  });

  it('is a no-op while online: returns the new ops and stx untouched, keeps the queued mutation', () => {
    queuePausedMutation(queryClient, mutationKey, { id: 'entity-1', ops: { name: 'Old' } });
    onlineManager.setOnline(true); // back online before coalescing

    const result = squashPendingMutation(queryClient, mutationKey, 'entity-1', { status: 'done' }, stxWith());

    expect(result.ops).toEqual({ status: 'done' });
    // The queued mutation is untouched: it will replay as its own scope-serialized request.
    expect(queryClient.getMutationCache().findAll({ mutationKey })).toHaveLength(1);
  });

  it('merges ops from a paused mutation into the new one and removes it from the cache', () => {
    queuePausedMutation(queryClient, mutationKey, {
      id: 'entity-1',
      ops: { name: 'Old', description: 'Desc' },
    });
    const cache = queryClient.getMutationCache();
    expect(cache.findAll({ mutationKey }).filter((m) => m.state.isPaused)).toHaveLength(1);

    const result = squashPendingMutation(queryClient, mutationKey, 'entity-1', { status: 'done' }, stxWith());

    expect(result.ops).toEqual({ name: 'Old', description: 'Desc', status: 'done' });
    expect(cache.findAll({ mutationKey })).toHaveLength(0);
  });

  it('new ops override old ops for same key', () => {
    queuePausedMutation(queryClient, mutationKey, { id: 'entity-1', ops: { name: 'First' } });

    const result = squashPendingMutation(queryClient, mutationKey, 'entity-1', { name: 'Second' }, stxWith());

    expect(result.ops).toEqual({ name: 'Second' });
  });

  it('preserves the inherited field timestamp for a field this edit does not touch (LWW by intent time)', () => {
    // A queued edit set `name` at t1; the new edit changes only `description` at t2. The merged
    // request must carry name@t1 (not restamped to t2), or an older name edit could beat a newer one.
    queuePausedMutation(queryClient, mutationKey, {
      id: 'entity-1',
      ops: { name: 'Old name' },
      stx: stxWith({ name: 't1' }),
    });

    const result = squashPendingMutation(
      queryClient,
      mutationKey,
      'entity-1',
      { description: 'New desc' },
      stxWith({ description: 't2' }),
    );

    expect(result.ops).toEqual({ name: 'Old name', description: 'New desc' });
    expect(result.stx.fieldTimestamps).toEqual({ name: 't1', description: 't2' });
  });

  it('the incoming edit wins the timestamp for an overwritten field', () => {
    queuePausedMutation(queryClient, mutationKey, {
      id: 'entity-1',
      ops: { name: 'Old name' },
      stx: stxWith({ name: 't1' }),
    });

    const result = squashPendingMutation(
      queryClient,
      mutationKey,
      'entity-1',
      { name: 'New name' },
      stxWith({ name: 't2' }),
    );

    expect(result.ops).toEqual({ name: 'New name' });
    expect(result.stx.fieldTimestamps).toEqual({ name: 't2' });
  });

  it('leaves IN-FLIGHT mutations alone: their ops are already on the wire', () => {
    onlineManager.setOnline(false); // offline so the online gate does not mask the in-flight guard
    cleanups.push(queueInFlightMutation(queryClient, mutationKey, { id: 'entity-1', ops: { name: 'InFlight' } }));

    const result = squashPendingMutation(queryClient, mutationKey, 'entity-1', { status: 'done' }, stxWith());

    // Not merged, not removed: LWW/delta merge makes the overlap idempotent server-side.
    expect(result.ops).toEqual({ status: 'done' });
    expect(
      queryClient
        .getMutationCache()
        .findAll({ mutationKey })
        .filter((m) => m.state.status === 'pending'),
    ).toHaveLength(1);
  });

  it('ignores mutations for different entities', () => {
    queuePausedMutation(queryClient, mutationKey, { id: 'entity-2', ops: { name: 'Other' } });

    const result = squashPendingMutation(queryClient, mutationKey, 'entity-1', { status: 'done' }, stxWith());

    expect(result.ops).toEqual({ status: 'done' });
    expect(
      queryClient
        .getMutationCache()
        .findAll({ mutationKey })
        .filter((m) => m.state.isPaused),
    ).toHaveLength(1);
  });

  it('accumulates fields from multiple paused mutations', () => {
    queuePausedMutation(queryClient, mutationKey, { id: 'entity-1', ops: { name: 'A' } });
    queuePausedMutation(queryClient, mutationKey, { id: 'entity-1', ops: { description: 'B' } });

    const result = squashPendingMutation(queryClient, mutationKey, 'entity-1', { status: 'C' }, stxWith());

    expect(result.ops).toEqual({ name: 'A', description: 'B', status: 'C' });
    expect(queryClient.getMutationCache().findAll({ mutationKey })).toHaveLength(0);
  });
});

describe('squashIntoPendingCreate', () => {
  let queryClient: QueryClient;
  const createKey = ['task', 'create'] as const;
  const cleanups: (() => void)[] = [];

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: { mutations: { retry: false } },
    });
  });

  afterEach(() => {
    for (const fn of cleanups) fn();
    cleanups.length = 0;
    onlineManager.setOnline(true);
    queryClient.clear();
  });

  it('returns false when no paused create exists', () => {
    const result = squashIntoPendingCreate(queryClient, createKey, 'entity-1', { name: 'Updated' });
    expect(result).toBe(false);
  });

  it('coalesces fields into a paused top-level-id create and returns true', () => {
    const variables = { id: 'entity-1', name: 'Original' };
    queuePausedMutation(queryClient, createKey, variables);

    const result = squashIntoPendingCreate(queryClient, createKey, 'entity-1', { description: 'Added' });

    expect(result).toBe(true);
    expect(variables).toEqual({ id: 'entity-1', name: 'Original', description: 'Added' });
  });

  it('coalesces fields into the matching ROW of a paused batch create (data[] shape)', () => {
    // Attachment-style variables: routing context + data rows, no top-level id.
    const variables = {
      tenantId: 't1',
      organizationId: 'o1',
      data: [
        { id: 'entity-1', name: 'One' },
        { id: 'entity-2', name: 'Two' },
      ],
    };
    queuePausedMutation(queryClient, createKey, variables);

    const result = squashIntoPendingCreate(queryClient, createKey, 'entity-2', { name: 'Renamed' });

    expect(result).toBe(true);
    // Merged into the row, not the variables root.
    expect(variables.data[1]).toEqual({ id: 'entity-2', name: 'Renamed' });
    expect(variables.data[0]).toEqual({ id: 'entity-1', name: 'One' });
    expect('name' in variables).toBe(false);
  });

  it('falls through (false) for array-delta ops: creates carry full arrays, deltas are relative', () => {
    const variables = { id: 'entity-1', labels: ['a'] };
    queuePausedMutation(queryClient, createKey, variables);

    const result = squashIntoPendingCreate(queryClient, createKey, 'entity-1', {
      labels: { add: ['b'], remove: [] },
    });

    expect(result).toBe(false);
    expect(variables).toEqual({ id: 'entity-1', labels: ['a'] });
  });

  it('never touches an IN-FLIGHT create', () => {
    onlineManager.setOnline(false); // offline so the online gate does not mask the in-flight guard
    cleanups.push(queueInFlightMutation(queryClient, createKey, { id: 'entity-1', name: 'Original' }));

    const result = squashIntoPendingCreate(queryClient, createKey, 'entity-1', { name: 'X' });
    expect(result).toBe(false);
  });

  it('is a no-op while online: returns false and leaves the queued create for a separate update', () => {
    const variables = { id: 'entity-1', name: 'Original' };
    queuePausedMutation(queryClient, createKey, variables);
    onlineManager.setOnline(true);

    const result = squashIntoPendingCreate(queryClient, createKey, 'entity-1', { description: 'Added' });

    expect(result).toBe(false);
    expect(variables).toEqual({ id: 'entity-1', name: 'Original' });
  });

  it('ignores creates for different entities', () => {
    queuePausedMutation(queryClient, createKey, { id: 'entity-2', name: 'Other' });

    const result = squashIntoPendingCreate(queryClient, createKey, 'entity-1', { name: 'X' });
    expect(result).toBe(false);
  });
});

describe('removePausedCreates', () => {
  let queryClient: QueryClient;
  const createKey = ['task', 'create'] as const;
  const cleanups: (() => void)[] = [];

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: { mutations: { retry: false } },
    });
  });

  afterEach(() => {
    for (const fn of cleanups) fn();
    cleanups.length = 0;
    onlineManager.setOnline(true);
    queryClient.clear();
  });

  it('cancels a whole paused top-level-id create', () => {
    queuePausedMutation(queryClient, createKey, { id: 'entity-1', name: 'Never sent' });

    const cancelled = removePausedCreates(queryClient, createKey, ['entity-1']);

    expect(cancelled).toEqual(['entity-1']);
    expect(queryClient.getMutationCache().findAll({ mutationKey: createKey })).toHaveLength(0);
  });

  it('removes only the matching row from a paused batch create', () => {
    const variables = {
      tenantId: 't1',
      organizationId: 'o1',
      data: [
        { id: 'entity-1', name: 'Keep' },
        { id: 'entity-2', name: 'Delete' },
      ],
    };
    queuePausedMutation(queryClient, createKey, variables);

    const cancelled = removePausedCreates(queryClient, createKey, ['entity-2']);

    expect(cancelled).toEqual(['entity-2']);
    expect(variables.data).toEqual([{ id: 'entity-1', name: 'Keep' }]);
    expect(queryClient.getMutationCache().findAll({ mutationKey: createKey })).toHaveLength(1);
  });

  it('drops the whole batch create when every row is cancelled', () => {
    queuePausedMutation(queryClient, createKey, {
      data: [{ id: 'entity-1' }, { id: 'entity-2' }],
    });

    const cancelled = removePausedCreates(queryClient, createKey, ['entity-1', 'entity-2']);

    expect(cancelled).toEqual(['entity-1', 'entity-2']);
    expect(queryClient.getMutationCache().findAll({ mutationKey: createKey })).toHaveLength(0);
  });

  it('leaves IN-FLIGHT creates alone: the row may reach the server, the delete must be sent', () => {
    onlineManager.setOnline(false); // offline so the online gate does not mask the in-flight guard
    cleanups.push(queueInFlightMutation(queryClient, createKey, { id: 'entity-1', name: 'Sending' }));

    const cancelled = removePausedCreates(queryClient, createKey, ['entity-1']);

    expect(cancelled).toEqual([]);
    expect(
      queryClient
        .getMutationCache()
        .findAll({ mutationKey: createKey })
        .filter((m) => m.state.status === 'pending'),
    ).toHaveLength(1);
  });

  it('is a no-op while online: returns no cancellations and keeps the queued create', () => {
    queuePausedMutation(queryClient, createKey, { id: 'entity-1', name: 'Maybe sent' });
    onlineManager.setOnline(true);

    const cancelled = removePausedCreates(queryClient, createKey, ['entity-1']);

    expect(cancelled).toEqual([]);
    expect(queryClient.getMutationCache().findAll({ mutationKey: createKey })).toHaveLength(1);
  });
});
