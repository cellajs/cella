import { inArray } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { baseDb as db } from '#/db/db';
import { mailer } from '#/lib/mailer';
import { authCookieName } from '#/modules/auth/general/helpers/cookie';
import { enrollDevice } from '#/modules/auth/general/helpers/enroll-device';
import { passkeysTable } from '#/modules/auth/passkeys/passkeys-db';
import { requestsTable } from '#/modules/requests/requests-db';
import { accountExistsEmail, requestResponseEmail } from '../../emails';
import { defaultHeaders } from '../fixtures';
import { authCookie, createUser } from '../helpers';
import { softwarePasskey } from '../software-passkey';
import { mockFetchRequest, setTestConfig } from '../test-utils';
import { clearSecurityTestData } from './helpers';

vi.mock('#/lib/mailer', () => ({ mailer: { prepareEmails: vi.fn().mockResolvedValue(undefined) } }));
// The team notification a stored request sends never answers here: the form must not wait for it, or its latency would
// tell a stored request from the one an account's address gets.
vi.mock('#/lib/notifications/send-matrix-message', () => ({ sendMatrixMessage: () => new Promise(() => {}) }));

setTestConfig({ enabledAuthStrategies: ['passkey', 'totp', 'magic'] });

/** The templates of the mails handed to the mailer for `email`. */
const mailsTo = (email: string) =>
  vi
    .mocked(mailer.prepareEmails)
    .mock.calls.filter(([, , recipients]) => (recipients as { email: string }[]).some((r) => r.email === email))
    .map(([template]) => template);

beforeAll(() => mockFetchRequest());

afterEach(async () => {
  await clearSecurityTestData();
  vi.mocked(mailer.prepareEmails).mockClear();
});

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
    const passkey = softwarePasskey();
    await db.insert(passkeysTable).values({
      userId: account.id,
      credentialId: passkey.credentialId,
      publicKey: passkey.publicKey,
      counter: 0,
      nameOnDevice: 'Test device',
      deviceType: 'desktop',
    });
    return { account, stranger: `nobody-${nanoid(8)}@security-test.com`.toLowerCase() };
  }

  /** The body of a passkey challenge answer, without the challenge itself, which differs every time. */
  const challengeShape = async (res: Response) => {
    const { challenge: _challenge, ...rest } = (await res.json()) as { challenge: string };
    return { status: res.status, ...rest };
  };

  it('must not learn whether an address has an account via the passkey challenge', async () => {
    const { account, stranger } = await accountAndStranger();

    const forAccount = await challengeShape(
      await post('/auth/passkey/generate-challenge', { type: 'authentication', email: account.email }),
    );
    const forStranger = await challengeShape(
      await post('/auth/passkey/generate-challenge', { type: 'authentication', email: stranger }),
    );

    expect(forAccount).toEqual(forStranger);
    expect(forAccount).toEqual({ status: 200, credentialIds: [] });
  });

  it('must not learn whether an address has an account via the passkey sign-in', async () => {
    const { account, stranger } = await accountAndStranger();

    /** Answers a fresh challenge with a passkey no account holds, naming `email`. */
    const signInAs = async (email: string) => {
      const challenged = await post('/auth/passkey/generate-challenge', { type: 'authentication' });
      const { challenge } = (await challenged.json()) as { challenge: string };
      const challengeCookie = challenged.headers
        .getSetCookie()
        .find((line) => line.startsWith(`${authCookieName('passkey-challenge')}=`))
        ?.split(';')[0];
      const res = await post(
        '/auth/passkey-verification',
        { type: 'authentication', email, assertion: softwarePasskey().assert(challenge) },
        challengeCookie,
      );
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

    // The difference goes to each inbox: only the stranger is on the waitlist, confirmed once; the account holder is
    // told the address already has an account.
    const waitlisted = await db
      .select({ email: requestsTable.email })
      .from(requestsTable)
      .where(inArray(requestsTable.email, [account.email, stranger]));
    expect(waitlisted).toEqual([{ email: stranger }]);
    expect(mailsTo(stranger)).toEqual([requestResponseEmail]);
    expect(mailsTo(account.email)).toEqual([accountExistsEmail]);
  });
});
