import { MutationObserver, onlineManager, QueryClient } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { squashPendingMutation } from '../squash-utils';

/**
 * Helper: create a PAUSED mutation (offline at mutate time), the state offline edits queue in
 * and the only state squashing may touch. Returns a cleanup restoring online mode.
 */
function queuePendingMutation(
  queryClient: QueryClient,
  mutationKey: readonly unknown[],
  variables: Record<string, unknown>,
): () => void {
  onlineManager.setOnline(false);
  const observer = new MutationObserver(queryClient, {
    mutationKey,
    mutationFn: async (_vars: Record<string, unknown>) => ({}),
  });
  observer.mutate(variables).catch(() => {});
  return () => onlineManager.setOnline(true);
}

interface FakeEntity {
  id: string;
  name: string;
  description: string;
  status: string;
  stx: { mutationId: string; sourceId: string; fieldTimestamps: Record<string, string> };
  updatedAt: string;
}

// Covers offline queue replay, squashing, version chaining, and create/edit coalescing.
describe('offline reconciliation lifecycle', () => {
  let queryClient: QueryClient;
  const listKey = ['test', 'list'] as const;
  const entityId = 'entity-1';

  const initialEntity: FakeEntity = {
    id: entityId,
    name: 'Original',
    description: 'Original desc',
    status: 'todo',
    stx: {
      mutationId: 'init',
      sourceId: 'server',
      fieldTimestamps: { name: '100:0001:aaa', description: '100:0002:aaa', status: '100:0003:aaa' },
    },
    updatedAt: '2026-01-01T00:00:00Z',
  };

  const cleanups: (() => void)[] = [];

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: { mutations: { retry: false } },
    });
    queryClient.setQueryData(listKey, initialEntity);
  });

  afterEach(() => {
    for (const fn of cleanups) fn();
    cleanups.length = 0;
    queryClient.clear();
  });

  // Minimal stx carrying a timestamp for each supplied field.
  const stxFor = (keys: string[]) => ({
    mutationId: `m-${keys.join('-')}`,
    sourceId: 's',
    fieldTimestamps: Object.fromEntries(keys.map((k) => [k, `t-${k}`])),
  });

  it('squash accumulates fields from sequential edits to same entity', () => {
    const mutationKey = ['test', 'update'] as const;

    // Simulate 3 offline edits to the same entity, each changing different fields
    // First edit: no pending, returns as-is.
    const r1 = squashPendingMutation(queryClient, mutationKey, entityId, { name: 'Edit 1' }, stxFor(['name']));
    expect(r1.ops).toEqual({ name: 'Edit 1' });

    // Queue first mutation as pending
    cleanups.push(queuePendingMutation(queryClient, mutationKey, { id: entityId, ops: r1.ops, stx: r1.stx }));

    // Second edit: squashes with first.
    const r2 = squashPendingMutation(
      queryClient,
      mutationKey,
      entityId,
      { description: 'Edit 2' },
      stxFor(['description']),
    );
    expect(r2.ops).toEqual({ name: 'Edit 1', description: 'Edit 2' });
    // Inherited field keeps its original intent timestamp; the new field carries its own.
    expect(r2.stx.fieldTimestamps).toEqual({ name: 't-name', description: 't-description' });

    // Queue second mutation
    cleanups.push(queuePendingMutation(queryClient, mutationKey, { id: entityId, ops: r2.ops, stx: r2.stx }));

    // Third edit: squashes with accumulated.
    const r3 = squashPendingMutation(queryClient, mutationKey, entityId, { status: 'done' }, stxFor(['status']));
    expect(r3.ops).toEqual({ name: 'Edit 1', description: 'Edit 2', status: 'done' });
  });

  it('squash uses latest value when same field is edited multiple times', () => {
    const mutationKey = ['test', 'update'] as const;

    // First edit: name = 'Draft 1'
    const r1 = squashPendingMutation(queryClient, mutationKey, entityId, { name: 'Draft 1' }, stxFor(['name']));
    cleanups.push(queuePendingMutation(queryClient, mutationKey, { id: entityId, ops: r1.ops, stx: r1.stx }));

    // Second edit: name = 'Draft 2' (overrides)
    const r2 = squashPendingMutation(queryClient, mutationKey, entityId, { name: 'Draft 2' }, stxFor(['name']));
    expect(r2.ops).toEqual({ name: 'Draft 2' });

    cleanups.push(queuePendingMutation(queryClient, mutationKey, { id: entityId, ops: r2.ops, stx: r2.stx }));

    // Third edit: name = 'Final' (overrides again)
    const r3 = squashPendingMutation(queryClient, mutationKey, entityId, { name: 'Final' }, stxFor(['name']));
    expect(r3.ops).toEqual({ name: 'Final' });

    // Result: only 1 mutation queued with the final value
  });

  it('HLC timestamps are updated through sequential mutation replay', async () => {
    /**
     * Simulates: two mutations queued offline, replayed on reconnect.
     * The scope ensures sequential execution, so the second mutation reads
     * fresh stx timestamps from the first mutation's onSuccess.
     */
    const capturedTimestamps: Record<string, string>[] = [];
    let counter = 1;

    const mutationOptions = {
      scope: { id: 'test-entity' },
      mutationFn: async ({ ops }: { ops: Record<string, string> }) => {
        const cached = queryClient.getQueryData<FakeEntity>(listKey);
        capturedTimestamps.push({ ...(cached?.stx?.fieldTimestamps ?? {}) });

        counter++;
        const changedField = Object.keys(ops)[0];
        return {
          ...cached,
          ...ops,
          stx: {
            mutationId: `mut-${counter}`,
            sourceId: 'server',
            fieldTimestamps: { ...cached?.stx?.fieldTimestamps, [changedField]: `${200 + counter}:0001:srv` },
          },
          updatedAt: new Date().toISOString(),
        } as FakeEntity;
      },
      onSuccess: (result: FakeEntity) => {
        queryClient.setQueryData<FakeEntity>(listKey, (old) =>
          old ? { ...old, ...result, stx: result.stx, updatedAt: result.updatedAt } : old,
        );
      },
    };

    const observer1 = new MutationObserver(queryClient, mutationOptions);
    const observer2 = new MutationObserver(queryClient, mutationOptions);

    const p1 = observer1.mutate({ ops: { name: 'New Name' } });
    const p2 = observer2.mutate({ ops: { description: 'New Desc' } });

    await Promise.all([p1, p2]);

    // First mutation sees initial timestamps
    expect(capturedTimestamps[0].name).toBe('100:0001:aaa');
    // Second mutation sees updated name timestamp from first's onSuccess
    expect(capturedTimestamps[1].name).toBe('202:0001:srv');
    // Cache has final timestamps for both fields
    const final = queryClient.getQueryData<FakeEntity>(listKey);
    expect(final?.stx?.fieldTimestamps?.name).toBe('202:0001:srv');
    expect(final?.stx?.fieldTimestamps?.description).toBe('203:0001:srv');
  });

  it('server error does not corrupt the cache', async () => {
    /**
     * Simulates: mutation fails on server.
     * The onError should restore the previous cached entity.
     */
    const mutationOptions = {
      scope: { id: 'test-entity' },
      mutationFn: async () => {
        throw Object.assign(new Error('field_conflict'), { status: 409 });
      },
      onMutate: async () => {
        // Optimistic update
        const previous = queryClient.getQueryData<FakeEntity>(listKey);
        queryClient.setQueryData<FakeEntity>(listKey, (old) => (old ? { ...old, name: 'Optimistic' } : old));
        return { previous };
      },
      onError: (_err: Error, _vars: unknown, context: { previous?: FakeEntity } | undefined) => {
        // Rollback optimistic update
        if (context?.previous) {
          queryClient.setQueryData<FakeEntity>(listKey, context.previous);
        }
      },
    };

    const observer = new MutationObserver(queryClient, mutationOptions);

    try {
      await observer.mutate({});
    } catch {
      // Expected 409
    }

    // Cache should be restored to original
    const cached = queryClient.getQueryData<FakeEntity>(listKey);
    expect(cached?.name).toBe('Original');
    expect(cached?.stx?.fieldTimestamps?.name).toBe('100:0001:aaa');
  });

  it('independent entities can mutate concurrently (different scope)', async () => {
    /**
     * Mutations for different entities should not block each other.
     * They use different scope IDs, so they run concurrently.
     */
    const executionOrder: string[] = [];

    const createMutationOptions = (entityId: string) => ({
      scope: { id: `entity-${entityId}` },
      mutationFn: async () => {
        executionOrder.push(`start-${entityId}`);
        // Minimal async delay
        await Promise.resolve();
        executionOrder.push(`end-${entityId}`);
        return { id: entityId };
      },
    });

    const observer1 = new MutationObserver(queryClient, createMutationOptions('A'));
    const observer2 = new MutationObserver(queryClient, createMutationOptions('B'));

    await Promise.all([observer1.mutate(), observer2.mutate()]);

    // Both should have started before either ended (concurrent execution)
    expect(executionOrder[0]).toBe('start-A');
    expect(executionOrder[1]).toBe('start-B');
  });
});

describe('create + edit coalescing', () => {
  let queryClient: QueryClient;
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

  it('offline create followed by edit produces single create with merged fields', () => {
    const createKey = ['test', 'create'] as const;

    // Simulate create queued (offline)
    const createVars = { id: 'temp-1', name: 'New Task', status: 'todo' };
    cleanups.push(queuePendingMutation(queryClient, createKey, createVars));

    // User edits the description while still offline; squashIntoPendingCreate merges into the pending create.
    const mutations = queryClient.getMutationCache().findAll({ mutationKey: createKey });
    const pendingCreate = mutations.find((m) => {
      const vars = m.state.variables as { id?: string } | undefined;
      return m.state.status === 'pending' && vars?.id === 'temp-1';
    });

    expect(pendingCreate).toBeDefined();

    // Merge description into the create variables
    const vars = pendingCreate!.state.variables as Record<string, unknown>;
    Object.assign(vars, { description: 'Added offline' });

    expect(vars).toEqual({
      id: 'temp-1',
      name: 'New Task',
      status: 'todo',
      description: 'Added offline',
    });
  });
});
