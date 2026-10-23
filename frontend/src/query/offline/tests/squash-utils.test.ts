import { MutationObserver, onlineManager, QueryClient } from '@tanstack/react-query';
import type { StxBase } from 'sdk';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { removePausedCreates, squashIntoPendingCreate, squashPendingMutation } from '~/query/offline/squash-utils';

/** Build a minimal stx carrying the given field timestamps. */
function stxWith(fieldTimestamps: Record<string, string> = {}): StxBase {
  return { mutationId: `mut-${Object.keys(fieldTimestamps).join('-') || 'x'}`, sourceId: 'test', fieldTimestamps };
}

/** Creates a queued, offline-parked mutation. Coalescing only runs while offline, so the client stays offline until afterEach restores it. */
function queuePausedMutation(queryClient: QueryClient, mutationKey: readonly unknown[], variables: Record<string, unknown> | unknown[]): void {
  onlineManager.setOnline(false);
  const observer = new MutationObserver(queryClient, { mutationKey, mutationFn: async (_vars: Record<string, unknown>) => ({}) });
  observer.mutate(variables as Record<string, unknown>).catch(() => {});
}

/** Creates an in-flight (pending, not paused) mutation that never resolves. networkMode 'always' keeps it active while the client is offline, modelling a request on the wire. */
function queueInFlightMutation(queryClient: QueryClient, mutationKey: readonly unknown[], variables: Record<string, unknown>): () => void {
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

// Only paused mutations participate in squashing and pending-create coalescing: in-flight requests are on the wire and must be left alone.
describe('offline coalescing', () => {
  let queryClient: QueryClient;
  const updateKey = ['task', 'update'] as const;
  const createKey = ['task', 'create'] as const;
  /** The keys the create body of this entity takes. */
  const creatable = ['id', 'name', 'description', 'labels'];
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

  it('folds every queued update of the row into the new one, which replaces them, and leaves the updates of other rows', () => {
    queuePausedMutation(queryClient, updateKey, { id: 'entity-1', ops: { name: 'A', description: 'Desc' } });
    queuePausedMutation(queryClient, updateKey, { id: 'entity-1', ops: { name: 'B' } });
    queuePausedMutation(queryClient, updateKey, { id: 'entity-2', ops: { name: 'Other' } });

    const result = squashPendingMutation(queryClient, updateKey, 'entity-1', { status: 'done' }, stxWith());

    // Newer queued values win over older ones, the incoming edit over all.
    expect(result.ops).toEqual({ name: 'B', description: 'Desc', status: 'done' });
    expect(
      queryClient
        .getMutationCache()
        .findAll({ mutationKey: updateKey })
        .map(({ state }) => state.variables),
    ).toEqual([{ id: 'entity-2', ops: { name: 'Other' } }]);
  });

  it('keeps the intent time of each field the new edit does not touch, and takes its own for the fields it changes (LWW by intent time)', () => {
    // A queued edit set `name` and `description` at t1, the new one changes `description` at t2: the merged request must keep name@t1, or an older name edit could beat a newer one.
    queuePausedMutation(queryClient, updateKey, {
      id: 'entity-1',
      ops: { name: 'Old name', description: 'Old' },
      stx: stxWith({ name: 't1', description: 't1' }),
    });

    const result = squashPendingMutation(queryClient, updateKey, 'entity-1', { description: 'New desc' }, stxWith({ description: 't2' }));

    expect(result.ops).toEqual({ name: 'Old name', description: 'New desc' });
    expect(result.stx.fieldTimestamps).toEqual({ name: 't1', description: 't2' });
  });

  it('folds an edit into the row of a queued create, in each shape a create holds its rows', () => {
    // Attachment-style variables: routing context + data rows, no top-level id.
    const batch = {
      tenantId: 't1',
      organizationId: 'o1',
      data: [
        { id: 'entity-1', name: 'One' },
        { id: 'entity-2', name: 'Two' },
      ],
    };
    const oneRow = { tenantId: 't1', organizationId: 'o1', data: { id: 'entity-3', name: 'Three' } };
    const topLevel = { id: 'entity-4', name: 'Four' };
    for (const variables of [batch, oneRow, topLevel]) queuePausedMutation(queryClient, createKey, variables);

    for (const id of ['entity-2', 'entity-3', 'entity-4'])
      expect(squashIntoPendingCreate(queryClient, createKey, id, { name: 'Renamed' }, creatable)).toBe(true);

    // Merged into the row, not the variables root, and only into that row.
    expect(batch.data).toEqual([
      { id: 'entity-1', name: 'One' },
      { id: 'entity-2', name: 'Renamed' },
    ]);
    expect('name' in batch).toBe(false);
    expect(oneRow.data).toEqual({ id: 'entity-3', name: 'Renamed' });
    expect(topLevel).toEqual({ id: 'entity-4', name: 'Renamed' });
  });

  it('leaves an edit the create body cannot carry for a separate update: a field it does not take, or a relative array delta', () => {
    const variables = { tenantId: 't1', organizationId: 'o1', data: [{ id: 'entity-1', name: 'One', labels: ['a'] }] };
    queuePausedMutation(queryClient, createKey, variables);

    // `status` is an update-only field here: the server would drop it from the create and no request would carry it.
    expect(squashIntoPendingCreate(queryClient, createKey, 'entity-1', { name: 'Renamed', status: 3 }, creatable)).toBe(false);
    // A create carries full arrays, a delta is relative to the stored one.
    expect(squashIntoPendingCreate(queryClient, createKey, 'entity-1', { labels: { add: ['b'], remove: [] } }, creatable)).toBe(false);
    expect(variables.data[0]).toEqual({ id: 'entity-1', name: 'One', labels: ['a'] });
  });

  it('cancels the deleted rows of a queued create, and the create itself once no row is left', () => {
    const batch = {
      tenantId: 't1',
      organizationId: 'o1',
      data: [
        { id: 'entity-1', name: 'Keep' },
        { id: 'entity-2', name: 'Delete' },
      ],
    };
    queuePausedMutation(queryClient, createKey, batch);
    queuePausedMutation(queryClient, createKey, { organizationId: 'o1', data: { id: 'entity-3', name: 'One row' } });
    queuePausedMutation(queryClient, createKey, { id: 'entity-4', name: 'Top level' });

    expect(removePausedCreates(queryClient, createKey, ['entity-2', 'entity-3', 'entity-4'])).toEqual(['entity-2', 'entity-3', 'entity-4']);
    expect(batch.data).toEqual([{ id: 'entity-1', name: 'Keep' }]);
    expect(
      queryClient
        .getMutationCache()
        .findAll({ mutationKey: createKey })
        .map(({ state }) => state.variables),
    ).toEqual([batch]);

    expect(removePausedCreates(queryClient, createKey, ['entity-1'])).toEqual(['entity-1']);
    expect(queryClient.getMutationCache().findAll({ mutationKey: createKey })).toHaveLength(0);
  });

  it('changes nothing while online, where a queued mutation may already be on its way', () => {
    const create = { id: 'entity-1', name: 'Original' };
    queuePausedMutation(queryClient, createKey, create);
    queuePausedMutation(queryClient, updateKey, { id: 'entity-2', ops: { name: 'Old' } });
    onlineManager.setOnline(true); // back online before coalescing

    // Each queued mutation replays as its own scope-serialized request.
    expect(squashPendingMutation(queryClient, updateKey, 'entity-2', { status: 'done' }, stxWith()).ops).toEqual({ status: 'done' });
    expect(squashIntoPendingCreate(queryClient, createKey, 'entity-1', { description: 'Added' }, creatable)).toBe(false);
    expect(removePausedCreates(queryClient, createKey, ['entity-1'])).toEqual([]);
    expect(create).toEqual({ id: 'entity-1', name: 'Original' });
    expect(queryClient.getMutationCache().getAll()).toHaveLength(2);
  });

  it('never merges into or cancels a mutation already on the wire', () => {
    onlineManager.setOnline(false); // offline so the online gate does not mask the in-flight guard
    cleanups.push(queueInFlightMutation(queryClient, updateKey, { id: 'entity-1', ops: { name: 'InFlight' } }));
    cleanups.push(queueInFlightMutation(queryClient, createKey, { id: 'entity-2', name: 'Sending' }));

    // Not merged, not removed: LWW/delta merge makes the overlap idempotent server-side.
    expect(squashPendingMutation(queryClient, updateKey, 'entity-1', { status: 'done' }, stxWith()).ops).toEqual({ status: 'done' });
    // The row may reach the server: an edit must follow as its own update, and a delete must be sent.
    expect(squashIntoPendingCreate(queryClient, createKey, 'entity-2', { name: 'X' }, creatable)).toBe(false);
    expect(removePausedCreates(queryClient, createKey, ['entity-2'])).toEqual([]);
    expect(
      queryClient
        .getMutationCache()
        .getAll()
        .filter((m) => m.state.status === 'pending'),
    ).toHaveLength(2);
  });
});
