import { MutationObserver, QueryClient } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { coalescePendingCreate, squashPendingMutation } from '../squash-utils';

/**
 * Helper: create a mutation that stays "pending" by never resolving its mutationFn.
 * Returns a cleanup function to resolve the pending promise (avoids dangling timers).
 */
function queuePendingMutation(
  queryClient: QueryClient,
  mutationKey: readonly unknown[],
  variables: Record<string, unknown> | unknown[],
): () => void {
  let resolve: () => void;
  const neverResolve = new Promise<Record<string, unknown>>((r) => {
    resolve = () => r({});
  });

  const observer = new MutationObserver(queryClient, {
    mutationKey,
    mutationFn: (_vars: Record<string, unknown>) => neverResolve,
  });
  observer.mutate(variables as Record<string, unknown>);

  return () => resolve();
}

// Covers same-entity mutation squashing and pending-create coalescing.
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
    queryClient.clear();
  });

  it('returns new fields when no pending mutation exists', () => {
    const result = squashPendingMutation(queryClient, mutationKey, 'entity-1', { name: 'New' });
    expect(result).toEqual({ name: 'New' });
  });

  it('merges ops from pending mutation into new mutation', () => {
    cleanups.push(
      queuePendingMutation(queryClient, mutationKey, {
        id: 'entity-1',
        ops: { name: 'Old', description: 'Desc' },
      }),
    );

    const result = squashPendingMutation(queryClient, mutationKey, 'entity-1', { status: 'done' });

    // Should merge: old ops + new ops, new wins
    expect(result).toEqual({ name: 'Old', description: 'Desc', status: 'done' });
  });

  it('new ops override old ops for same key', () => {
    cleanups.push(
      queuePendingMutation(queryClient, mutationKey, {
        id: 'entity-1',
        ops: { name: 'First' },
      }),
    );

    const result = squashPendingMutation(queryClient, mutationKey, 'entity-1', { name: 'Second' });

    expect(result).toEqual({ name: 'Second' });
  });

  it('removes old pending mutation from cache after squash', () => {
    cleanups.push(
      queuePendingMutation(queryClient, mutationKey, {
        id: 'entity-1',
        ops: { name: 'Old' },
      }),
    );

    const cache = queryClient.getMutationCache();
    expect(cache.findAll({ mutationKey }).filter((m) => m.state.status === 'pending')).toHaveLength(1);

    squashPendingMutation(queryClient, mutationKey, 'entity-1', { status: 'done' });

    // Old mutation should be removed
    expect(cache.findAll({ mutationKey }).filter((m) => m.state.status === 'pending')).toHaveLength(0);
  });

  it('ignores mutations for different entities', () => {
    cleanups.push(
      queuePendingMutation(queryClient, mutationKey, {
        id: 'entity-2',
        ops: { name: 'Other' },
      }),
    );

    const result = squashPendingMutation(queryClient, mutationKey, 'entity-1', { status: 'done' });

    // Should not merge from entity-2
    expect(result).toEqual({ status: 'done' });
    // entity-2 mutation should still exist
    expect(
      queryClient
        .getMutationCache()
        .findAll({ mutationKey })
        .filter((m) => m.state.status === 'pending'),
    ).toHaveLength(1);
  });

  it('accumulates fields from multiple pending mutations', () => {
    cleanups.push(
      queuePendingMutation(queryClient, mutationKey, {
        id: 'entity-1',
        ops: { name: 'A' },
      }),
    );
    cleanups.push(
      queuePendingMutation(queryClient, mutationKey, {
        id: 'entity-1',
        ops: { description: 'B' },
      }),
    );

    const result = squashPendingMutation(queryClient, mutationKey, 'entity-1', { status: 'C' });

    expect(result).toEqual({ name: 'A', description: 'B', status: 'C' });
    // Both old mutations removed
    expect(
      queryClient
        .getMutationCache()
        .findAll({ mutationKey })
        .filter((m) => m.state.status === 'pending'),
    ).toHaveLength(0);
  });
});

describe('coalescePendingCreate', () => {
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
    queryClient.clear();
  });

  it('returns false when no pending create exists', () => {
    const result = coalescePendingCreate(queryClient, createKey, 'entity-1', { name: 'Updated' });
    expect(result).toBe(false);
  });

  it('coalesces fields into pending create and returns true', () => {
    const variables = { id: 'entity-1', name: 'Original' };
    cleanups.push(queuePendingMutation(queryClient, createKey, variables));

    const result = coalescePendingCreate(queryClient, createKey, 'entity-1', { description: 'Added' });

    expect(result).toBe(true);
    // Fields merged into existing create variables
    expect(variables).toEqual({ id: 'entity-1', name: 'Original', description: 'Added' });
  });

  it('ignores creates for different entities', () => {
    cleanups.push(queuePendingMutation(queryClient, createKey, { id: 'entity-2', name: 'Other' }));

    const result = coalescePendingCreate(queryClient, createKey, 'entity-1', { name: 'X' });
    expect(result).toBe(false);
  });
});
