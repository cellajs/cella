import { MutationObserver, onlineManager, QueryClient } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { removePendingMutations } from '~/query/basic/invalidation-helpers';

/**
 * removePendingMutations must not evict an ACTIVE (in-flight) update: eviction drops it from the
 * scope queue (without cancelling its request), letting a same-scope delete start alongside it.
 * Only QUEUED (offline-parked) updates are removed.
 */
describe('removePendingMutations: preserves active updates for scope serialization', () => {
  let queryClient: QueryClient;
  const updateKey = ['attachment', 'update'] as const;
  const cleanups: (() => void)[] = [];

  beforeEach(() => {
    queryClient = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  });

  afterEach(() => {
    for (const fn of cleanups) fn();
    cleanups.length = 0;
    onlineManager.setOnline(true);
    queryClient.clear();
  });

  it('removes a QUEUED update but leaves an ACTIVE update in the mutation cache', async () => {
    let release: () => void = () => {};
    const never = new Promise<Record<string, unknown>>((r) => {
      release = () => r({});
    });
    cleanups.push(() => release());
    // networkMode 'always' keeps this active (on the wire) regardless of connectivity.
    const active = new MutationObserver(queryClient, {
      mutationKey: updateKey,
      networkMode: 'always',
      mutationFn: (_vars: { id: string }) => never,
    });
    active.mutate({ id: 'active-1' }).catch(() => {});

    onlineManager.setOnline(false);
    const queued = new MutationObserver(queryClient, {
      mutationKey: updateKey,
      mutationFn: async (_vars: { id: string }) => ({}),
    });
    queued.mutate({ id: 'queued-1' }).catch(() => {});

    const cache = queryClient.getMutationCache();
    await vi.waitFor(() => {
      expect(cache.getAll().some((m) => m.state.status === 'pending' && !m.state.isPaused)).toBe(true);
      expect(cache.getAll().some((m) => m.state.isPaused)).toBe(true);
    });

    removePendingMutations(queryClient, updateKey, ['active-1', 'queued-1']);

    const pending = cache.findAll({ mutationKey: updateKey });
    expect(pending.some((m) => (m.state.variables as { id?: string })?.id === 'active-1')).toBe(true);
    expect(pending.some((m) => (m.state.variables as { id?: string })?.id === 'queued-1')).toBe(false);
  });
});
