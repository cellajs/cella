import { MutationObserver, onlineManager, QueryClient } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { squashIntoPendingCreate, squashPendingMutation } from '../squash-utils';

/**
 * Helper: create a PAUSED mutation (offline at mutate time, so it pauses before the first
 * attempt) — the only state squash/coalesce may touch.
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

/** Helper: create an IN-FLIGHT mutation (pending, not paused) that never resolves. */
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
    const result = squashPendingMutation(queryClient, mutationKey, 'entity-1', { name: 'New' });
    expect(result).toEqual({ name: 'New' });
  });

  it('merges ops from a paused mutation into the new one and removes it from the cache', () => {
    queuePausedMutation(queryClient, mutationKey, {
      id: 'entity-1',
      ops: { name: 'Old', description: 'Desc' },
    });
    const cache = queryClient.getMutationCache();
    expect(cache.findAll({ mutationKey }).filter((m) => m.state.isPaused)).toHaveLength(1);

    const result = squashPendingMutation(queryClient, mutationKey, 'entity-1', { status: 'done' });

    expect(result).toEqual({ name: 'Old', description: 'Desc', status: 'done' });
    expect(cache.findAll({ mutationKey })).toHaveLength(0);
  });

  it('new ops override old ops for same key', () => {
    queuePausedMutation(queryClient, mutationKey, { id: 'entity-1', ops: { name: 'First' } });

    const result = squashPendingMutation(queryClient, mutationKey, 'entity-1', { name: 'Second' });

    expect(result).toEqual({ name: 'Second' });
  });

  it('leaves IN-FLIGHT mutations alone: their ops are already on the wire', () => {
    cleanups.push(queueInFlightMutation(queryClient, mutationKey, { id: 'entity-1', ops: { name: 'InFlight' } }));

    const result = squashPendingMutation(queryClient, mutationKey, 'entity-1', { status: 'done' });

    // Not merged, not removed: LWW/delta merge makes the overlap idempotent server-side.
    expect(result).toEqual({ status: 'done' });
    expect(
      queryClient
        .getMutationCache()
        .findAll({ mutationKey })
        .filter((m) => m.state.status === 'pending'),
    ).toHaveLength(1);
  });

  it('ignores mutations for different entities', () => {
    queuePausedMutation(queryClient, mutationKey, { id: 'entity-2', ops: { name: 'Other' } });

    const result = squashPendingMutation(queryClient, mutationKey, 'entity-1', { status: 'done' });

    expect(result).toEqual({ status: 'done' });
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

    const result = squashPendingMutation(queryClient, mutationKey, 'entity-1', { status: 'C' });

    expect(result).toEqual({ name: 'A', description: 'B', status: 'C' });
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
    cleanups.push(queueInFlightMutation(queryClient, createKey, { id: 'entity-1', name: 'Original' }));

    const result = squashIntoPendingCreate(queryClient, createKey, 'entity-1', { name: 'X' });
    expect(result).toBe(false);
  });

  it('ignores creates for different entities', () => {
    queuePausedMutation(queryClient, createKey, { id: 'entity-2', name: 'Other' });

    const result = squashIntoPendingCreate(queryClient, createKey, 'entity-1', { name: 'X' });
    expect(result).toBe(false);
  });
});
