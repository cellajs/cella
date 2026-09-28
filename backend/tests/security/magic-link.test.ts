import { eq } from 'drizzle-orm';
import { PgAsyncDatabase, type PgTable } from 'drizzle-orm/pg-core';
import { nanoid } from 'nanoid';
import { confirmMagicLink, getPendingMagicLink, invokeToken, sendMagicLink } from 'sdk';
import { appConfig } from 'shared';
import { afterEach, beforeAll, describe, expect, it, onTestFinished, vi } from 'vitest';
import { baseDb as db } from '#/db/db';
import { actorsTable } from '#/modules/actors/actors-db';
import { sessionsTable } from '#/modules/auth/sessions-db';
import { tokensTable } from '#/modules/auth/tokens-db';
import { inactiveMembershipsTable } from '#/modules/memberships/inactive-memberships-db';
import { emailsTable } from '#/modules/user/emails-db';
import { usersTable } from '#/modules/user/user-db';
import { hashToken } from '#/utils/hash-token';
import { defaultHeaders } from '../fixtures';
import {
  authCookie,
  cookieChange,
  createTestOrganization,
  createTestSession,
  createTestUser,
  expectRefusal,
  insertTestSession,
  insertTestToken,
  mailedLink,
  setCookiePair,
  tokenRow,
} from '../helpers';
import { createInvitation } from '../invitations/helpers';
import { createAppClient } from '../test-client';
import { setTestConfig } from '../test-utils';
import { clearSecurityTestData } from './helpers';

setTestConfig({ enabledAuthStrategies: ['magic', 'passkey'] });

/**
 * The next read from `table` fails, as a statement does when the pool cannot hand out a connection; reads from other
 * tables run as usual. Every `db.select(...)` builder is wrapped until the failing `from` fires.
 */
const failNextReadOf = (table: PgTable) => {
  const prototype = PgAsyncDatabase.prototype;
  // The `select` overloads (with and without fields) share one runtime shape: the mock forwards whatever it gets.
  const original = prototype.select as (
    this: typeof prototype,
    fields?: unknown,
  ) => { from: (source: unknown) => unknown };
  const spy = vi.spyOn(prototype, 'select').mockImplementation(function (this: typeof prototype, fields?: unknown) {
    const builder = original.call(this, fields);
    const from = builder.from.bind(builder);
    builder.from = (source) => {
      if (source !== table) return from(source);
      spy.mockRestore();
      throw new Error('timeout exceeded when trying to connect');
    };
    return builder as never;
  });
  onTestFinished(() => spy.mockRestore());
};

/** A magic link row for `user`, optionally already opened with a single-use token (hash at rest). */
const magicLink = (user: { id: string; email: string }, opened?: { singleUse: string }) =>
  insertTestToken('magic', user, { expiresInMs: 5 * 60 * 1000, openedWith: opened?.singleUse });

/**
 * A magic link signs in whoever opens it, so it must not be replayable: an opened link stays usable only in the
 * browser that opened it, proven by its own single-use cookie, not by any cookie of the same name.
 */
describe('magic link replay', async () => {
  const call = await createAppClient();

  afterEach(async () => await clearSecurityTestData());

  it("must not replay an opened magic link via another link's single-use cookie", async () => {
    const victim = await createTestUser(`magic-victim-${nanoid(6)}@security-test.com`.toLowerCase());
    const { raw } = await magicLink(victim, { singleUse: nanoid(40) });

    // The attacker's own opened link hands them a validly signed `magic` cookie with another value.
    const { error, response } = await call(invokeToken, {
      path: { type: 'magic', token: raw },
      headers: { ...defaultHeaders, Cookie: authCookie('magic', nanoid(40)) },
    });
    await expectRefusal({ response, error }, 401, 'magic_opened');
    expect(cookieChange(response, 'session')).toBeUndefined();
  });

  it('tells a second click from the mail client that the link was opened, not that it expired', async () => {
    const user = await createTestUser(`double-click-${nanoid(6)}@security-test.com`.toLowerCase());
    const { raw, row } = await magicLink(user);
    // A click in a mail client is a navigation from another site: only the Lax request marker comes along.
    const click = () =>
      call(invokeToken, {
        path: { type: 'magic', token: raw },
        headers: { ...defaultHeaders, Cookie: authCookie('magic-requested', row.id) },
      });

    const first = await click();
    expect(first.response.status).toBe(302);
    expect(cookieChange(first.response, 'session')).toBe('set');

    const second = await click();
    await expectRefusal(second, 401, 'magic_opened');
    expect(second.error).toMatchObject({ severity: 'info' });
    expect(cookieChange(second.response, 'session')).toBeUndefined();

    // Two clicks at once: one signs in, the other hears the same.
    const next = await magicLink(user);
    const overlapping = await Promise.all(
      [0, 1].map(() =>
        call(invokeToken, {
          path: { type: 'magic', token: next.raw },
          headers: { ...defaultHeaders, Cookie: authCookie('magic-requested', next.row.id) },
        }),
      ),
    );
    expect(overlapping.map(({ response }) => response.status).sort()).toEqual([302, 401]);
    expect(overlapping.find(({ response }) => response.status === 401)?.error).toMatchObject({ type: 'magic_opened' });
  });

  it('still refuses an opened link past its window as expired', async () => {
    const user = await createTestUser(`window-${nanoid(6)}@security-test.com`.toLowerCase());
    const { raw, row } = await magicLink(user, { singleUse: nanoid(40) });
    await db
      .update(tokensTable)
      .set({ expiresAt: new Date(Date.now() - 1000).toISOString() })
      .where(eq(tokensTable.id, row.id));

    const { error, response } = await call(invokeToken, {
      path: { type: 'magic', token: raw },
      headers: defaultHeaders,
    });
    await expectRefusal({ response, error }, 401, 'magic_expired');
    expect(cookieChange(response, 'session')).toBeUndefined();
  });

  it('lets the browser that opened the link open it again (positive control)', async () => {
    const user = await createTestUser(`magic-owner-${nanoid(6)}@security-test.com`.toLowerCase());
    const singleUse = nanoid(40);
    const { raw, row } = await magicLink(user, { singleUse });

    const { response } = await call(invokeToken, {
      path: { type: 'magic', token: raw },
      headers: { ...defaultHeaders, Cookie: authCookie('magic', singleUse) },
    });
    expect(response.status).toBe(302);
    expect(cookieChange(response, 'session')).toBe('set');
    expect(response.headers.get('location')?.startsWith(appConfig.frontendUrl)).toBe(true);
    expect((await tokenRow(row.id)).invokedAt).not.toBeNull();
  });
});

/**
 * Opening a magic link signs in directly only in the browser that asked for it. Anywhere else the link waits for a
 * confirmation on the app's page: a link planted in someone's browser (login CSRF) or fetched by an email scanner signs
 * nobody in and is not used up, while the owner can still finish on another device with one click.
 */
describe('magic link opened in another browser', async () => {
  const call = await createAppClient();

  afterEach(async () => await clearSecurityTestData());

  const newUser = () => createTestUser(`magic-${nanoid(6)}@security-test.com`.toLowerCase());
  const openedAt = async (id: string) => (await tokenRow(id))?.invokedAt ?? null;
  const confirmPage = new URL('/auth/confirm-sign-in', appConfig.frontendUrl).toString();

  it('must not sign in via a magic link opened in a browser that did not ask for it', async () => {
    const user = await newUser();
    const { raw, row } = await magicLink(user);

    const { response } = await call(invokeToken, { path: { type: 'magic', token: raw }, headers: defaultHeaders });
    expect(response.status).toBe(302);
    expect(response.headers.get('location')).toBe(confirmPage);
    expect(cookieChange(response, 'session')).toBeUndefined();
    expect(cookieChange(response, 'magic-pending')).toBe('set');
    expect(await openedAt(row.id)).toBeNull();

    // A browser that asked for another link, such as its owner's own, did not ask for this one.
    const own = await magicLink(await newUser());
    const planted = await call(invokeToken, {
      path: { type: 'magic', token: raw },
      headers: { ...defaultHeaders, Cookie: authCookie('magic-requested', own.row.id) },
    });
    expect(planted.response.headers.get('location')).toBe(confirmPage);
    expect(cookieChange(planted.response, 'session')).toBeUndefined();
    expect(await openedAt(row.id)).toBeNull();
  });

  it("must not skip the confirmation via another link's single-use cookie", async () => {
    const attacker = await newUser();
    const { raw, row } = await magicLink(attacker);

    // The victim's browser opened a link of its own minutes ago, so it holds a validly signed `magic` cookie.
    const { response } = await call(invokeToken, {
      path: { type: 'magic', token: raw },
      headers: { ...defaultHeaders, Cookie: authCookie('magic', nanoid(40)) },
    });
    expect(response.status).toBe(302);
    expect(response.headers.get('location')).toBe(confirmPage);
    expect(cookieChange(response, 'session')).toBeUndefined();
    expect(await openedAt(row.id)).toBeNull();
  });

  it('must not let a link scanner use up the link', async () => {
    const user = await newUser();
    const { raw, row } = await magicLink(user);

    for (let fetchByScanner = 0; fetchByScanner < 2; fetchByScanner++) {
      const { response } = await call(invokeToken, { path: { type: 'magic', token: raw }, headers: defaultHeaders });
      expect(response.headers.get('location')).toBe(confirmPage);
    }
    expect(await openedAt(row.id)).toBeNull();

    // The owner's browser, which asked for the link, still signs in with it.
    const { response } = await call(invokeToken, {
      path: { type: 'magic', token: raw },
      headers: { ...defaultHeaders, Cookie: authCookie('magic-requested', row.id) },
    });
    expect(response.status).toBe(302);
    expect(cookieChange(response, 'session')).toBe('set');
  });

  it('must not confirm a link this browser does not hold', async () => {
    const { error, response } = await call(confirmMagicLink, { headers: defaultHeaders });
    await expectRefusal({ response, error }, 401, 'magic_expired');
    expect(cookieChange(response, 'session')).toBeUndefined();
  });

  it("must not confirm a planted link into its sender's account while signed in", async () => {
    const victim = await newUser();
    const attacker = await newUser();
    const { raw, row } = await magicLink(attacker);

    const cookies = [await createTestSession(victim), authCookie('magic-pending', raw)].join('; ');
    const { error, response } = await call(confirmMagicLink, { headers: { ...defaultHeaders, Cookie: cookies } });
    await expectRefusal({ response, error }, 409, 'user_mismatch');
    expect(await openedAt(row.id)).toBeNull();
  });

  it('shows the address and signs in after the confirmation (positive control)', async () => {
    const user = await newUser();
    const { raw, row } = await magicLink(user);

    const opened = await call(invokeToken, { path: { type: 'magic', token: raw }, headers: defaultHeaders });
    const held = setCookiePair(opened.response, 'magic-pending');
    expect(held).toBeDefined();

    const pending = await call(getPendingMagicLink, { headers: { ...defaultHeaders, Cookie: held! } });
    expect(pending.response.status).toBe(200);
    expect((pending.data as { email: string }).email).toBe(user.email);

    const confirmed = await call(confirmMagicLink, { headers: { ...defaultHeaders, Cookie: held! } });
    expect(confirmed.response.status).toBe(302);
    expect(cookieChange(confirmed.response, 'session')).toBe('set');
    expect(await openedAt(row.id)).not.toBeNull();
  });

  it('marks the requesting browser alike whether or not the address has an account', async () => {
    setTestConfig({ selfRegistration: false });
    const known = await newUser();

    for (const email of [known.email, `unknown-${nanoid(6)}@security-test.com`.toLowerCase()]) {
      const { response } = await call(sendMagicLink, { body: { email }, headers: defaultHeaders });
      expect(response.status).toBe(204);
      expect(cookieChange(response, 'magic-requested')).toBe('set');
    }
    setTestConfig({ selfRegistration: true });
  });
});

/**
 * Asking for a magic link proves nothing about the address, so it creates nothing: the account for a new address is
 * created when its link is clicked, which proves the inbox. Until then nobody holds the address.
 */
describe('magic-link sign-up', async () => {
  const call = await createAppClient();

  beforeAll(() => {
    setTestConfig({ selfRegistration: true });
  });
  afterEach(async () => await clearSecurityTestData());

  const newcomer = () => `newcomer-${nanoid(6)}@security-test.com`.toLowerCase();

  const closeRegistration = () => {
    setTestConfig({ selfRegistration: false });
    onTestFinished(() => setTestConfig({ selfRegistration: true }));
  };

  /** Requests a link for `email`: the raw token from the mailed link, and the marker cookie of the browser that asked. */
  const requestLink = async (email: string) => {
    const { response } = await call(sendMagicLink, { body: { email }, headers: defaultHeaders });
    expect(response.status).toBe(204);
    const rawToken = mailedLink('magicLinkUrl').token;
    return { rawToken, requestedHere: setCookiePair(response, 'magic-requested') };
  };

  const openLink = (rawToken: string, cookie: string) =>
    call(invokeToken, { path: { type: 'magic', token: rawToken }, headers: { ...defaultHeaders, Cookie: cookie } });

  const rowsFor = async (email: string) => ({
    users: await db.select().from(usersTable).where(eq(usersTable.email, email)),
    emails: await db.select().from(emailsTable).where(eq(emailsTable.email, email)),
  });
  const tokensFor = (email: string) => db.select().from(tokensTable).where(eq(tokensTable.email, email));
  const actorCount = async () => (await db.select({ id: actorsTable.id }).from(actorsTable)).length;

  it("must not create an account via requesting a magic link for someone else's address", async () => {
    const email = newcomer();
    const actorsBefore = await actorCount();

    await requestLink(email);

    expect(await rowsFor(email)).toEqual({ users: [], emails: [] });
    expect(await actorCount()).toBe(actorsBefore);
    expect(await tokensFor(email)).toEqual([
      expect.objectContaining({ type: 'magic', userId: null, createdBy: null, invokedAt: null }),
    ]);
  });

  it('creates the account with its address verified when the link is clicked, and signs in (positive control)', async () => {
    const email = newcomer();
    const { rawToken, requestedHere } = await requestLink(email);

    const { response } = await openLink(rawToken, requestedHere);
    expect(response.status).toBe(302);
    expect(cookieChange(response, 'session')).toBe('set');

    const { users, emails } = await rowsFor(email);
    expect(users).toHaveLength(1);
    expect(emails).toEqual([
      expect.objectContaining({ userId: users[0].id, verified: true, lastVerifiedVia: 'magic' }),
    ]);
    expect(await tokensFor(email)).toEqual([expect.objectContaining({ userId: users[0].id })]);
  });

  it('lets an invited address sign up while registration is closed, claiming its invitation at the click', async () => {
    closeRegistration();
    const organization = await createTestOrganization();
    const inviter = await createTestUser(`inviter-${nanoid(6)}@security-test.com`.toLowerCase());
    const email = newcomer();
    const { inactiveMembership } = await createInvitation({ organization, email, createdBy: inviter.id });

    const { rawToken, requestedHere } = await requestLink(email);
    expect((await rowsFor(email)).users).toHaveLength(0);

    const { response } = await openLink(rawToken, requestedHere);
    expect(response.status).toBe(302);
    expect(cookieChange(response, 'session')).toBe('set');

    const { users } = await rowsFor(email);
    expect(users).toHaveLength(1);
    const [claimed] = await db
      .select()
      .from(inactiveMembershipsTable)
      .where(eq(inactiveMembershipsTable.id, inactiveMembership.id));
    expect(claimed.userId).toBe(users[0].id);
  });

  it('signs in to an account that took the address since the link went out, creating no second one', async () => {
    const email = newcomer();
    const { rawToken, requestedHere } = await requestLink(email);
    const holder = await createTestUser(email);

    const { response } = await openLink(rawToken, requestedHere);
    expect(response.status).toBe(302);
    expect(cookieChange(response, 'session')).toBe('set');

    const { users, emails } = await rowsFor(email);
    expect(users.map((user) => user.id)).toEqual([holder.id]);
    expect(emails).toEqual([expect.objectContaining({ verified: true, lastVerifiedVia: 'magic' })]);
  });

  it('must not create an account via a sign-up link once registration has closed', async () => {
    const email = newcomer();
    const { rawToken, requestedHere } = await requestLink(email);
    closeRegistration();

    const { error, response } = await openLink(rawToken, requestedHere);
    await expectRefusal({ response, error }, 403, 'sign_up_restricted');
    expect(cookieChange(response, 'session')).toBeUndefined();
    expect((await rowsFor(email)).users).toHaveLength(0);
    expect(await tokensFor(email)).toEqual([expect.objectContaining({ invokedAt: null, userId: null })]);
  });

  it('must not confirm a planted sign-up link into a new account while signed in', async () => {
    const victim = await createTestUser(`victim-${nanoid(6)}@security-test.com`.toLowerCase());
    const email = newcomer();
    const { rawToken } = await requestLink(email);

    const cookies = [await createTestSession(victim), authCookie('magic-pending', rawToken)].join('; ');
    const { error, response } = await call(confirmMagicLink, { headers: { ...defaultHeaders, Cookie: cookies } });
    await expectRefusal({ response, error }, 409, 'user_mismatch');
    expect((await rowsFor(email)).users).toHaveLength(0);
    expect(await tokensFor(email)).toEqual([expect.objectContaining({ invokedAt: null, userId: null })]);
  });

  it('shows the address of a sign-up link opened elsewhere, and creates the account on confirmation', async () => {
    const email = newcomer();
    const { rawToken } = await requestLink(email);

    const opened = await call(invokeToken, { path: { type: 'magic', token: rawToken }, headers: defaultHeaders });
    const held = setCookiePair(opened.response, 'magic-pending');
    expect((await rowsFor(email)).users).toHaveLength(0);

    const pending = await call(getPendingMagicLink, { headers: { ...defaultHeaders, Cookie: held } });
    expect((pending.data as { email: string }).email).toBe(email);

    const confirmed = await call(confirmMagicLink, { headers: { ...defaultHeaders, Cookie: held } });
    expect(confirmed.response.status).toBe(302);
    expect(cookieChange(confirmed.response, 'session')).toBe('set');
    expect((await rowsFor(email)).users).toHaveLength(1);
  });

  it('keeps one live sign-up link per address', async () => {
    const email = newcomer();
    const first = await requestLink(email);
    const second = await requestLink(email);

    const tokens = await tokensFor(email);
    expect(tokens).toHaveLength(1);
    expect(tokens[0].secret).toBe(hashToken(second.rawToken));

    const { error, response } = await openLink(first.rawToken, first.requestedHere);
    await expectRefusal({ response, error }, 401, 'magic_not_found');
  });
});

/**
 * A link refuses a browser signed in to another account. A session cookie that no longer authenticates (revoked,
 * expired, or naming no session at all) signs nobody in, so it counts as no session: the link opens as usual. A
 * session the app could not read at all is another matter: the request fails, the link does not open as signed out.
 */
describe('magic link in a browser with a stale session cookie', async () => {
  const call = await createAppClient();

  afterEach(async () => await clearSecurityTestData());

  const staleCookies = async (owner: { id: string }) => {
    const revoked = await insertTestSession(owner);
    await db
      .update(sessionsTable)
      .set({ revokedAt: new Date().toISOString(), revocationReason: 'sign_out' })
      .where(eq(sessionsTable.id, revoked.id));
    const expired = await insertTestSession(owner, { expiresInMs: -1000 });
    return { revoked: revoked.cookie, expired: expired.cookie, unknown: authCookie('session', nanoid(40)) };
  };

  it('must not lock the owner out of their magic link via a stale session cookie in the browser', async () => {
    const owner = await createTestUser(`stale-${nanoid(6)}@security-test.com`.toLowerCase());

    for (const [kind, stale] of Object.entries(await staleCookies(owner))) {
      const { raw, row } = await magicLink(owner);
      const cookies = [stale, authCookie('magic-requested', row.id)].join('; ');

      const { response } = await call(invokeToken, {
        path: { type: 'magic', token: raw },
        headers: { ...defaultHeaders, Cookie: cookies },
      });
      expect(response.status, kind).toBe(302);
      expect(response.headers.get('location'), kind).not.toContain('/auth/error');
      expect(cookieChange(response, 'session'), kind).toBe('set');
    }
  });

  it('still refuses a link while a live session of another account is in the browser (positive control)', async () => {
    const owner = await createTestUser(`owner-${nanoid(6)}@security-test.com`.toLowerCase());
    const other = await createTestUser(`other-${nanoid(6)}@security-test.com`.toLowerCase());
    const { raw, row } = await magicLink(owner);
    const cookies = [await createTestSession(other), authCookie('magic-requested', row.id)].join('; ');

    const { error, response } = await call(invokeToken, {
      path: { type: 'magic', token: raw },
      headers: { ...defaultHeaders, Cookie: cookies },
    });
    await expectRefusal({ response, error }, 409, 'user_mismatch');
    expect(cookieChange(response, 'session')).toBeUndefined();
  });

  it('must not open a magic link as signed out via a session read that failed', async () => {
    const owner = await createTestUser(`owner-${nanoid(6)}@security-test.com`.toLowerCase());
    const other = await createTestUser(`other-${nanoid(6)}@security-test.com`.toLowerCase());
    const { raw, row } = await magicLink(owner);
    const cookies = [await createTestSession(other), authCookie('magic-requested', row.id)].join('; ');

    // The pool has no connection for the session read: who is signed in here is unknown, so nobody signs in.
    failNextReadOf(sessionsTable);
    const { response } = await call(invokeToken, {
      path: { type: 'magic', token: raw },
      headers: { ...defaultHeaders, Cookie: cookies },
    });
    expect(response.status).toBe(503);
    expect(cookieChange(response, 'session')).toBeUndefined();
    expect((await tokenRow(row.id)).invokedAt).toBeNull();
  });
});
