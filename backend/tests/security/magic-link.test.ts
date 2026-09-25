import { eq } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { confirmMagicLink, getPendingMagicLink, invokeToken, sendMagicLink } from 'sdk';
import { appConfig } from 'shared';
import { afterEach, beforeAll, beforeEach, describe, expect, it, onTestFinished, vi } from 'vitest';
import { baseDb as db } from '#/db/db';
import { mailer } from '#/lib/mailer';
import { actorsTable } from '#/modules/actors/actors-db';
import { authCookieName } from '#/modules/auth/general/helpers/cookie';
import { identitiesTable } from '#/modules/auth/identities-db';
import { tokensTable } from '#/modules/auth/tokens-db';
import { inactiveMembershipsTable } from '#/modules/memberships/inactive-memberships-db';
import { emailsTable } from '#/modules/user/emails-db';
import { usersTable } from '#/modules/user/user-db';
import { hashToken } from '#/utils/hash-token';
import { defaultHeaders } from '../fixtures';
import { authCookie, createTestOrganization, createTestSession, createTestUser, linkIdentity } from '../helpers';
import { createInvitation } from '../invitations/helpers';
import { createAppClient } from '../test-client';
import { mockFetchRequest, setTestConfig } from '../test-utils';
import { clearSecurityTestData } from './helpers';

vi.mock('#/lib/mailer', () => ({ mailer: { prepareEmails: vi.fn() } }));

setTestConfig({ enabledAuthStrategies: ['magic', 'passkey'] });

const sessionCookieSet = (res: Response) => res.headers.getSetCookie().some((line) => line.includes('-session-'));

/** A magic link row for `user`, optionally already opened with a single-use token (hash at rest). */
async function magicLink(user: { id: string; email: string }, opened?: { singleUse: string }) {
  const raw = nanoid(40);
  const [row] = await db
    .insert(tokensTable)
    .values({
      secret: hashToken(raw),
      type: 'magic',
      userId: user.id,
      email: user.email,
      createdBy: user.id,
      expiresAt: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
      ...(opened && { invokedAt: new Date().toISOString(), singleUseToken: hashToken(opened.singleUse) }),
    })
    .returning();
  return { raw, row };
}

/**
 * A magic link signs in whoever opens it, so it must not be replayable: an opened link stays usable only in the
 * browser that opened it, proven by its own single-use cookie, not by any cookie of the same name.
 */
describe('magic link replay', async () => {
  const call = await createAppClient();

  beforeAll(() => mockFetchRequest());
  afterEach(async () => await clearSecurityTestData());

  it("must not replay an opened magic link via another link's single-use cookie", async () => {
    const victim = await createTestUser(`magic-victim-${nanoid(6)}@security-test.com`.toLowerCase());
    const { raw } = await magicLink(victim, { singleUse: nanoid(40) });

    // The attacker's own opened link hands them a validly signed `magic` cookie with another value.
    const { error, response } = await call(invokeToken, {
      path: { type: 'magic', token: raw },
      headers: { ...defaultHeaders, Cookie: authCookie('magic', nanoid(40)) },
    });
    expect(response.status).toBe(401);
    expect((error as { type: string }).type).toBe('magic_expired');
    expect(sessionCookieSet(response)).toBe(false);
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
    expect(sessionCookieSet(response)).toBe(true);
    expect(response.headers.get('location')?.startsWith(appConfig.frontendUrl)).toBe(true);
    const [after] = await db.select().from(tokensTable).where(eq(tokensTable.id, row.id));
    expect(after.invokedAt).not.toBeNull();
  });
});

/** The `name=value` pair a response set for an auth cookie, to send back as the same browser would. */
const setCookiePair = (res: Response, name: Parameters<typeof authCookieName>[0]) =>
  res.headers
    .getSetCookie()
    .find((line) => line.startsWith(`${authCookieName(name)}=`))
    ?.split(';')[0];

/**
 * Opening a magic link signs in directly only in the browser that asked for it. Anywhere else the link waits for a
 * confirmation on the app's page: a link planted in someone's browser (login CSRF) or fetched by an email scanner signs
 * nobody in and is not used up, while the owner can still finish on another device with one click.
 */
describe('magic link opened in another browser', async () => {
  const call = await createAppClient();

  beforeAll(() => mockFetchRequest());
  afterEach(async () => await clearSecurityTestData());

  const newUser = () => createTestUser(`magic-${nanoid(6)}@security-test.com`.toLowerCase());
  const openedAt = async (id: string) =>
    (await db.select().from(tokensTable).where(eq(tokensTable.id, id)))[0]?.invokedAt ?? null;
  const confirmPage = new URL('/auth/confirm-sign-in', appConfig.frontendUrl).toString();

  it('must not sign in via a magic link opened in a browser that did not ask for it', async () => {
    const user = await newUser();
    const { raw, row } = await magicLink(user);

    const { response } = await call(invokeToken, { path: { type: 'magic', token: raw }, headers: defaultHeaders });
    expect(response.status).toBe(302);
    expect(response.headers.get('location')).toBe(confirmPage);
    expect(sessionCookieSet(response)).toBe(false);
    expect(setCookiePair(response, 'magic-pending')).toBeDefined();
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
    expect(sessionCookieSet(response)).toBe(false);
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
    expect(sessionCookieSet(response)).toBe(true);
  });

  it('must not confirm a link this browser does not hold', async () => {
    const { error, response } = await call(confirmMagicLink, { headers: defaultHeaders });
    expect(response.status).toBe(401);
    expect((error as { type: string }).type).toBe('magic_expired');
    expect(sessionCookieSet(response)).toBe(false);
  });

  it("must not confirm a planted link into its sender's account while signed in", async () => {
    const victim = await newUser();
    const attacker = await newUser();
    const { raw, row } = await magicLink(attacker);

    const cookies = [await createTestSession(victim), authCookie('magic-pending', raw)].join('; ');
    const { error, response } = await call(confirmMagicLink, { headers: { ...defaultHeaders, Cookie: cookies } });
    expect(response.status).toBe(400);
    expect((error as { type: string }).type).toBe('user_mismatch');
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
    expect(sessionCookieSet(confirmed.response)).toBe(true);
    expect(await openedAt(row.id)).not.toBeNull();
  });

  it('marks the requesting browser alike whether or not the address has an account', async () => {
    setTestConfig({ selfRegistration: false });
    const known = await newUser();

    for (const email of [known.email, `unknown-${nanoid(6)}@security-test.com`.toLowerCase()]) {
      const { response } = await call(sendMagicLink, { body: { email }, headers: defaultHeaders });
      expect(response.status).toBe(204);
      expect(setCookiePair(response, 'magic-requested')).toBeDefined();
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
    mockFetchRequest();
    setTestConfig({ selfRegistration: true });
  });
  beforeEach(() => vi.mocked(mailer.prepareEmails).mockClear());
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
    const statics = vi.mocked(mailer.prepareEmails).mock.lastCall?.[1] as { magicLinkUrl?: string } | undefined;
    const rawToken = statics?.magicLinkUrl?.split('/').at(-1) ?? '';
    expect(rawToken).not.toBe('');
    return { rawToken, requestedHere: setCookiePair(response, 'magic-requested') ?? '' };
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
    expect(sessionCookieSet(response)).toBe(true);

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
    expect(sessionCookieSet(response)).toBe(true);

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
    const holder = await createTestUser(email, false);

    const { response } = await openLink(rawToken, requestedHere);
    expect(response.status).toBe(302);
    expect(sessionCookieSet(response)).toBe(true);

    const { users, emails } = await rowsFor(email);
    expect(users.map((user) => user.id)).toEqual([holder.id]);
    expect(emails).toEqual([expect.objectContaining({ verified: true, lastVerifiedVia: 'magic' })]);
  });

  it('must not create an account via a sign-up link once registration has closed', async () => {
    const email = newcomer();
    const { rawToken, requestedHere } = await requestLink(email);
    closeRegistration();

    const { error, response } = await openLink(rawToken, requestedHere);
    expect(response.status).toBe(403);
    expect((error as { type: string }).type).toBe('sign_up_restricted');
    expect(sessionCookieSet(response)).toBe(false);
    expect((await rowsFor(email)).users).toHaveLength(0);
    expect(await tokensFor(email)).toEqual([expect.objectContaining({ invokedAt: null, userId: null })]);
  });

  it('must not confirm a planted sign-up link into a new account while signed in', async () => {
    const victim = await createTestUser(`victim-${nanoid(6)}@security-test.com`.toLowerCase());
    const email = newcomer();
    const { rawToken } = await requestLink(email);

    const cookies = [await createTestSession(victim), authCookie('magic-pending', rawToken)].join('; ');
    const { error, response } = await call(confirmMagicLink, { headers: { ...defaultHeaders, Cookie: cookies } });
    expect(response.status).toBe(400);
    expect((error as { type: string }).type).toBe('user_mismatch');
    expect((await rowsFor(email)).users).toHaveLength(0);
    expect(await tokensFor(email)).toEqual([expect.objectContaining({ invokedAt: null, userId: null })]);
  });

  it('shows the address of a sign-up link opened elsewhere, and creates the account on confirmation', async () => {
    const email = newcomer();
    const { rawToken } = await requestLink(email);

    const opened = await call(invokeToken, { path: { type: 'magic', token: rawToken }, headers: defaultHeaders });
    const held = setCookiePair(opened.response, 'magic-pending') ?? '';
    expect((await rowsFor(email)).users).toHaveLength(0);

    const pending = await call(getPendingMagicLink, { headers: { ...defaultHeaders, Cookie: held } });
    expect((pending.data as { email: string }).email).toBe(email);

    const confirmed = await call(confirmMagicLink, { headers: { ...defaultHeaders, Cookie: held } });
    expect(confirmed.response.status).toBe(302);
    expect(sessionCookieSet(confirmed.response)).toBe(true);
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
    expect(response.status).toBe(401);
    expect((error as { type: string }).type).toBe('magic_not_found');
  });
});

/**
 * An account whose address nobody proved may carry a provider identity nobody verified: before sign-ups waited on the
 * inbox, anyone could create such an account on someone else's address. The owner's first inbox proof adopts the
 * account and drops those identities with it.
 */
describe('adopting an unproven account', async () => {
  const call = await createAppClient();

  beforeAll(() => mockFetchRequest());
  afterEach(async () => await clearSecurityTestData());

  const address = (label: string) => `${label}-${nanoid(6)}@security-test.com`.toLowerCase();
  const identityRow = async (id: string) =>
    (await db.select().from(identitiesTable).where(eq(identitiesTable.id, id)))[0];

  /** Opens a fresh magic link for `user` in the browser that asked for it. */
  const signInByMagicLink = async (user: { id: string; email: string }) => {
    const { raw, row } = await magicLink(user);
    const { response } = await call(invokeToken, {
      path: { type: 'magic', token: raw },
      headers: { ...defaultHeaders, Cookie: authCookie('magic-requested', row.id) },
    });
    expect(response.status).toBe(302);
    expect(sessionCookieSet(response)).toBe(true);
  };

  it("must not keep an unverified provider identity on an account adopted via its owner's magic link", async () => {
    const owner = await createTestUser(address('owner'), false);
    const planted = await linkIdentity(owner, { verified: false, subject: 'planted-github-id' });

    await signInByMagicLink(owner);

    expect(await identityRow(planted.id)).toBeUndefined();
    const [adopted] = await db.select().from(emailsTable).where(eq(emailsTable.email, owner.email));
    expect(adopted).toMatchObject({ verified: true, lastVerifiedVia: 'magic' });
  });

  it("keeps verified identities, and an already proven account's pending connection (positive control)", async () => {
    const owner = await createTestUser(address('owner'), false);
    const verified = await linkIdentity(owner, { verified: true, subject: 'owner-github-id' });
    await signInByMagicLink(owner);
    expect(await identityRow(verified.id)).toBeDefined();

    const proven = await createTestUser(address('proven'));
    const pendingConnection = await linkIdentity(proven, { verified: false, subject: 'proven-github-id' });
    await signInByMagicLink(proven);
    expect(await identityRow(pendingConnection.id)).toBeDefined();
  });
});
