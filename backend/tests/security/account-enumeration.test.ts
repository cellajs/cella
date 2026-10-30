import { eq, inArray, sql } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { appConfig } from 'shared';
import { afterEach, describe, expect, it, onTestFinished, vi } from 'vitest';
import { baseDb as db } from '#/db/db';
import { enrollDevice } from '#/modules/auth/devices/operations/enroll-device';
import { transformGithubUserData } from '#/modules/auth/oauth/helpers/transform-user-data';
import { tokensTable } from '#/modules/auth/tokens/tokens-db';
import { requestsTable } from '#/modules/requests/requests-db';
import { accountExistsEmail, magicLinkEmail, requestResponseEmail } from '../../emails';
import { defaultHeaders } from '../fixtures';
import { adminDb, authCookie, createTestOrganization, createUser, insertTestSession, insertTestToken, mailsTo } from '../helpers';
import { createInvitation } from '../invitations/helpers';
import { softwarePasskey } from '../software-passkey';
import { setTestConfig } from '../test-utils';
import { clearSecurityTestData, insertPasskey, passkeyChallenge } from './helpers';

// The team notification a stored request sends never answers here: the form must not wait for it, or its latency would
// tell a stored request from the one an account's address gets.
vi.mock('#/modules/requests/helpers/send-matrix-message', () => ({ sendMatrixMessage: () => new Promise(() => {}) }));

// GitHub's code exchange succeeds, and its profile is the one each test hands `transformGithubUserData`.
vi.mock('#/modules/auth/oauth/helpers/providers', async (importOriginal) => ({
  ...(await importOriginal<typeof import('#/modules/auth/oauth/helpers/providers')>()),
  githubAuth: { validateAuthorizationCode: vi.fn(async () => ({ accessToken: 'provider-access-token' })) },
}));
vi.mock('#/modules/auth/oauth/helpers/transform-user-data', () => ({ transformGithubUserData: vi.fn(), transformSocialUserData: vi.fn() }));

setTestConfig({ enabledAuthStrategies: ['passkey', 'totp', 'magic', 'oauth'], enabledOAuthProviders: ['github'] });

/** Sets self-registration for the rest of the test. */
const setSelfRegistration = (open: boolean) => {
  setTestConfig({ selfRegistration: open });
  onTestFinished(() => setTestConfig({ selfRegistration: false }));
};

/** Writes to `table` that wait for a lock another transaction holds. */
const waitingWrites = async (table: string) => {
  const { rows } = await adminDb.execute<{ waiting: number }>(
    sql`select count(*)::int as waiting from pg_locks join pg_stat_activity using (pid) where not granted and datname = current_database() and relation = to_regclass(${table})`,
  );
  return rows[0].waiting;
};

/**
 * Sends `request` while every write to `table` waits on a lock this test holds, as a busy database would hold it; reads
 * go on. Resolves to the status the request answered before its own write got past the lock, or undefined when the
 * answer waited for that write.
 */
async function answerWhileWriteWaits(table: 'tokens' | 'requests', request: () => Response | Promise<Response>) {
  let release = () => {};
  const released = new Promise<void>((resolve) => {
    release = resolve;
  });
  let locked = () => {};
  const isLocked = new Promise<void>((resolve) => {
    locked = resolve;
  });
  const hold = adminDb.transaction(async (tx) => {
    await tx.execute(sql.raw(`LOCK TABLE ${table} IN SHARE MODE`));
    locked();
    await released;
  });

  let answered: number | undefined;
  try {
    await Promise.race([isLocked, hold]);
    const sent = Promise.resolve(request()).then((response) => {
      answered = response.status;
    });
    // The request's work has reached its write.
    await vi.waitFor(async () => expect(await waitingWrites(table)).toBe(1));
    const answeredFirst = answered;
    release();
    await sent;
    return answeredFirst;
  } finally {
    release();
    await hold;
  }
}

afterEach(async () => await clearSecurityTestData());

/**
 * Whether an address has an account is the owner's business. A visitor who types someone's address anywhere on the
 * public pages gets the same answer as for an address nobody holds.
 */
describe('Account enumeration', async () => {
  const { baseApp: app } = await import('#/routes');

  /** A raw JSON request: the SDK drops body fields its schema lacks, and these tests send them on purpose. */
  const post = (path: string, body: unknown, cookie?: string) =>
    app.request(path, {
      method: 'POST',
      headers: { ...defaultHeaders, ...(cookie ? { Cookie: cookie } : {}) },
      body: JSON.stringify(body),
    });

  /** An account holding a passkey, and an address nobody holds. */
  async function accountAndStranger() {
    const account = await createUser(`holder-${nanoid(8)}@security-test.com`.toLowerCase());
    await insertPasskey(account);
    return { account, stranger: `nobody-${nanoid(8)}@security-test.com`.toLowerCase() };
  }

  /** The body of a passkey challenge answer, without the challenge itself, which differs every time. */
  const challengeShape = async (res: Response) => {
    const { challenge: _challenge, ...rest } = (await res.json()) as { challenge: string };
    return { status: res.status, ...rest };
  };

  it('must not learn whether an address has an account via the passkey challenge', async () => {
    const { account, stranger } = await accountAndStranger();

    const forAccount = await challengeShape(await post('/auth/passkey/generate-challenge', { type: 'authentication', email: account.email }));
    const forStranger = await challengeShape(await post('/auth/passkey/generate-challenge', { type: 'authentication', email: stranger }));

    expect(forAccount).toEqual(forStranger);
    expect(forAccount).toEqual({ status: 200, credentialIds: [] });
  });

  it('must not learn whether an address has an account via the passkey sign-in', async () => {
    const { account, stranger } = await accountAndStranger();

    /** Answers a fresh challenge with a passkey no account holds, naming `email`. */
    const signInAs = async (email: string) => {
      const { challenge, cookie } = await passkeyChallenge('authentication');
      const res = await post('/auth/passkey-verification', { type: 'authentication', email, assertion: softwarePasskey().assert(challenge) }, cookie);
      const { type } = (await res.json()) as { type?: string };
      return { status: res.status, type };
    };

    const forAccount = await signInAs(account.email);
    const forStranger = await signInAs(stranger);
    expect(forAccount).toEqual(forStranger);
    expect(forAccount.status).toBe(404);
  });

  /** The status and body check-email answers for `email`, from a browser carrying `cookie`. */
  const checkEmail = async (email: string, cookie?: string) => {
    const res = await post('/auth/check-email', { email }, cookie);
    return { status: res.status, body: res.status === 204 ? null : await res.json() };
  };

  /** A browser's device-id cookie, enrolled for `accounts` as a sign-in there would enroll it. */
  const browserOf = async (...accounts: { id: string }[]) => {
    const deviceId = nanoid(24);
    for (const account of accounts) await enrollDevice(account.id, deviceId);
    return authCookie('device-id', deviceId, 400 * 24 * 60 * 60);
  };

  it('must not learn whether an address has an account via check-email from an unrecognized browser', async () => {
    const { account, stranger } = await accountAndStranger();
    // The owner signed in on a browser of their own, so the account has a devices row: for that browser only.
    await browserOf(account);

    // A browser without a device id.
    expect(await checkEmail(account.email)).toEqual(await checkEmail(stranger));

    // A browser that signed in, to another account: the prober's own.
    const prober = await createUser(`prober-${nanoid(8)}@security-test.com`.toLowerCase());
    const proberBrowser = await browserOf(prober);
    const forAccount = await checkEmail(account.email, proberBrowser);
    expect(forAccount).toEqual(await checkEmail(stranger, proberBrowser));
    expect(forAccount).toEqual({ status: 200, body: { recognized: false } });
  });

  it('tells a browser that signed in to the address before that it has an account (positive control)', async () => {
    const { account, stranger } = await accountAndStranger();
    const ownBrowser = await browserOf(account);

    expect(await checkEmail(account.email, ownBrowser)).toEqual({ status: 200, body: { recognized: true } });
    expect(await checkEmail(stranger, ownBrowser)).toEqual({ status: 200, body: { recognized: false } });
  });

  it('must not learn whether an address has an account via the waitlist form', async () => {
    const { account, stranger } = await accountAndStranger();
    const join = async (email: string) => {
      const res = await post('/requests', { email, type: 'waitlist', message: null });
      return { status: res.status, body: await res.text() };
    };

    const forAccount = await join(account.email);
    const forStranger = await join(stranger);
    const forRepeat = await join(stranger);
    expect(forAccount).toEqual(forStranger);
    expect(forRepeat).toEqual(forStranger);
    expect(forStranger).toEqual({ status: 204, body: '' });

    // The difference goes to each inbox, after the answer: only the stranger is on the waitlist, confirmed once; the
    // account holder is told the address already has an account.
    await vi.waitFor(() => expect(mailsTo(stranger).map(({ template }) => template)).toEqual([requestResponseEmail]));
    await vi.waitFor(() => expect(mailsTo(account.email).map(({ template }) => template)).toEqual([accountExistsEmail]));
    const waitlisted = await db
      .select({ email: requestsTable.email })
      .from(requestsTable)
      .where(inArray(requestsTable.email, [account.email, stranger]));
    expect(waitlisted).toEqual([{ email: stranger }]);
  });

  it('must not wait for the request row before answering the waitlist form', async () => {
    const stranger = `nobody-${nanoid(8)}@security-test.com`.toLowerCase();

    // An address with an account stores no row, so an answer that waited for the row would come later for a stranger.
    const answered = await answerWhileWriteWaits('requests', () => post('/requests', { email: stranger, type: 'waitlist', message: null }));
    expect(answered).toBe(204);

    // Stored once the write gets through (positive control).
    await vi.waitFor(() => expect(mailsTo(stranger).map(({ template }) => template)).toEqual([requestResponseEmail]));
    expect(await db.select({ email: requestsTable.email }).from(requestsTable).where(eq(requestsTable.email, stranger))).toEqual([
      { email: stranger },
    ]);
  });

  it("must not wait for the account's token before answering a magic-link request", async () => {
    // Closed registration: only an account's address gets a token, so an answer that waited for it would come later.
    setSelfRegistration(false);
    const { account } = await accountAndStranger();

    const answered = await answerWhileWriteWaits('tokens', () => post('/auth/magic/send', { email: account.email }));
    expect(answered).toBe(204);

    // The link goes out once the write gets through (positive control).
    await vi.waitFor(() => expect(mailsTo(account.email).map(({ template }) => template)).toEqual([magicLinkEmail]));
    expect(await db.select({ userId: tokensTable.userId }).from(tokensTable).where(eq(tokensTable.email, account.email))).toEqual([
      { userId: account.id },
    ]);
  });

  /**
   * What a GitHub callback answers for a provider account nobody linked, whose profile asserts `email`: verified by
   * GitHub, or (an unverified primary) only typed in by whoever holds the provider account.
   */
  const providerCallback = async (email: string, { type = 'auth', verified = false, cookie = '' } = {}) => {
    vi.mocked(transformGithubUserData).mockReturnValueOnce({
      id: nanoid(),
      slug: 'prober',
      email,
      name: 'Prober',
      emailVerified: verified,
      firstName: 'Pro',
      lastName: 'Ber',
    });
    const state = nanoid();
    const stateCookie = authCookie('oauth-state', JSON.stringify({ state, provider: 'github', type }));
    const res = await app.request(`/auth/github/callback?code=provider-code&state=${state}`, {
      headers: { ...defaultHeaders, Cookie: [stateCookie, cookie].filter(Boolean).join('; ') },
    });
    const location = res.headers.get('location');
    return { status: res.status, location, type: location ? undefined : ((await res.json()) as { type?: string }).type };
  };

  it('must not reveal whether an account holds an unverified provider address', async () => {
    const { account, stranger } = await accountAndStranger();
    const invited = `invited-${nanoid(8)}@security-test.com`.toLowerCase();
    await createInvitation({ organization: await createTestOrganization(), email: invited, createdBy: account.id });

    // Closed registration: one refusal for a held, a free and an invited address alike.
    setSelfRegistration(false);
    const closed = await providerCallback(account.email);
    expect(await providerCallback(stranger)).toEqual(closed);
    expect(await providerCallback(invited)).toEqual(closed);
    expect(closed).toEqual({ status: 403, location: null, type: 'sign_up_restricted' });

    // Open registration: a sign-up waiting on the mail to the address, held or free.
    setSelfRegistration(true);
    const open = await providerCallback(account.email);
    expect(await providerCallback(stranger)).toEqual(open);
    expect(open).toEqual({ status: 302, location: `${appConfig.frontendUrl}/auth/email-verification/signup?provider=github`, type: undefined });

    // Signed in to an own account, connecting the provider account: held or free, the connect waits on the mail.
    const prober = await createUser(`prober-${nanoid(8)}@security-test.com`.toLowerCase());
    const connectPin = async () => {
      const { id: sessionId } = await insertTestSession(prober);
      return authCookie('oauth-connect', (await insertTestToken('oauth-connect', prober, { sessionId })).raw);
    };
    const connect = await providerCallback(account.email, { type: 'connect', cookie: await connectPin() });
    expect(await providerCallback(stranger, { type: 'connect', cookie: await connectPin() })).toEqual(connect);
    expect(connect).toMatchObject({ status: 302, location: `${appConfig.frontendUrl}/auth/email-verification/connect?provider=github` });

    // An address GitHub verified is its holder's: they are told to sign in and connect from there (positive control).
    expect(await providerCallback(account.email, { verified: true })).toEqual({ status: 409, location: null, type: 'oauth_email_exists' });
  });
});
