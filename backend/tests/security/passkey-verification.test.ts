import { nanoid } from 'nanoid';
import { afterEach, describe, expect, it } from 'vitest';
import { cookieChange, createUser, expectRefusal, sessionsOf } from '../helpers';
import { type PasskeyAssertion, type SoftwarePasskey, softwarePasskey } from '../software-passkey';
import { setTestConfig } from '../test-utils';
import { clearSecurityTestData, insertPasskey, passkeyChallenge, passkeySignIn, passkeysOf } from './helpers';

setTestConfig({ enabledAuthStrategies: ['passkey'] });

/**
 * A passkey response that does not verify is a failed sign-in: 401, no session. Answering 500 (the library throws for
 * most mismatches) also kept the failure out of the sign-in limiter, which counts only 401, 403 and 404.
 */
describe('Passkey verification', () => {
  afterEach(async () => await clearSecurityTestData());

  async function userWithPasskey() {
    const user = await createUser(`passkey-${nanoid(8)}@security-test.com`);
    return { user, passkey: await insertPasskey(user) };
  }

  const forgeries: [string, (passkey: SoftwarePasskey, challenge: string) => PasskeyAssertion][] = [
    ['a response to another challenge', (passkey) => passkey.assert(nanoid(43))],
    [
      'a response for another origin',
      (passkey, challenge) => passkey.assert(challenge, { origin: 'https://evil.example' }),
    ],
    [
      'a response for another relying party',
      (passkey, challenge) => passkey.assert(challenge, { rpId: 'evil.example' }),
    ],
    ['a response without user verification', (passkey, challenge) => passkey.assert(challenge, { flags: 0x01 })],
    [
      'a signature from another key',
      (passkey, challenge) => ({
        ...softwarePasskey().assert(challenge),
        id: passkey.credentialId,
        rawId: passkey.credentialId,
      }),
    ],
  ];

  for (const [vector, forge] of forgeries) {
    it(`must not sign in via ${vector}`, async () => {
      const { user, passkey } = await userWithPasskey();
      const { challenge, cookie } = await passkeyChallenge('authentication');

      const { error, response } = await passkeySignIn(forge(passkey, challenge), cookie);
      await expectRefusal({ response, error }, 401, 'passkey_verification_failed');
      expect(cookieChange(response, 'session')).toBeUndefined();
      expect(await sessionsOf(user.id)).toHaveLength(0);
    });
  }

  it('signs in with a valid response from the registered passkey (positive control)', async () => {
    const { user, passkey } = await userWithPasskey();
    const { challenge, cookie } = await passkeyChallenge('authentication');

    const { response } = await passkeySignIn(passkey.assert(challenge), cookie);
    expect(response.status).toBe(204);
    expect(cookieChange(response, 'session')).toBe('set');
    expect(await sessionsOf(user.id)).toHaveLength(1);
    const [stored] = await passkeysOf(user.id);
    expect(stored?.counter).toBe(1);
  });
});
