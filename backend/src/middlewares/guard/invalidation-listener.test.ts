import { sql } from 'drizzle-orm';
import pg, { type Pool, type PoolClient } from 'pg';
import { testDatabaseUrl } from 'shared/test-db';
import { generateId } from 'shared/utils/entity-id';
import { afterAll, beforeAll, describe, expect, it, onTestFinished, vi } from 'vitest';
import { baseDb, getAdminDb } from '#/db/db';
import { activityBus } from '#/lib/activity-bus';
import { endSessions } from '#/modules/auth/general/helpers/end-sessions';
import { clientCache } from '#/modules/oauth-server/client-cache';
import type { VerifiedAccessToken } from '#/modules/oauth-server/verify-access-token';
import { getApiKeyCache, setApiKeyCache } from './api-key-cache';
import type { MembershipCacheEntry } from './auth-cache';
import { getMembershipCache, getSessionCache, setMembershipCache, setSessionCache } from './auth-cache';
import { invalidateCache } from './invalidate-cache';
import { listenForAuthInvalidation } from './invalidation-listener';
import { getOrgCache, setOrgCache } from './org-cache';
import { getTenantCache, setTenantCache } from './tenant-cache';
import { getTokenGrantCache, setTokenGrantCache } from './token-grant-cache';

const adminDb = getAdminDb('test publish');

/** A message from another process: published on another connection, so only the LISTEN path can drop this one's entries. */
const publishElsewhere = (payload: unknown) =>
  adminDb.execute(
    sql`select pg_notify('auth_invalidate', ${typeof payload === 'string' ? payload : JSON.stringify(payload)})`,
  );

/** A person's access token as the guard verified it: under a grant, for one tenant, from one client. */
const userToken = (
  actorId: string,
  grantId = 'grant',
  tenantId = 'tenant',
  clientId = 'client',
): VerifiedAccessToken => ({
  kind: 'user',
  actorId,
  grantId,
  tenantId,
  clientId,
  scopes: [],
});
/** A service account's access token, minted with one of its API keys. */
const serviceToken = (accountId: string, keyId: string): VerifiedAccessToken => ({
  kind: 'service',
  actorId: accountId,
  keyId,
  tenantId: 'tenant',
  clientId: accountId,
  scopes: [],
});
// The caches hold what the guards hand them; a stub with the id is enough to find and drop the entries.
const cacheVerdict = (token: VerifiedAccessToken) =>
  setTokenGrantCache(token, { refusal: null, kind: 'user', user: { id: token.actorId } as never });

/** Caches a session, memberships and an access-token verdict for a user, as the guards do on a request. */
const cacheUser = (userId: string) => {
  const user = { id: userId } as never;
  setSessionCache(`${userId}-session`, { session: { id: `${userId}-session` } as never, user, hasSystemRole: false });
  setMembershipCache(userId, [] as MembershipCacheEntry);
  cacheVerdict(userToken(userId));
};
const cachedFor = (userId: string) => ({
  session: !!getSessionCache(`${userId}-session`),
  memberships: !!getMembershipCache(userId),
  tokenGrant: !!getTokenGrantCache(userToken(userId)),
});

/** Caches a service account's API key and client, and a verdict on a token minted with the key. */
const cacheServiceAccount = (accountId: string) => {
  setApiKeyCache(`${accountId}-hash`, {
    apiKey: { id: `${accountId}-key` } as never,
    account: { id: accountId } as never,
  });
  clientCache.set(accountId, { client_id: accountId, client_kind: 'service' });
  cacheVerdict(serviceToken(accountId, `${accountId}-key`));
};
const cachedForAccount = (accountId: string) => ({
  apiKey: !!getApiKeyCache(`${accountId}-hash`),
  client: !!clientCache.get(accountId),
  tokenGrant: !!getTokenGrantCache(serviceToken(accountId, `${accountId}-key`)),
});

/**
 * Each process (api, mcp, oauth) holds its own guard caches. A change made in one process must drop the entry in the
 * others, or MCP keeps a removed membership for up to 6 minutes and a deleted user's access-token verdicts for half a minute.
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

  it("must not keep a user's cached session, memberships or access-token verdicts after another process invalidates them", async () => {
    cacheUser('ended');
    cacheUser('bystander');

    await publishElsewhere({ user: 'ended' });

    await vi.waitFor(() =>
      expect(cachedFor('ended')).toEqual({ session: false, memberships: false, tokenGrant: false }),
    );
    expect(cachedFor('bystander')).toEqual({ session: true, memberships: true, tokenGrant: true });
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

  it("must not keep verdicts on a grant's tokens after another process deletes the grant", async () => {
    const [revoked, kept] = [userToken('holder', 'revoked-grant'), userToken('holder', 'kept-grant')];
    cacheVerdict(revoked);
    cacheVerdict(kept);

    await publishElsewhere({ grant: { accountId: 'holder', grantId: 'revoked-grant' } });

    await vi.waitFor(() => expect(getTokenGrantCache(revoked)).toBeUndefined());
    expect(getTokenGrantCache(kept)).toBeDefined();
  });

  it("must not keep verdicts on a tenant's tokens after another process changes its policy or an installation", async () => {
    const inChangedTenant = userToken('member', 'grant-a', 'tenant-policy');
    const installedApp = userToken('member', 'grant-b', 'tenant-apps', 'portfolio');
    const otherClient = userToken('member', 'grant-c', 'tenant-apps', 'https://client.example/metadata.json');
    const otherTenant = userToken('member', 'grant-d', 'tenant-other');
    for (const token of [inChangedTenant, installedApp, otherClient, otherTenant]) cacheVerdict(token);

    await publishElsewhere({ tenant: 'tenant-policy' });
    await publishElsewhere({ installation: { tenantId: 'tenant-apps', clientId: 'portfolio' } });

    await vi.waitFor(() => expect(getTokenGrantCache(installedApp)).toBeUndefined());
    expect(getTokenGrantCache(inChangedTenant)).toBeUndefined();
    expect(getTokenGrantCache(otherClient)).toBeDefined();
    expect(getTokenGrantCache(otherTenant)).toBeDefined();
  });

  it("must not keep a service account's API keys, client or token verdicts after another process changes it", async () => {
    cacheServiceAccount('changed-account');
    cacheServiceAccount('other-account');

    await publishElsewhere({ serviceAccount: 'changed-account' });

    await vi.waitFor(() => expect(cachedForAccount('changed-account').apiKey).toBe(false));
    expect(cachedForAccount('changed-account')).toEqual({ apiKey: false, client: false, tokenGrant: false });
    expect(cachedForAccount('other-account')).toEqual({ apiKey: true, client: true, tokenGrant: true });
  });

  it('ignores a malformed message and keeps listening', async () => {
    cacheUser('kept');
    cacheUser('next');

    await publishElsewhere('not json');
    await publishElsewhere({ user: 42 });
    await publishElsewhere({ user: 'next' });

    await vi.waitFor(() => expect(cachedFor('next').session).toBe(false));
    expect(cachedFor('kept')).toEqual({ session: true, memberships: true, tokenGrant: true });
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

  it("must not keep a service account's cached key or client while the listening connection was down", async () => {
    await adminDb.execute(
      sql`select pg_terminate_backend(pid) from pg_stat_activity where query = 'LISTEN auth_invalidate' and pid <> pg_backend_pid()`,
    );
    cacheServiceAccount('in-gap-account');

    await vi.waitFor(() => expect(cachedForAccount('in-gap-account').apiKey).toBe(false), {
      timeout: 10_000,
      interval: 100,
    });
    expect(cachedForAccount('in-gap-account')).toEqual({ apiKey: false, client: false, tokenGrant: false });
  });
});

/**
 * A connection can die with no socket error (a dropped route, a host that vanished): its LISTEN hears nothing and no
 * event says so. Only the heartbeat can notice, and only when an unanswered heartbeat counts as a lost connection.
 */
describe('auth_invalidate listener on a connection that stops answering', () => {
  const pool = baseDb.$client as Pool;

  it('must not keep an entry cached via a listening connection that silently stopped answering', async () => {
    const connections: PoolClient[] = [];
    const connect = pool.connect.bind(pool);
    const connectSpy = vi.spyOn(pool, 'connect').mockImplementation(async () => {
      const connection = await connect();
      connections.push(connection);
      return connection;
    });
    const stop = listenForAuthInvalidation({ heartbeatMs: 200, heartbeatTimeoutMs: 500 });
    onTestFinished(async () => {
      await stop();
      connectSpy.mockRestore();
    });

    cacheUser('probe-silent');
    await vi.waitFor(async () => {
      await publishElsewhere({ user: 'probe-silent' });
      expect(cachedFor('probe-silent').session).toBe(false);
    });

    // From now on nothing the listening connection sends gets an answer, as when its packets stop arriving.
    const silent = connections.at(-1);
    if (!silent) throw new Error('The listener took no connection');
    vi.spyOn(silent, 'query').mockImplementation(() => new Promise(() => {}));
    // Cached while nothing reaches this process: whatever invalidation it missed is gone, so the reconnect drops it.
    cacheUser('while-silent');

    await vi.waitFor(() => expect(cachedFor('while-silent').session).toBe(false), { timeout: 8000, interval: 100 });
    expect(connections.length).toBeGreaterThan(1);

    // Listening again, on a new connection.
    cacheUser('after-silent');
    await vi.waitFor(async () => {
      await publishElsewhere({ user: 'after-silent' });
      expect(cachedFor('after-silent').session).toBe(false);
    });
  });

  it('must not stay deaf via a first LISTEN that never gets an answer', async () => {
    const connections: PoolClient[] = [];
    const connect = pool.connect.bind(pool);
    const connectSpy = vi.spyOn(pool, 'connect').mockImplementation(async () => {
      const connection = await connect();
      // The first connection never answers, as when the database stalls right after accepting it.
      if (connections.length === 0) vi.spyOn(connection, 'query').mockImplementation(() => new Promise(() => {}));
      connections.push(connection);
      return connection;
    });
    const stop = listenForAuthInvalidation({ heartbeatMs: 200, heartbeatTimeoutMs: 500 });
    onTestFinished(async () => {
      await stop();
      connectSpy.mockRestore();
    });

    // Listening, on a second connection.
    cacheUser('after-stalled-listen');
    await vi.waitFor(
      async () => {
        await publishElsewhere({ user: 'after-stalled-listen' });
        expect(cachedFor('after-stalled-listen').session).toBe(false);
      },
      { timeout: 8000, interval: 100 },
    );
    expect(connections.length).toBeGreaterThan(1);
  });

  it('keeps TCP keepalive on the pooled connections it listens on', () => {
    expect(pool.options).toMatchObject({ keepAlive: true });
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
    cacheServiceAccount('account-e');
    const installedApp = userToken('member-f', 'grant-f', 'tenant-f', 'portfolio');
    cacheVerdict(installedApp);

    invalidateCache.user('changed');
    invalidateCache.org('tenant-c', 'org-4');
    invalidateCache.tenant('tenant-d');
    invalidateCache.serviceAccount('account-e');
    invalidateCache.installation('tenant-f', 'portfolio');

    expect(cachedFor('changed')).toEqual({ session: false, memberships: false, tokenGrant: false });
    expect(cachedForAccount('account-e')).toEqual({ apiKey: false, client: false, tokenGrant: false });
    expect(getTokenGrantCache(installedApp)).toBeUndefined();
    await vi.waitFor(() =>
      expect(received.map((payload) => JSON.parse(payload))).toEqual(
        expect.arrayContaining([
          { user: 'changed' },
          { org: { tenantId: 'tenant-c', orgId: 'org-4' } },
          { tenant: 'tenant-d' },
          { serviceAccount: 'account-e' },
          { installation: { tenantId: 'tenant-f', clientId: 'portfolio' } },
        ]),
      ),
    );
  });

  it("must not keep a user's system role in any process via the cache once CDC reports it changed", async () => {
    // system_roles is written outside the API; the change arrives as a CDC event on the activity bus.
    await import('#/modules/system/system-listeners');
    cacheUser('demoted');
    cacheUser('bystander-admin');

    activityBus.emit({
      id: generateId(),
      type: 'system_role.deleted',
      action: 'delete',
      resourceType: 'system_role',
      entityType: null,
      rowData: { userId: 'demoted', role: 'admin' },
    } as never);

    expect(cachedFor('demoted')).toEqual({ session: false, memberships: false, tokenGrant: false });
    expect(cachedFor('bystander-admin').session).toBe(true);
    await vi.waitFor(() => expect(received).toContain(JSON.stringify({ user: 'demoted' })));
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
