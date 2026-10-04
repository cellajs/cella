import '~/query/tests/query-client-env';
import { MutationObserver, onlineManager } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '~/lib/api';

const { queryClient } = await import('~/query/query-client');

// The app's own client with its mutation defaults; only `retryDelay` is shortened so the retry budget runs out at once.
describe('mutation pausing on connectivity failure', () => {
  beforeEach(() => onlineManager.setOnline(true));

  afterEach(() => {
    queryClient.clear();
    onlineManager.setOnline(true);
  });

  it('pauses a network-failed mutation instead of erroring, then resumes on reconnect', async () => {
    onlineManager.setOnline(false);

    // Throws like a real fetch would while offline; succeeds once back online.
    const observer = new MutationObserver(queryClient, {
      mutationKey: ['thing', 'update'],
      retryDelay: 0,
      mutationFn: async (vars: { id: string }) => {
        if (!onlineManager.isOnline()) throw new TypeError('Failed to fetch');
        return { ok: vars.id };
      },
    });

    // Stays pending while paused; guard the promise so a later rejection isn't unhandled.
    observer.mutate({ id: 'a' }).catch(() => {});

    const mutation = queryClient.getMutationCache().getAll()[0];
    await vi.waitFor(() => expect(mutation.state.isPaused).toBe(true));

    // The paused, non-error state is what provider.tsx dehydrates into the replay queue.
    expect(mutation.state.status).toBe('pending');
    expect(mutation.state.failureCount).toBeGreaterThanOrEqual(1);

    // Reconnect and resume to mirror the PersistQueryClientProvider onSuccess flow.
    onlineManager.setOnline(true);
    await queryClient.resumePausedMutations();

    await vi.waitFor(() => expect(mutation.state.status).toBe('success'));
    expect(mutation.state.isPaused).toBe(false);
    expect(mutation.state.data).toEqual({ ok: 'a' });
  });

  it('flags the stx of a mutation that pauses, so the request it sends on resume is a replay', async () => {
    onlineManager.setOnline(false);

    const stx = { mutationId: 'm-1', sourceId: 'tab-1', fieldTimestamps: { name: '1710500000123:0001:abcde' } };
    // Records the stx of each attempt as the request would carry it.
    const sent: unknown[] = [];
    const observer = new MutationObserver(queryClient, {
      mutationKey: ['thing', 'update'],
      retryDelay: 0,
      mutationFn: async (vars: { id: string; stx: typeof stx }) => {
        sent.push({ ...vars.stx });
        if (!onlineManager.isOnline()) throw new TypeError('Failed to fetch');
        return { ok: vars.id };
      },
    });

    observer.mutate({ id: 'a', stx }).catch(() => {});
    const mutation = queryClient.getMutationCache().getAll()[0];
    await vi.waitFor(() => expect(mutation.state.isPaused).toBe(true));

    onlineManager.setOnline(true);
    await queryClient.resumePausedMutations();
    await vi.waitFor(() => expect(mutation.state.status).toBe('success'));

    // The first attempt left as a live edit; the resumed one keeps its ids and timestamps and adds the flag.
    const { mutationId, sourceId, fieldTimestamps } = stx;
    expect(sent).toEqual([
      { mutationId, sourceId, fieldTimestamps },
      { mutationId, sourceId, fieldTimestamps, replayed: true },
    ]);
  });

  it('leaves the stx of a mutation that never pauses unflagged, so the server orders it by arrival', async () => {
    const stx = { mutationId: 'm-2', sourceId: 'tab-1', fieldTimestamps: { name: '1710500000123:0001:abcde' } };
    const observer = new MutationObserver(queryClient, {
      mutationKey: ['thing', 'update'],
      mutationFn: async (vars: { id: string; stx: typeof stx }) => vars.stx,
    });

    expect(await observer.mutate({ id: 'a', stx })).not.toHaveProperty('replayed');
  });

  it('flags a mutation restored paused from the persisted cache, each item of a batch included', () => {
    const batch = [{ stx: { mutationId: 'm-3' } }, { stx: { mutationId: 'm-3' } }];
    const live = { stx: { mutationId: 'm-4' } };
    const restore = (variables: unknown, isPaused: boolean) =>
      queryClient.getMutationCache().build(
        queryClient,
        { mutationKey: ['thing', 'create'], mutationFn: async () => null },
        {
          context: undefined,
          data: undefined,
          error: null,
          failureCount: 0,
          failureReason: null,
          isPaused,
          status: 'pending',
          variables,
          submittedAt: Date.now(),
        },
      );

    restore(batch, true);
    restore(live, false);

    expect(batch.map((item) => item.stx)).toEqual([
      { mutationId: 'm-3', replayed: true },
      { mutationId: 'm-3', replayed: true },
    ]);
    expect(live.stx).toEqual({ mutationId: 'm-4' });
  });

  it('does not pause a server error: it fails fast so 4xx/5xx handlers run', async () => {
    // onlineManager stays online; the server responds with an error.
    const observer = new MutationObserver(queryClient, {
      mutationKey: ['thing', 'update'],
      retryDelay: 0,
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
