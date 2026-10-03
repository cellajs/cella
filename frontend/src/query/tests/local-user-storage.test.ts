import 'fake-indexeddb/auto';
import '~/query/tests/query-client-env';
import { Dexie } from 'dexie';
import { appConfig } from 'shared';
import { afterEach, describe, expect, it } from 'vitest';

const { useUserStore } = await import('~/modules/user/user-store');
const { getLocalUserDb } = await import('~/query/local-user-db');
await import('~/query/local-user-storage');

const dbName = (owner: string) => `${appConfig.slug}:${owner}`;
const admin = { id: 'admin-1', email: 'admin@example.test' };
const target = { id: 'user-1', email: 'user@example.test' };
const adminRef = { id: admin.id, name: 'Ada Admin', slug: 'ada', thumbnailUrl: null, entityType: 'user' as const };

afterEach(async () => {
  useUserStore.getState().reset();
  for (const owner of [admin.id, target.id]) await Dexie.delete(dbName(owner));
});

describe('the per-user database follows who is signed in', () => {
  it('must not store an impersonated user’s data on the admin’s device: no database is bound, and the admin’s returns after', async () => {
    useUserStore.setState({ user: admin as never, impersonator: null });
    expect(getLocalUserDb()?.name).toBe(dbName(admin.id));

    // `/me` names the user and the admin behind them in one write: the admin's database closes, none opens for the user.
    useUserStore.setState({ user: target as never, impersonator: adminRef });
    expect(getLocalUserDb()).toBeNull();
    expect(await Dexie.exists(dbName(target.id))).toBe(false);

    // The impersonation ended: one write again, straight back to the admin's own database.
    useUserStore.setState({ user: admin as never, impersonator: null });
    expect(getLocalUserDb()?.name).toBe(dbName(admin.id));
    expect(await Dexie.exists(dbName(target.id))).toBe(false);
  });
});
