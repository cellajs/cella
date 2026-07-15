import { MutationObserver, onlineManager, QueryClient } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '~/lib/api';
import { mutationRetry } from '~/query/offline/network-retry';

/**
 * End-to-end proof of the offline mutation queue behavior enabled by the
 * `networkMode: 'offlineFirst'` + `mutationRetry` config in query-client.ts: a
 * mutation that fails with a connectivity error while offline must PAUSE (so it can
 * be dehydrated into the persisted replay queue) rather than settle as an error,
 * then resume to success on reconnect. A server error must still fail fast.
 *
 * `retryDelay: 0` exercises the pause path without waiting on the exponential
 * backoff — the pause is driven by onlineManager state, not by the delay.
 */
describe('mutation pausing on connectivity failure', () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    onlineManager.setOnline(true);
    queryClient = new QueryClient({
      defaultOptions: {
        mutations: { networkMode: 'offlineFirst', retry: mutationRetry, retryDelay: 0 },
      },
    });
  });

  afterEach(() => {
    queryClient.clear();
    onlineManager.setOnline(true);
  });

  it('pauses a network-failed mutation instead of erroring, then resumes on reconnect', async () => {
    onlineManager.setOnline(false);

    // Throws like a real fetch would while offline; succeeds once back online.
    const observer = new MutationObserver(queryClient, {
      mutationKey: ['thing', 'update'],
      mutationFn: async (vars: { id: string }) => {
        if (!onlineManager.isOnline()) throw new TypeError('Failed to fetch');
        return { ok: vars.id };
      },
    });

    // Stays pending while paused; guard the promise so a later rejection isn't unhandled.
    observer.mutate({ id: 'a' }).catch(() => {});

    const mutation = queryClient.getMutationCache().getAll()[0];
    await vi.waitFor(() => expect(mutation.state.isPaused).toBe(true));

    // Paused, NOT errored — this is the state provider.tsx dehydrates into the replay queue.
    expect(mutation.state.status).toBe('pending');
    expect(mutation.state.failureCount).toBeGreaterThanOrEqual(1);

    // Reconnect + resume — mirrors the PersistQueryClientProvider onSuccess flow.
    onlineManager.setOnline(true);
    await queryClient.resumePausedMutations();

    await vi.waitFor(() => expect(mutation.state.status).toBe('success'));
    expect(mutation.state.isPaused).toBe(false);
    expect(mutation.state.data).toEqual({ ok: 'a' });
  });

  it('does not pause a server error — it fails fast so 4xx/5xx handlers run', async () => {
    // onlineManager stays online; the server responds with an error.
    const observer = new MutationObserver(queryClient, {
      mutationKey: ['thing', 'update'],
      mutationFn: async (_vars: { id: string }) => {
        throw new ApiError({ status: 409, type: 'conflict' });
      },
    });

    await observer.mutate({ id: 'a' }).catch(() => {});

    const mutation = queryClient.getMutationCache().getAll()[0];
    expect(mutation.state.status).toBe('error');
    expect(mutation.state.isPaused).toBe(false);
  });
});
