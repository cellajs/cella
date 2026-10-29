import 'fake-indexeddb/auto';
import '~/query/tests/query-client-env';
import { MutationObserver, onlineManager } from '@tanstack/react-query';
import { Dexie } from 'dexie';
import { appConfig } from 'shared';
import { afterEach, describe, expect, it, vi } from 'vitest';

// A window that delivers events, so another tab's write to `localStorage` reaches this tab as the browser sends it.
const reload = vi.fn();
vi.stubGlobal('window', Object.assign(new EventTarget(), { location: { reload }, setTimeout: window.setTimeout }));

const { userStore, userStorageKey } = await import('~/modules/user/user-store');
const { getLocalUserDb } = await import('~/query/local-user-db');
const { queryClient } = await import('~/query/query-client');
await import('~/query/local-user-storage');

const dbName = (owner: string) => `${appConfig.slug}:${owner}`;
const admin = { id: 'admin-1', email: 'admin@example.test' };
const target = { id: 'user-1', email: 'user@example.test' };
const adminRef = { id: admin.id, name: 'Ada Admin', slug: 'ada', thumbnailUrl: null, entityType: 'user' as const };

/** The `storage` event another tab's sign-in, sign-out or profile edit fires here, carrying the user it stored. */
const storeInAnotherTab = (user: { id: string; email: string } | null) =>
  window.dispatchEvent(
    Object.assign(new Event('storage'), { key: userStorageKey, newValue: JSON.stringify({ state: { user, lastUser: user }, version: 1 }) }),
  );

afterEach(async () => {
  queryClient.clear();
  onlineManager.setOnline(true);
  reload.mockClear();
  userStore.getState().reset();
  for (const owner of [admin.id, target.id]) await Dexie.delete(dbName(owner));
});

describe('the per-user database follows who is signed in', () => {
  it('must not store an impersonated user’s data on the admin’s device: no database is bound, and the admin’s returns after', async () => {
    userStore.setState({ user: admin as never, impersonator: null });
    expect(getLocalUserDb()?.name).toBe(dbName(admin.id));

    // `/me` names the user and the admin behind them in one write: the admin's database closes, none opens for the user.
    userStore.setState({ user: target as never, impersonator: adminRef });
    expect(getLocalUserDb()).toBeNull();
    expect(await Dexie.exists(dbName(target.id))).toBe(false);

    // The impersonation ended: one write again, straight back to the admin's own database.
    userStore.setState({ user: admin as never, impersonator: null });
    expect(getLocalUserDb()?.name).toBe(dbName(admin.id));
    expect(await Dexie.exists(dbName(target.id))).toBe(false);
  });

  it('must not replay a paused write under the session of a user who signed in in another tab', async () => {
    userStore.setState({ user: target as never, impersonator: null });
    const sent: string[] = [];
    onlineManager.setOnline(false);
    const edit = new MutationObserver(queryClient, {
      mutationKey: ['thing', 'update'],
      retryDelay: 0,
      mutationFn: async () => {
        if (!onlineManager.isOnline()) throw new TypeError('Failed to fetch');
        sent.push(target.id);
      },
    });
    // The edit never settles: the tab drops it pending.
    edit.mutate().catch(() => {});
    const paused = () =>
      queryClient
        .getMutationCache()
        .getAll()
        .filter((mutation) => mutation.state.isPaused);
    await vi.waitFor(() => expect(paused()).toHaveLength(1));

    // The same user's profile edit, saved in another tab, leaves the tab and its queue alone.
    storeInAnotherTab({ ...target, email: 'renamed@example.test' });
    expect(paused()).toHaveLength(1);
    expect(getLocalUserDb()?.name).toBe(dbName(target.id));
    expect(reload).not.toHaveBeenCalled();

    // Another user signs in elsewhere: the queue is gone within the event, before any focus or online event resumes it.
    storeInAnotherTab(admin);
    expect(queryClient.getMutationCache().getAll()).toEqual([]);
    onlineManager.setOnline(true);
    await queryClient.resumePausedMutations();
    expect(sent).toEqual([]);

    // The database closes, kept on disk for its user's next session, and the tab boots again as whoever is signed in.
    await vi.waitFor(() => expect(reload).toHaveBeenCalledOnce());
    expect(getLocalUserDb()).toBeNull();
    expect(await Dexie.exists(dbName(target.id))).toBe(true);
  });
});
