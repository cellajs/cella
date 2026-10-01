import { eq, sql } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { deleteTotp, toggleMfa } from 'sdk';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { baseDb as db, getAdminDb } from '#/db/db';
import { totpsTable } from '#/modules/auth/totps/totps-db';
import { usersTable } from '#/modules/user/user-db';
import { createTotpUser } from '../helpers';
import { createAppClient } from '../test-client';
import { clearSecurityTestData, insertPasskey, passkeysOf } from './helpers';
import { insertSteppedUpSession } from './session-helpers';

/** A point inside the MFA toggle's transaction: after its factor check under the lock, before it writes the flag. */
const hooks = vi.hoisted(() => ({ beforeWrite: undefined as (() => Promise<void>) | undefined }));

vi.mock('#/modules/me/me-queries', async (importOriginal) => {
  const actual = await importOriginal<typeof import('#/modules/me/me-queries')>();
  return {
    ...actual,
    updateUserMfa: async (...args: Parameters<typeof actual.updateUserMfa>) => {
      await hooks.beforeWrite?.();
      return actual.updateUserMfa(...args);
    },
  };
});

/** Whether MFA is on, and how many factors of each kind the account holds. */
const stateOf = async (userId: string) => {
  const [user] = await db.select({ mfaRequired: usersTable.mfaRequired }).from(usersTable).where(eq(usersTable.id, userId));
  const totps = await db.select().from(totpsTable).where(eq(totpsTable.userId, userId));
  const passkeys = await passkeysOf(userId);
  return { mfaRequired: user.mfaRequired, totps: totps.length, passkeys: passkeys.length };
};

/** Whether some query waits for a lock another transaction holds. */
const aQueryWaitsForALock = async () => {
  const result = await getAdminDb('mfa factor race test').execute<{ waiting: number }>(
    sql`select count(*)::int as waiting from pg_locks where not granted`,
  );
  return result.rows[0].waiting > 0;
};

afterEach(async () => {
  hooks.beforeWrite = undefined;
  await clearSecurityTestData();
});

/**
 * MFA keeps both factors (`mfaFactorRules`). Turning MFA on and deleting a factor check each other's work, so they must
 * take turns: otherwise each passes its check against the state before the other one's write.
 */
describe('MFA factor rules under concurrent requests', async () => {
  const call = await createAppClient();

  /** An account with a passkey and an authenticator app, MFA off, and a session that stepped up. */
  async function userWithBothFactors() {
    const user = await createTotpUser(`race-${nanoid(8)}@security-test.com`);
    await db.update(usersTable).set({ mfaRequired: false }).where(eq(usersTable.id, user.id));
    await insertPasskey(user);
    return { user, headers: (await insertSteppedUpSession(user)).headers };
  }

  it('must not leave MFA on with one factor via deleting the authenticator app while the toggle writes', async () => {
    const { user, headers } = await userWithBothFactors();

    // The delete arrives after the toggle checked the factors under its lock, before it writes: it waits for the lock
    // and then finds MFA on.
    let deleteStatus: Promise<number> | undefined;
    hooks.beforeWrite = async () => {
      let settled = false;
      deleteStatus = call(deleteTotp, { headers })
        .then(({ response }) => response.status)
        .finally(() => {
          settled = true;
        });
      await vi.waitFor(async () => expect(settled || (await aQueryWaitsForALock())).toBe(true), { timeout: 5000, interval: 10 });
    };
    const enabled = await call(toggleMfa, { body: { mfaRequired: true }, headers });

    expect(enabled.response.status).toBe(200);
    expect(await deleteStatus).toBe(400);
    expect(await stateOf(user.id)).toEqual({ mfaRequired: true, totps: 1, passkeys: 1 });
  });

  it('turns MFA on with both factors when nothing races it (positive control)', async () => {
    const { user, headers } = await userWithBothFactors();

    const enabled = await call(toggleMfa, { body: { mfaRequired: true }, headers });
    expect(enabled.response.status).toBe(200);
    expect(await stateOf(user.id)).toEqual({ mfaRequired: true, totps: 1, passkeys: 1 });
  });
});
