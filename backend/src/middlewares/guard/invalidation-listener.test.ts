import { sql } from 'drizzle-orm';
import pg from 'pg';
import { testDatabaseUrl } from 'shared/test-db';
import { generateId } from 'shared/utils/entity-id';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { baseDb, getAdminDb } from '#/db/db';
import { endSessions } from '#/modules/auth/general/helpers/end-sessions';
import type { MembershipCacheEntry } from './auth-cache';
import {
  getMembershipCache,
  getSessionCache,
  getTokenUserCache,
  setMembershipCache,
  setSessionCache,
  setTokenUserCache,
} from './auth-cache';
import { invalidateCache } from './invalidate-cache';
import { listenForAuthInvalidation } from './invalidation-listener';
import { getOrgCache, setOrgCache } from './org-cache';
import { getTenantCache, setTenantCache } from './tenant-cache';

const adminDb = getAdminDb('test publish');

/** A message from another process: published on another connection, so only the LISTEN path can drop this one's entries. */
const publishElsewhere = (payload: unknown) =>
  adminDb.execute(
    sql`select pg_notify('auth_invalidate', ${typeof payload === 'string' ? payload : JSON.stringify(payload)})`,
  );

/** Caches a session, memberships and the token user for a user, as the guards do on a request. */
const cacheUser = (userId: string) => {
  // The caches hold what the guards hand them; a stub with the id is enough to find and drop the entries.
  const user = { id: userId } as never;
  setSessionCache(`${userId}-session`, userId, { user, hasSystemRole: false });
  setMembershipCache(userId, [] as MembershipCacheEntry);
  setTokenUserCache(user);
};
const cachedFor = (userId: string) => ({
  session: !!getSessionCache(`${userId}-session`),
  memberships: !!getMembershipCache(userId),
  tokenUser: !!getTokenUserCache(userId),
});

/**
 * Each process (api, mcp, oauth) holds its own guard caches. A change made in one process must drop the entry in the
 * others, or MCP keeps a removed membership for up to 6 minutes and a deleted user's token user for a minute.
 */
describe('auth_invalidate listener', () => {
  let stop: () => Promise<void>;

  beforeAll(async () => {
    stop = listenForAuthInvalidation();
    // Ready once a message round-trips; connecting clears every cache, so arrange only after this.
    cacheUser('probe');
    await vi.waitFor(
      async () => {
        await publishElsewhere({ user: 'probe' });
        expect(cachedFor('probe').session).toBe(false);
      },
      { timeout: 5000 },
    );
  });

  afterAll(async () => await stop());

  it("must not keep a user's cached session, memberships or token user after another process invalidates them", async () => {
    cacheUser('ended');
    cacheUser('bystander');

    await publishElsewhere({ user: 'ended' });

    await vi.waitFor(() =>
      expect(cachedFor('ended')).toEqual({ session: false, memberships: false, tokenUser: false }),
    );
    expect(cachedFor('bystander')).toEqual({ session: true, memberships: true, tokenUser: true });
  });

  it('must not keep a cached tenant, its organizations or one organization after another process invalidates them', async () => {
    const org = { id: 'org-1' } as Parameters<typeof setOrgCache>[2];
    setTenantCache('tenant-a', { id: 'tenant-a' } as Parameters<typeof setTenantCache>[1]);
    setOrgCache('tenant-a', 'org-1', org);
    setOrgCache('tenant-b', 'org-2', org);
    setOrgCache('tenant-b', 'org-3', org);

    await publishElsewhere({ tenant: 'tenant-a' });
    await publishElsewhere({ org: { tenantId: 'tenant-b', orgId: 'org-2' } });

    await vi.waitFor(() => expect(getOrgCache('tenant-b', 'org-2')).toBeUndefined());
    expect(getTenantCache('tenant-a')).toBeUndefined();
    expect(getOrgCache('tenant-a', 'org-1')).toBeUndefined();
    expect(getOrgCache('tenant-b', 'org-3')).toBeDefined();
  });

  it('ignores a malformed message and keeps listening', async () => {
    cacheUser('kept');
    cacheUser('next');

    await publishElsewhere('not json');
    await publishElsewhere({ user: 42 });
    await publishElsewhere({ user: 'next' });

    await vi.waitFor(() => expect(cachedFor('next').session).toBe(false));
    expect(cachedFor('kept')).toEqual({ session: true, memberships: true, tokenUser: true });
  });

  it('must not keep an entry cached while the listening connection was down via the missed messages', async () => {
    // The listening connection's last statement is always its LISTEN, which also serves as its heartbeat.
    await adminDb.execute(
      sql`select pg_terminate_backend(pid) from pg_stat_activity where query = 'LISTEN auth_invalidate' and pid <> pg_backend_pid()`,
    );
    // Cached in the gap: whatever invalidation it missed is gone, so the reconnect drops it.
    cacheUser('in-gap');

    await vi.waitFor(() => expect(cachedFor('in-gap').session).toBe(false), { timeout: 10_000, interval: 100 });

    // Listening again.
    cacheUser('after');
    await vi.waitFor(async () => {
      await publishElsewhere({ user: 'after' });
      expect(cachedFor('after').session).toBe(false);
    });
  });
});

describe('invalidateCache and endSessions publish to every process', () => {
  const listener = new pg.Client({ connectionString: testDatabaseUrl });
  const received: string[] = [];

  beforeAll(async () => {
    await listener.connect();
    listener.on('notification', (message) => {
      if (message.channel === 'auth_invalidate' && message.payload) received.push(message.payload);
    });
    await listener.query('LISTEN auth_invalidate');
  });

  afterAll(async () => await listener.end());

  it('drops the entry here and tells the other processes', async () => {
    cacheUser('changed');

    invalidateCache.user('changed');
    invalidateCache.org('tenant-c', 'org-4');
    invalidateCache.tenant('tenant-d');

    expect(cachedFor('changed')).toEqual({ session: false, memberships: false, tokenUser: false });
    await vi.waitFor(() =>
      expect(received.map((payload) => JSON.parse(payload))).toEqual(
        expect.arrayContaining([
          { user: 'changed' },
          { org: { tenantId: 'tenant-c', orgId: 'org-4' } },
          { tenant: 'tenant-d' },
        ]),
      ),
    );
  });

  it('announces an ending of sessions to the other processes only once it commits', async () => {
    const [rolledBack, committed] = [generateId(), generateId()];
    const ending = (userId: string) => ({ userId, all: true as const, reason: 'user_deleted' as const, by: null });

    await baseDb
      .transaction(async (tx) => {
        await endSessions({ var: { db: tx } }, ending(rolledBack));
        throw new Error('roll back');
      })
      .catch(() => {});
    await endSessions({ var: { db: baseDb } }, ending(committed));

    await vi.waitFor(() => expect(received).toContain(JSON.stringify({ user: committed })));
    expect(received).not.toContain(JSON.stringify({ user: rolledBack }));
  });
});
