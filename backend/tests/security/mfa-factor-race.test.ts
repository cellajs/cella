import { decodeBase32 } from '@oslojs/encoding';
import { eq } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { deletePasskey, deleteTotp, toggleMfa } from 'sdk';
import { appConfig } from 'shared';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { baseDb as db } from '#/db/db';
import { mockPasskeyRecord } from '#/modules/auth/auth-mocks';
import { passkeysTable } from '#/modules/auth/passkeys/passkeys-db';
import { generateTOTP } from '#/modules/auth/totps/helpers/totp-core';
import { totpsTable } from '#/modules/auth/totps/totps-db';
import { usersTable } from '#/modules/user/user-db';
import { defaultHeaders } from '../fixtures';
import { createTestSession, createTotpUser, type ErrorResponse } from '../helpers';
import { createAppClient } from '../test-client';
import { clearSecurityTestData } from './helpers';

/** Runs after the MFA toggle verified its code: after its early check of the factors, before its write. */
const hooks = vi.hoisted(() => ({ afterTotp: undefined as (() => Promise<void>) | undefined }));

vi.mock('#/modules/auth/totps/helpers/totps', async (importOriginal) => {
  const actual = await importOriginal<typeof import('#/modules/auth/totps/helpers/totps')>();
  return {
    ...actual,
    verifyTotp: async (...args: Parameters<typeof actual.verifyTotp>) => {
      const step = await actual.verifyTotp(...args);
      await hooks.afterTotp?.();
      return step;
    },
  };
});

const currentCode = () =>
  generateTOTP(decodeBase32('JBSWY3DPEHPK3PXP'), appConfig.totp.intervalInSeconds, appConfig.totp.digits);

/** Whether MFA is on, and how many factors of each kind the account holds. */
const stateOf = async (userId: string) => {
  const [user] = await db
    .select({ mfaRequired: usersTable.mfaRequired })
    .from(usersTable)
    .where(eq(usersTable.id, userId));
  const totps = await db.select().from(totpsTable).where(eq(totpsTable.userId, userId));
  const passkeys = await db.select().from(passkeysTable).where(eq(passkeysTable.userId, userId));
  return { mfaRequired: user.mfaRequired, totps: totps.length, passkeys: passkeys.length };
};

afterEach(async () => {
  hooks.afterTotp = undefined;
  await clearSecurityTestData();
});

/**
 * MFA keeps both factors (`mfaFactorRules`). Turning MFA on and deleting a factor check each other's work, so they must
 * take turns: otherwise each passes its check against the state before the other one's write.
 */
describe('MFA factor rules under concurrent requests', async () => {
  const call = await createAppClient();

  /** An account with a passkey and an authenticator app, MFA off, and a session. */
  async function userWithBothFactors() {
    const user = await createTotpUser(`race-${nanoid(8)}@security-test.com`);
    await db.update(usersTable).set({ mfaRequired: false }).where(eq(usersTable.id, user.id));
    const [passkey] = await db.insert(passkeysTable).values(mockPasskeyRecord(user.id)).returning();
    return { user, passkey, headers: { ...defaultHeaders, Cookie: await createTestSession(user) } };
  }

  it('must not leave MFA on with one factor via deleting the authenticator app while MFA is turned on', async () => {
    const { user, headers } = await userWithBothFactors();

    // The delete lands after the toggle's early check and before its write.
    let deleteStatus: number | undefined;
    hooks.afterTotp = async () => {
      deleteStatus = (await call(deleteTotp, { headers })).response.status;
    };
    const enabled = await call(toggleMfa, { body: { mfaRequired: true, totpCode: currentCode() }, headers });

    expect(deleteStatus).toBe(204);
    expect(enabled.response.status).toBe(400);
    expect((enabled.error as ErrorResponse).type).toBe('mfa_factors_required');
    expect(await stateOf(user.id)).toEqual({ mfaRequired: false, totps: 0, passkeys: 1 });
  });

  it('must not leave MFA on with fewer than both factors via concurrent requests', async () => {
    for (let round = 0; round < 5; round++) {
      const { user, passkey, headers } = await userWithBothFactors();

      await Promise.all([
        call(toggleMfa, { body: { mfaRequired: true, totpCode: currentCode() }, headers }),
        call(deleteTotp, { headers }),
        call(deletePasskey, { path: { id: passkey.id }, headers }),
      ]);

      // Any order may win, but MFA is never on without both factors.
      const state = await stateOf(user.id);
      if (state.mfaRequired) expect(state).toEqual({ mfaRequired: true, totps: 1, passkeys: 1 });
    }
  });

  it('turns MFA on with both factors when nothing races it (positive control)', async () => {
    const { user, headers } = await userWithBothFactors();

    const enabled = await call(toggleMfa, { body: { mfaRequired: true, totpCode: currentCode() }, headers });
    expect(enabled.response.status).toBe(200);
    expect(await stateOf(user.id)).toEqual({ mfaRequired: true, totps: 1, passkeys: 1 });
  });
});
