import { decodeBase32, encodeBase32UpperCase } from '@oslojs/encoding';
import { eq } from 'drizzle-orm';
import {
  createApiKey,
  createPasskey,
  createServiceAccount,
  createTotp,
  deleteMe,
  deletePasskey,
  deleteTotp,
  generatePasskeyChallenge,
  generateTotpKey,
  invokeToken,
  sendStepUpLink,
  startOAuthConnect,
  stepUp,
  toggleMfa,
} from 'sdk';
import { appConfig } from 'shared';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { baseDb as db } from '#/db/db';
import { mailer } from '#/lib/mailer';
import { mockPasskeyRecord } from '#/modules/auth/auth-mocks';
import { authCookieName } from '#/modules/auth/general/helpers/cookie';
import { passkeysTable } from '#/modules/auth/passkeys/passkeys-db';
import { tokensTable } from '#/modules/auth/tokens-db';
import { generateTOTP } from '#/modules/auth/totps/helpers/totp-core';
import { totpsTable } from '#/modules/auth/totps/totps-db';
import { apiKeysTable } from '#/modules/service-accounts/api-keys-db';
import { serviceAccountsTable } from '#/modules/service-accounts/service-accounts-db';
import { usersTable } from '#/modules/user/user-db';
import { defaultHeaders } from '../fixtures';
import {
  authCookie,
  createSystemAdminUser,
  createTestOrganization,
  createTestUser,
  createTotpUser,
  type ErrorResponse,
} from '../helpers';
import { softwarePasskey } from '../software-passkey';
import { createAppClient, type TestResult } from '../test-client';
import { mockFetchRequest, setTestConfig } from '../test-utils';
import { clearSecurityTestData, createOrgUser } from './helpers';
import { asSession, cookiesAfter, insertImpersonation, insertSession, type TestSession } from './session-helpers';

vi.mock('#/lib/mailer', () => ({ mailer: { prepareEmails: vi.fn().mockResolvedValue(undefined) } }));

setTestConfig({ enabledAuthStrategies: ['passkey', 'totp', 'oauth', 'magic'], enabledOAuthProviders: ['github'] });

beforeAll(() => mockFetchRequest());

afterEach(async () => {
  await clearSecurityTestData();
  vi.clearAllMocks();
});

/** The Base32 secret `createTotpUser` stores. */
const TOTP_SECRET = 'JBSWY3DPEHPK3PXP';
const codeFor = (secret: string) =>
  generateTOTP(decodeBase32(secret), appConfig.totp.intervalInSeconds, appConfig.totp.digits);

/** Signed in longer ago than the step-up window, so the sign-in no longer proves anything. */
const STALE = { ageMs: 60 * 60 * 1000 };

/** The raw token at the end of the step-up link in the last mail handed to the mailer. */
const mailedStepUpToken = () => {
  const statics = vi.mocked(mailer.prepareEmails).mock.lastCall?.[1] as { stepUpUrl?: string } | undefined;
  const rawToken = statics?.stepUpUrl?.split('/').at(-1) ?? '';
  expect(rawToken).not.toBe('');
  return rawToken;
};

const expectStepUpRequired = (result: TestResult) => {
  expect(result.response.status).toBe(403);
  expect((result.error as ErrorResponse).type).toBe('step_up_required');
};

/**
 * Account-security routes need the user present again on the very session: a stale session, an impersonation, a
 * step-up of another session and an emailed link opened elsewhere are all refused, and the same request passes once
 * this session stepped up (the positive control).
 */
describe('account-security routes need a step-up', async () => {
  const call = await createAppClient();

  /** A TOTP holder with MFA off, so a factor can go without turning MFA off with it. */
  const totpHolder = async (label: string) => {
    const user = await createTotpUser(`${label}@security-test.com`);
    await db.update(usersTable).set({ mfaRequired: false }).where(eq(usersTable.id, user.id));
    return user;
  };

  const stepUpWithTotp = async (session: TestSession) =>
    expect(
      (await call(stepUp, { body: { totpCode: codeFor(TOTP_SECRET) }, headers: session.headers })).response.status,
    ).toBe(204);

  /** A step-up through the emailed link, opened in the browser that asked; returns that browser's session. */
  const stepUpByEmail = async (session: TestSession) => {
    const asked = await call(sendStepUpLink, { body: {}, headers: session.headers });
    expect(asked.response.status).toBe(204);
    const browser = cookiesAfter(session.cookie, asked.response);
    const marker = browser.split('; ').filter((pair) => pair.startsWith(`${authCookieName('step-up-requested')}=`));
    const opened = await call(invokeToken, {
      path: { type: 'step-up', token: mailedStepUpToken() },
      headers: { ...defaultHeaders, Cookie: marker.join('; ') },
    });
    expect(opened.response.status).toBe(302);
    return asSession(session.id, browser);
  };

  it('must not add a passkey via a stale session', async () => {
    const user = await totpHolder('add-passkey');
    const session = await insertSession(user, STALE);
    const authenticator = softwarePasskey();
    const passkeysOf = () => db.select().from(passkeysTable).where(eq(passkeysTable.userId, user.id));

    /** A registration ceremony in this browser: a registration challenge, and the authenticator's answer to it. */
    const register = async () => {
      const issued = await call(generatePasskeyChallenge, { body: { type: 'registration' }, headers: defaultHeaders });
      const { challenge } = issued.data as { challenge: string };
      const challengeCookie = issued.response.headers
        .getSetCookie()
        .map((line) => line.split(';')[0])
        .find((pair) => pair.startsWith(`${authCookieName('passkey-challenge')}=`));
      return call(createPasskey, {
        body: { attestation: authenticator.attest(challenge), nameOnDevice: 'Laptop' },
        headers: { ...defaultHeaders, Cookie: `${session.cookie}; ${challengeCookie}` },
      });
    };

    expectStepUpRequired(await register());
    expect(await passkeysOf()).toHaveLength(0);

    await stepUpWithTotp(session);
    expect((await register()).response.status).toBe(201);
    expect(await passkeysOf()).toHaveLength(1);
  });

  it('must not delete a passkey via a stale session', async () => {
    const user = await totpHolder('delete-passkey');
    const [passkey] = await db.insert(passkeysTable).values(mockPasskeyRecord(user.id)).returning();
    const session = await insertSession(user, STALE);
    const passkeysOf = () => db.select().from(passkeysTable).where(eq(passkeysTable.userId, user.id));

    expectStepUpRequired(await call(deletePasskey, { path: { id: passkey.id }, headers: session.headers }));
    expect(await passkeysOf()).toHaveLength(1);

    await stepUpWithTotp(session);
    expect((await call(deletePasskey, { path: { id: passkey.id }, headers: session.headers })).response.status).toBe(
      204,
    );
    expect(await passkeysOf()).toHaveLength(0);
  });

  it('must not set up an authenticator app via a stale session', async () => {
    const user = await createTestUser('setup-totp@security-test.com');
    const session = await insertSession(user, STALE);
    const secret = encodeBase32UpperCase(crypto.getRandomValues(new Uint8Array(20)));
    const withChallenge = { ...defaultHeaders, Cookie: `${session.cookie}; ${authCookie('totp-challenge', secret)}` };
    const totpsOf = () => db.select().from(totpsTable).where(eq(totpsTable.userId, user.id));

    expectStepUpRequired(await call(generateTotpKey, { headers: session.headers }));
    expectStepUpRequired(await call(createTotp, { body: { code: codeFor(secret) }, headers: withChallenge }));
    expect(await totpsOf()).toHaveLength(0);

    const steppedUp = await stepUpByEmail(session);
    expect((await call(generateTotpKey, { headers: steppedUp.headers })).response.status).toBe(200);
    const created = await call(createTotp, {
      body: { code: codeFor(secret) },
      headers: { ...defaultHeaders, Cookie: `${steppedUp.cookie}; ${authCookie('totp-challenge', secret)}` },
    });
    expect(created.response.status).toBe(201);
    expect(await totpsOf()).toHaveLength(1);
  });

  it('must not delete the authenticator app via a stale session', async () => {
    const user = await totpHolder('delete-totp');
    const session = await insertSession(user, STALE);
    const totpsOf = () => db.select().from(totpsTable).where(eq(totpsTable.userId, user.id));

    expectStepUpRequired(await call(deleteTotp, { headers: session.headers }));
    expect(await totpsOf()).toHaveLength(1);

    await stepUpWithTotp(session);
    expect((await call(deleteTotp, { headers: session.headers })).response.status).toBe(204);
    expect(await totpsOf()).toHaveLength(0);
  });

  it('must not turn MFA on via a stale session', async () => {
    const user = await totpHolder('mfa-on');
    await db.insert(passkeysTable).values(mockPasskeyRecord(user.id));
    const session = await insertSession(user, STALE);
    const mfaOf = async () => (await db.select().from(usersTable).where(eq(usersTable.id, user.id)))[0].mfaRequired;

    expectStepUpRequired(await call(toggleMfa, { body: { mfaRequired: true }, headers: session.headers }));
    expect(await mfaOf()).toBe(false);

    await stepUpWithTotp(session);
    expect((await call(toggleMfa, { body: { mfaRequired: true }, headers: session.headers })).response.status).toBe(
      200,
    );
    expect(await mfaOf()).toBe(true);
  });

  it('must not connect a provider via a stale session', async () => {
    const user = await createTestUser('connect@security-test.com');
    const session = await insertSession(user, STALE);
    const pins = () => db.select().from(tokensTable).where(eq(tokensTable.type, 'oauth-connect'));

    expectStepUpRequired(await call(startOAuthConnect, { headers: session.headers }));
    expect(await pins()).toHaveLength(0);

    const steppedUp = await stepUpByEmail(session);
    expect((await call(startOAuthConnect, { headers: steppedUp.headers })).response.status).toBe(204);
    expect(await pins()).toHaveLength(1);
  });

  it('must not delete the account via a stale session', async () => {
    const user = await createTestUser('delete-account@security-test.com');
    const session = await insertSession(user, STALE);
    const accounts = () => db.select().from(usersTable).where(eq(usersTable.id, user.id));

    expectStepUpRequired(await call(deleteMe, { headers: session.headers }));
    expect(await accounts()).toHaveLength(1);

    const steppedUp = await stepUpByEmail(session);
    expect((await call(deleteMe, { headers: steppedUp.headers })).response.status).toBe(204);
    expect(await accounts()).toHaveLength(0);
  });

  it('must not change account security via an impersonation session, however fresh', async () => {
    const admin = await createSystemAdminUser('impersonating-admin@security-test.com');
    const target = await totpHolder('impersonated');
    const [passkey] = await db.insert(passkeysTable).values(mockPasskeyRecord(target.id)).returning();
    const impersonation = await insertImpersonation(await insertSession(admin), target);
    const headers = impersonation.headers;

    const attempts = [
      await call(deletePasskey, { path: { id: passkey.id }, headers }),
      await call(generateTotpKey, { headers }),
      await call(deleteTotp, { headers }),
      await call(toggleMfa, { body: { mfaRequired: true }, headers }),
      await call(toggleMfa, { body: { mfaRequired: true, totpCode: codeFor(TOTP_SECRET) }, headers }),
      await call(startOAuthConnect, { headers }),
      await call(deleteMe, { headers }),
    ];
    for (const attempt of attempts) {
      expect(attempt.response.status).toBe(403);
      expect((attempt.error as ErrorResponse).type).toBe('impersonation_forbidden');
    }
    expect(await db.select().from(passkeysTable).where(eq(passkeysTable.userId, target.id))).toHaveLength(1);
    expect(await db.select().from(totpsTable).where(eq(totpsTable.userId, target.id))).toHaveLength(1);

    // The impersonated user's own stepped-up session passes.
    const own = await insertSession(target, STALE);
    await stepUpWithTotp(own);
    expect((await call(deletePasskey, { path: { id: passkey.id }, headers: own.headers })).response.status).toBe(204);
  });

  /** An organization with an admin who has no second factor, and the calls that mint an API key in it. */
  const keyMinting = async (label: string) => {
    const org = await createTestOrganization();
    const admin = await createOrgUser(call, org.tenantId, org.id, label, 'admin');
    const path = { tenantId: org.tenantId, organizationId: org.id };
    return {
      admin,
      createAccount: (session: TestSession) =>
        call(createServiceAccount, {
          path,
          body: { name: 'CI bot', role: 'member', key: { name: 'deploy', scopes: null } },
          headers: session.headers,
        }),
      createKey: (session: TestSession, id: string) =>
        call(createApiKey, { path: { ...path, id }, body: { name: 'second' }, headers: session.headers }),
      accounts: () => db.select().from(serviceAccountsTable).where(eq(serviceAccountsTable.tenantId, org.tenantId)),
      keys: () => db.select().from(apiKeysTable).where(eq(apiKeysTable.tenantId, org.tenantId)),
    };
  };

  it('must not mint an API key via a stale session', async () => {
    const minting = await keyMinting('key-minter');
    const stale = await insertSession(minting.admin, STALE);

    expectStepUpRequired(await minting.createAccount(stale));
    expect(await minting.accounts()).toHaveLength(0);

    const steppedUp = await stepUpByEmail(stale);
    const created = await minting.createAccount(steppedUp);
    expect(created.response.status).toBe(201);
    const accountId = (created.data as { serviceAccount: { id: string } }).serviceAccount.id;

    // A further key for the account needs the step-up as well.
    expectStepUpRequired(await minting.createKey(await insertSession(minting.admin, STALE), accountId));
    expect(await minting.keys()).toHaveLength(1);
    expect((await minting.createKey(steppedUp, accountId)).response.status).toBe(201);
    expect(await minting.keys()).toHaveLength(2);
  });

  it('must not mint an API key via an impersonation session, however fresh', async () => {
    const minting = await keyMinting('impersonated-key-minter');
    const own = await insertSession(minting.admin);
    const created = await minting.createAccount(own);
    expect(created.response.status).toBe(201);
    const accountId = (created.data as { serviceAccount: { id: string } }).serviceAccount.id;

    const admin = await createSystemAdminUser('key-impersonator@security-test.com');
    const impersonation = await insertImpersonation(await insertSession(admin), minting.admin);
    for (const attempt of [
      await minting.createAccount(impersonation),
      await minting.createKey(impersonation, accountId),
    ]) {
      expect(attempt.response.status).toBe(403);
      expect((attempt.error as ErrorResponse).type).toBe('impersonation_forbidden');
    }
    expect(await minting.accounts()).toHaveLength(1);
    expect(await minting.keys()).toHaveLength(1);
  });

  it("must not pass the guard via a step-up of the user's other session", async () => {
    const user = await totpHolder('two-browsers');
    const [stepped, other] = [await insertSession(user, STALE), await insertSession(user, STALE)];
    await stepUpWithTotp(stepped);

    expectStepUpRequired(await call(deleteTotp, { headers: other.headers }));
    expect((await call(deleteTotp, { headers: stepped.headers })).response.status).toBe(204);
  });

  it('must not pass the guard via the emailed link opened in another browser', async () => {
    const user = await createTestUser('link-elsewhere@security-test.com');
    const asking = await insertSession(user, STALE);
    const otherBrowser = await insertSession(user, STALE);

    const asked = await call(sendStepUpLink, { body: {}, headers: asking.headers });
    const rawToken = mailedStepUpToken();
    const elsewhere = await call(invokeToken, {
      path: { type: 'step-up', token: rawToken },
      headers: otherBrowser.headers,
    });
    expect(elsewhere.response.status).toBe(403);

    expectStepUpRequired(await call(startOAuthConnect, { headers: asking.headers }));
    expectStepUpRequired(await call(startOAuthConnect, { headers: otherBrowser.headers }));

    const browser = cookiesAfter(asking.cookie, asked.response);
    const marker = browser.split('; ').filter((pair) => pair.startsWith(`${authCookieName('step-up-requested')}=`));
    await call(invokeToken, {
      path: { type: 'step-up', token: rawToken },
      headers: { ...defaultHeaders, Cookie: marker.join('; ') },
    });
    expect((await call(startOAuthConnect, { headers: { ...defaultHeaders, Cookie: browser } })).response.status).toBe(
      204,
    );
    expectStepUpRequired(await call(startOAuthConnect, { headers: otherBrowser.headers }));
  });
});
