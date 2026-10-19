import { hydrate, QueryClient } from '@tanstack/react-query';
import { describe, expect, it, vi } from 'vitest';
import { warnMutationsWithoutDefaults } from '~/query/mutation-registry';

/** A paused mutation as the persister stores it. */
const pausedMutation = (mutationKey: string[]) => ({
  mutationKey,
  state: {
    context: undefined,
    data: undefined,
    error: null,
    failureCount: 0,
    failureReason: null,
    isPaused: true,
    status: 'pending' as const,
    variables: { id: 'row-1' },
    submittedAt: Date.now(),
  },
});

describe('warnMutationsWithoutDefaults', () => {
  it('names a restored mutation whose defaults were registered after the restore', () => {
    const queryClient = new QueryClient();
    queryClient.setMutationDefaults(['registered', 'create'], { mutationFn: async () => null });
    hydrate(queryClient, { queries: [], mutations: [pausedMutation(['registered', 'create']), pausedMutation(['late', 'create'])] });
    // Registered after the restore: the mutation hydrated before this keeps the options it was built with.
    queryClient.setMutationDefaults(['late', 'create'], { mutationFn: async () => null });
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    expect(warnMutationsWithoutDefaults(queryClient)).toEqual([['late', 'create']]);
    expect(warn).toHaveBeenCalledTimes(1);
    warn.mockRestore();
  });
});
