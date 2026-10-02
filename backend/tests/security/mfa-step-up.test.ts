import { eq } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { deletePasskey, deleteTotp, toggleMfa } from 'sdk';
import { afterEach, describe, expect, it } from 'vitest';
import { baseDb as db } from '#/db/db';
import type { StepUpProof } from '#/modules/auth/sessions/sessions-db';
import { totpsTable } from '#/modules/auth/totps/totps-db';
import { usersTable } from '#/modules/user/user-db';
import { createTotpUser, expectRefusal } from '../helpers';
import { createAppClient } from '../test-client';
import { clearSecurityTestData, insertPasskey, passkeysOf } from './helpers';
import { insertStaleSession, insertSteppedUpSession } from './session-helpers';

const mfaRequiredOf = async (userId: string) =>
  (await db.select({ mfaRequired: usersTable.mfaRequired }).from(usersTable).where(eq(usersTable.id, userId)))[0]?.mfaRequired;

/**
 * Turning MFA on or off changes how the account is protected, so a session alone must never be enough: the session
 * steps up with a second factor first. A stolen session could otherwise switch MFA off, or switch it on with a factor
 * the owner does not hold.
 */
describe('MFA toggle step-up', async () => {
  const call = await createAppClient();

  afterEach(async () => await clearSecurityTestData());

  /** A TOTP holder with a session that stepped up `via` a factor; `steppedUp: false` gives a stale session alone. */
  async function totpUserWithSession(mfaRequired: boolean, { withPasskey = true, steppedUp = true, via = 'totp' as StepUpProof } = {}) {
    const user = await createTotpUser(`mfa-${nanoid(8)}@security-test.com`);
    if (!mfaRequired) await db.update(usersTable).set({ mfaRequired: false }).where(eq(usersTable.id, user.id));
    const passkey = withPasskey ? await insertPasskey(user) : undefined;
    const session = steppedUp ? await insertSteppedUpSession(user, via) : await insertStaleSession(user);
    return { user, passkey, headers: session.headers };
  }

  it('must not disable MFA via PUT /me/mfa with a session that has not stepped up', async () => {
    const { user, headers } = await totpUserWithSession(true, { steppedUp: false });
    const { error, response } = await call(toggleMfa, { body: { mfaRequired: false }, headers });
    await expectRefusal({ response, error }, 403, 'step_up_required');
    expect(await mfaRequiredOf(user.id)).toBe(true);
  });

  it('disables MFA once the session stepped up (positive control)', async () => {
    const { user, headers } = await totpUserWithSession(true);
    const { response } = await call(toggleMfa, { body: { mfaRequired: false }, headers });
    expect(response.status).toBe(200);
    expect(await mfaRequiredOf(user.id)).toBe(false);
  });

  // MFA keeps two factors so a lost one can be replaced: removing either while MFA is on would switch it off unasked.
  it('must not turn MFA off by deleting the authenticator app via deleteTotp', async () => {
    const { user, headers } = await totpUserWithSession(true);
    const { error, response } = await call(deleteTotp, { headers });
    await expectRefusal({ response, error }, 400, 'mfa_factor_in_use');
    expect(await mfaRequiredOf(user.id)).toBe(true);
    expect(await db.select().from(totpsTable).where(eq(totpsTable.userId, user.id))).toHaveLength(1);
  });

  it('must not turn MFA off by deleting the last passkey via deletePasskey', async () => {
    const { user, passkey, headers } = await totpUserWithSession(true);
    const { error, response } = await call(deletePasskey, { path: { id: passkey!.id }, headers });
    await expectRefusal({ response, error }, 400, 'mfa_factor_in_use');
    expect(await mfaRequiredOf(user.id)).toBe(true);
    expect(await passkeysOf(user.id)).toHaveLength(1);
  });

  it('must not turn on MFA without both a passkey and an authenticator app', async () => {
    const { user, headers } = await totpUserWithSession(false, { withPasskey: false });
    const { error, response } = await call(toggleMfa, { body: { mfaRequired: true }, headers });
    await expectRefusal({ response, error }, 400, 'mfa_factors_required');
    expect(await mfaRequiredOf(user.id)).toBe(false);
  });

  it('turns on MFA with both factors, and deletes a factor while MFA is off (positive controls)', async () => {
    const on = await totpUserWithSession(false);
    const enabled = await call(toggleMfa, { body: { mfaRequired: true }, headers: on.headers });
    expect(enabled.response.status).toBe(200);
    expect(await mfaRequiredOf(on.user.id)).toBe(true);

    // Stepped up with the passkey: a step-up counts while its factor is held, and the authenticator app goes first.
    const off = await totpUserWithSession(false, { via: 'passkey' });
    expect((await call(deleteTotp, { headers: off.headers })).response.status).toBe(204);
    expect((await call(deletePasskey, { path: { id: off.passkey!.id }, headers: off.headers })).response.status).toBe(204);
  });
});
