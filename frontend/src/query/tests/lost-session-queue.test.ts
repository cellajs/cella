import 'fake-indexeddb/auto';
import '~/query/tests/query-client-env';
import { persistQueryClientRestore, persistQueryClientSubscribe } from '@tanstack/react-query-persist-client';
import { Dexie } from 'dexie';
import { appConfig } from 'shared';
import { describe, expect, it, vi } from 'vitest';

const sessionValues = new Map<string, string>();
vi.stubGlobal('sessionStorage', {
  getItem: (key: string) => sessionValues.get(key) ?? null,
  setItem: (key: string, value: string) => sessionValues.set(key, value),
  removeItem: (key: string) => sessionValues.delete(key),
});

/** The replay gate: held while the session is lost, opened by the next session's catchup. */
const gate = vi.hoisted(() => {
  let resolveGate = () => {};
  const promise = new Promise<void>((resolve) => {
    resolveGate = resolve;
  });
  return { promise, open: () => resolveGate() };
});
vi.mock('~/query/realtime/stream-manager', () => ({ waitForActiveCatchup: () => gate.promise }));

const { markCacheRestored, queryClient } = await import('~/query/query-client');
const { persister, persistOptions } = await import('~/query/persister');
const { getLocalUserDb } = await import('~/query/local-user-db');
const { userStore } = await import('~/modules/user/user-store');
const { teardownUserState } = await import('~/utils/teardown-user-state');
// Registers the restore a rebind runs, as the app's entry does.
await import('~/query/persisted-query-provider');

type StoredUser = NonNullable<ReturnType<typeof userStore.getState>['user']>;
// A test mock: binding the database reads the id alone.
const user = { id: 'user-a', email: 'a@example.test' } as StoredUser;
const sent: string[] = [];
queryClient.setMutationDefaults(['thing', 'update'], {
  mutationFn: async (variables: { id: string }) => {
    sent.push(variables.id);
  },
});

const queuedWrite = {
  mutationKey: ['thing', 'update'],
  state: {
    context: undefined,
    data: undefined,
    error: null,
    failureCount: 0,
    failureReason: null,
    isPaused: true,
    status: 'pending' as const,
    variables: { id: 'queued', ops: { name: 'renamed offline' }, stx: { mutationId: 'mutation-1' } },
    submittedAt: Date.now(),
  },
};

const pausedCount = () =>
  queryClient
    .getMutationCache()
    .getAll()
    .filter(({ state }) => state.isPaused).length;

// The first write after the rebind found an empty queue in memory and deleted the one this tab stored, so the writes a
// lost session held were gone once the same user signed in again without a reload.
describe('writes held by a lost session', () => {
  it('replay once the same user signs in again in this tab, and are neither deleted nor quarantined', async () => {
    userStore.setState({ user, lastUser: user });
    const tabId = sessionValues.get(`${appConfig.slug}-tab-session-id`);
    await getLocalUserDb()?.meta.bulkPut([
      { key: 'rq', timestamp: Date.now(), buster: '', mutations: [], bundledQueries: [] },
      { key: `rq:mut:${tabId}`, timestamp: Date.now(), buster: '', mutations: [queuedWrite], bundledQueries: [] },
    ]);

    // Boot, as the provider restores and subscribes.
    await persistQueryClientRestore({ queryClient, ...persistOptions });
    markCacheRestored();
    const unsubscribe = persistQueryClientSubscribe({ queryClient, ...persistOptions });
    expect(pausedCount()).toBe(1);

    // The session is lost while the gate holds the replay: a 401 tears the client state down.
    await teardownUserState(false);
    expect(pausedCount()).toBe(0);

    // The same user signs in in this tab; the new session's first query is stored before anything else.
    userStore.setState({ user, lastUser: user });
    queryClient.setQueryData(['thing', 'list'], []);
    await persister.flush();

    await vi.waitFor(() => expect(pausedCount()).toBe(1));
    gate.open();

    await vi.waitFor(() => expect(sent).toEqual(['queued']));
    expect(await getLocalUserDb()?.failedSync.count()).toBe(0);

    unsubscribe();
    await teardownUserState();
    await Dexie.delete(`${appConfig.slug}:${user.id}`);
  });
});
