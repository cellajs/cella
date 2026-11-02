import '~/query/tests/query-client-env';
import { MutationObserver, onlineManager } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('shared', () => ({
  appConfig: { productEntityTypes: ['attachment'], clientCacheVersion: 'v1' },
  isProduct: (type: string) => type === 'attachment',
}));

const quarantineFailedSync = vi.fn(async (_record: unknown) => {});
vi.mock('~/query/offline/failed-sync', () => ({ quarantineFailedSync: (record: unknown) => quarantineFailedSync(record) }));

const { queryClient } = await import('~/query/query-client');

const refusal = (status: number, type?: string) => Object.assign(new Error('refused'), { status, type });

/** An edit of the attachment scope whose request fails as a browser fetch does while offline, and otherwise gets `answer`. */
function edit(mutationId: string, answer: () => Promise<unknown>) {
  const mutationFn = async () => {
    if (!onlineManager.isOnline()) throw new TypeError('Failed to fetch');
    return answer();
  };
  const options = { mutationKey: ['attachment', 'update'], scope: { id: 'attachment' }, mutationFn, retryDelay: 0 };
  return new MutationObserver<unknown, Error, { id: string; stx: { mutationId: string } }>(queryClient, options)
    .mutate({ id: 'att-1', stx: { mutationId } })
    .catch(() => {});
}

/** An answer that waits until `release` is called. */
function heldAnswer() {
  const held = { release: () => {} };
  const answer = () => new Promise<void>((resolve) => (held.release = resolve));
  return { answer, held };
}

const refuse = (status: number, type?: string) => async () => Promise.reject(refusal(status, type));
const pausedCount = () =>
  queryClient
    .getMutationCache()
    .getAll()
    .filter(({ state }) => state.isPaused).length;
const quarantinedIds = () => quarantineFailedSync.mock.calls.map(([record]) => (record as { mutationId: string }).mutationId);

describe('failedSync quarantine of a replay', () => {
  // A mounted client resumes paused mutations on the online event, as the app's does.
  beforeEach(() => queryClient.mount());
  afterEach(() => {
    queryClient.unmount();
    queryClient.getMutationCache().clear();
    onlineManager.setOnline(true);
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  // Only a replay resumed at boot or sign-in was recorded, so an edit that paused offline and resumed on the online event got its 404 unquarantined.
  it('quarantines a 4xx of an edit that paused offline, whether it failed there or waited behind another, once the online event resumes it', async () => {
    onlineManager.setOnline(false);
    const replays = [edit('m-gone', refuse(404)), edit('m-waited', refuse(409))];
    await vi.waitFor(() => expect(pausedCount()).toBe(2));

    onlineManager.setOnline(true);
    await Promise.all(replays);

    expect(quarantinedIds()).toEqual(['m-gone', 'm-waited']);
    expect(quarantineFailedSync).toHaveBeenCalledWith(expect.objectContaining({ mutationKey: ['attachment', 'update'], status: 404 }));
  });

  it('must not quarantine a live edit that waited online behind another of its scope, unless the device went offline while it waited', async () => {
    const online = heldAnswer();
    const first = edit('m-first', online.answer);
    const waitedOnline = edit('m-waited-online', refuse(422));
    await vi.waitFor(() => expect(pausedCount()).toBe(1));
    online.held.release();
    await Promise.all([first, waitedOnline]);
    expect(quarantinedIds()).toEqual([]);

    const cutOff = heldAnswer();
    const second = edit('m-second', cutOff.answer);
    const waitedOffline = edit('m-waited-offline', refuse(422));
    await vi.waitFor(() => expect(pausedCount()).toBe(1));
    onlineManager.setOnline(false);
    onlineManager.setOnline(true);
    cutOff.held.release();
    await Promise.all([second, waitedOffline]);
    expect(quarantinedIds()).toEqual(['m-waited-offline']);
  });

  it('must not quarantine a replay that meets a lost session, whose teardown keeps it queued, but does on an auth page, where none runs', async () => {
    for (const path of ['/organization/attachments', '/auth/authenticate']) {
      vi.stubGlobal('location', new URL(`https://app.example${path}`));
      onlineManager.setOnline(false);
      const replay = edit(`m-${path}`, refuse(401, 'session_expired'));
      await vi.waitFor(() => expect(pausedCount()).toBe(1));
      onlineManager.setOnline(true);
      await replay;
      queryClient.getMutationCache().clear();
    }

    expect(quarantinedIds()).toEqual(['m-/auth/authenticate']);
  });
});
