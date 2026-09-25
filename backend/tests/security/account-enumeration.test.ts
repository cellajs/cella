import { nanoid } from 'nanoid';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { baseDb as db } from '#/db/db';
import { authCookieName } from '#/modules/auth/general/helpers/cookie';
import { passkeysTable } from '#/modules/auth/passkeys/passkeys-db';
import { defaultHeaders } from '../fixtures';
import { createUser } from '../helpers';
import { softwarePasskey } from '../software-passkey';
import { mockFetchRequest, setTestConfig } from '../test-utils';
import { clearSecurityTestData } from './helpers';

setTestConfig({ enabledAuthStrategies: ['passkey', 'totp', 'magic'] });

beforeAll(() => mockFetchRequest());

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
});
