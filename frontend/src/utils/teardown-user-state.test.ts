import 'fake-indexeddb/auto';
import '~/query/tests/query-client-env';
import { MutationObserver, onlineManager } from '@tanstack/react-query';
import { Dexie } from 'dexie';
import { appConfig } from 'shared';
import { afterEach, describe, expect, it, vi } from 'vitest';

const { queryClient } = await import('~/query/query-client');
const { bindLocalUserDb, closeLocalUserDb, getLocalUserDb } = await import('~/query/local-user-db');
const { useUserStore } = await import('~/modules/user/user-store');
const { teardownUserState } = await import('~/utils/teardown-user-state');

const dbName = (owner: string) => `${appConfig.slug}:${owner}`;
/** The owner of every mutation the server received, in order. */
const sent: string[] = [];

/** An edit of `owner` that failed offline and waits, paused, for the connection: the state the persisted queue restores. */
async function pauseMutation(owner: string): Promise<void> {
  onlineManager.setOnline(false);
  const observer = new MutationObserver(queryClient, {
    mutationKey: ['thing', 'update'],
    retryDelay: 0,
    mutationFn: async (_variables: { owner: string }) => {
      if (!onlineManager.isOnline()) throw new TypeError('Failed to fetch');
      sent.push(owner);
      return owner;
    },
  });
  // Stays pending while paused; guarded, since a teardown drops the mutation without settling it.
  observer.mutate({ owner }).catch(() => {});
  const paused = () =>
    queryClient
      .getMutationCache()
      .getAll()
      .some((mutation) => mutation.state.isPaused && (mutation.state.variables as { owner: string }).owner === owner);
  await vi.waitFor(() => expect(paused()).toBe(true));
}

afterEach(async () => {
  queryClient.clear();
  onlineManager.setOnline(true);
  sent.length = 0;
  closeLocalUserDb();
  for (const owner of ['user-a', 'user-b']) await Dexie.delete(dbName(owner));
});

describe('teardownUserState', () => {
  it.each([true, false])(
    "must not carry one account's cache, queued edits or database over to the next (wipe: %s)",
    async (wipe) => {
      const user = { id: 'user-a', email: 'a@example.test' };
      useUserStore.setState({ user: user as never, lastUser: user });
      await bindLocalUserDb('user-a').kv.put({ key: 'k', value: 'v' });
      queryClient.setQueryData(['thing', 'a'], { owner: 'user-a' });
      await pauseMutation('user-a');

      await teardownUserState(wipe);

      // Nothing of the account stays in the query client, whichever way it left.
      expect(queryClient.getQueryCache().getAll()).toEqual([]);
      expect(queryClient.getMutationCache().getAll()).toEqual([]);
      expect(useUserStore.getState().user).toBeNull();
      // A hard sign-out deletes the database and the identity hint; a lost session keeps both for the same user's next sign-in.
      expect(await Dexie.exists(dbName('user-a'))).toBe(!wipe);
      expect(useUserStore.getState().lastUser).toEqual(wipe ? null : user);
      if (wipe) expect(getLocalUserDb()).toBeNull();

      // The next account signs in in this tab and the provider resumes what is paused: only its own edit is sent.
      bindLocalUserDb('user-b');
      await pauseMutation('user-b');
      onlineManager.setOnline(true);
      await queryClient.resumePausedMutations();
      expect(sent).toEqual(['user-b']);
    },
  );
});
