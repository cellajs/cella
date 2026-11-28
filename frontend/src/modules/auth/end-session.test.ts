import 'fake-indexeddb/auto';
import { MutationObserver, onlineManager } from '@tanstack/react-query';
import { Dexie } from 'dexie';
import { appConfig } from 'shared';
import { afterEach, describe, expect, it, vi } from 'vitest';
import * as Y from 'yjs';
import { stubLocalStorage } from '~/query/tests/query-client-env';

const server = vi.hoisted(() => ({ signOut: vi.fn(async () => {}) }));
/** The layout of the page on screen, as the router's matches name it. */
const page = vi.hoisted(() => ({ boundary: 'app' }));

vi.mock('sdk', async (importOriginal) => ({ ...(await importOriginal<object>()), signOut: server.signOut }));
vi.mock('~/modules/notification/use-push-subscription', () => ({ disablePushSubscription: async () => {} }));
vi.mock('~/routes/-router-instance', () => ({ getRouter: () => ({ state: { matches: [{ staticData: { boundary: page.boundary } }] } }) }));

stubLocalStorage();
const leave = { origin: 'https://app.example', reload: vi.fn(), assign: vi.fn() };
Object.assign(window, { location: leave });

const { queryClient } = await import('~/query/query-client');
const { bindLocalUserDb, closeLocalUserDb, getLocalUserDb } = await import('~/query/local-user-db');
const { storedUserIds, userStorageKey, userStore } = await import('~/modules/user/user-store');
await import('~/query/local-user-storage');
const { endSession, sweepForgottenUserDbs } = await import('~/modules/auth/end-session');
const { createYDocWriter } = await import('~/modules/common/blocknote/yjs-store');

const dbName = (owner: string) => `${appConfig.slug}:${owner}`;
const person = { id: 'user-a', email: 'a@example.test', isAnonymous: false };
const anonymous = { id: 'user-a', email: null, isAnonymous: true };
const other = { id: 'user-b', email: 'b@example.test', isAnonymous: false };

/** An edit of the account that failed offline and waits, paused, for the connection: the state the persisted queue restores. */
async function pauseMutation(): Promise<void> {
  onlineManager.setOnline(false);
  const observer = new MutationObserver(queryClient, {
    mutationKey: ['thing', 'update'],
    retryDelay: 0,
    mutationFn: async () => {
      if (!onlineManager.isOnline()) throw new TypeError('Failed to fetch');
    },
  });
  // Stays pending while paused; guarded, since the end drops the mutation without settling it.
  observer.mutate().catch(() => {});
  await vi.waitFor(() => expect(queryClient.getMutationCache().getAll()[0]?.state.isPaused).toBe(true));
}

afterEach(async () => {
  userStore.getState().reset();
  queryClient.clear();
  onlineManager.setOnline(true);
  closeLocalUserDb();
  vi.clearAllMocks();
  for (const owner of [person.id, other.id]) await Dexie.delete(dbName(owner));
});

// The table in cella/docs/CLIENT.md, "Ending a session": one row per reason, and per page or account where the row differs.
const signedOut = { userId: null, lastUserId: null };
const lapsed = { userId: null, lastUserId: person.id };
const table = [
  { reason: 'sign-out', user: person, on: 'app', server: true, kept: false, hint: signedOut, load: '/a/page' },
  { reason: 'lost', user: person, on: 'app', server: false, kept: true, hint: lapsed, load: '/auth/authenticate?redirect=%2Fa%2Fpage' },
  { reason: 'lost', user: person, on: 'public', server: false, kept: true, hint: lapsed, load: 'here' },
  { reason: 'lost', user: anonymous, on: 'app', server: false, kept: false, hint: signedOut, load: '/about' },
  { reason: 'elsewhere', user: person, on: 'app', server: false, kept: true, hint: { userId: other.id, lastUserId: other.id }, load: 'here' },
  { reason: 'expired', user: anonymous, on: 'public', server: false, kept: false, hint: signedOut, load: null },
  { reason: 'replaced', user: person, on: 'app', server: false, kept: true, hint: lapsed, load: 'here' },
] as const;

describe('endSession', () => {
  it.each(table)("must not carry the account's cache or queued edits past the end: $reason, $user.isAnonymous anonymous, on $on", async (row) => {
    page.boundary = row.on;
    userStore.setState({ user: row.user as never, lastUser: row.user });
    await getLocalUserDb()?.kv.put({ key: 'k', value: 'v' });
    queryClient.setQueryData(['thing', 'a'], { owner: row.user.id });
    await pauseMutation();
    // `elsewhere`: another tab signed another user in, and the browser told this tab.
    if (row.reason === 'elsewhere') localStorage.setItem(userStorageKey, JSON.stringify({ state: { user: other, lastUser: other }, version: 2 }));

    await endSession(row.reason, { redirect: '/a/page' });

    expect(queryClient.getQueryCache().getAll()).toEqual([]);
    expect(queryClient.getMutationCache().getAll()).toEqual([]);
    expect(getLocalUserDb()).toBeNull();
    expect(server.signOut).toHaveBeenCalledTimes(row.server ? 1 : 0);
    expect(await Dexie.exists(dbName(row.user.id))).toBe(row.kept);
    expect(storedUserIds()).toEqual(row.hint);
    expect(leave.reload).toHaveBeenCalledTimes(row.load === 'here' ? 1 : 0);
    expect(leave.assign.mock.calls).toEqual(row.load && row.load !== 'here' ? [[row.load]] : []);
  });

  it('must leave no database of a user this browser has forgotten: the signed-in and the last user keep theirs', async () => {
    userStore.setState({ user: null, lastUser: person });
    for (const owner of [person.id, other.id]) {
      await bindLocalUserDb(owner).kv.put({ key: 'k', value: 'v' });
      closeLocalUserDb();
    }

    await sweepForgottenUserDbs();

    expect(await Dexie.exists(dbName(person.id))).toBe(true);
    expect(await Dexie.exists(dbName(other.id))).toBe(false);
  });

  it("must not lose a collaborative edit still queued at a lost session: it is stored first, unsynced, for the user's next one", async () => {
    userStore.setState({ user: person as never, lastUser: person });
    const doc = new Y.Doc();
    const writer = createYDocWriter({ entityType: 'attachment', entityId: 'doc-1', tenantId: 'tenant-1', organizationId: 'org-1' }, doc, 'gen-1');
    doc.on('update', (update: Uint8Array) => writer?.append(update, true));
    doc.getText('t').insert(0, 'typed just before the session ended');

    await endSession('lost');

    const record = await bindLocalUserDb(person.id).yDocs.get(['attachment', 'doc-1']);
    expect(record?.unsynced).toBe(1);
  });
});
