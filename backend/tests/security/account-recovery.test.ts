import { removeUserPasskeys, removeUserTotp, revokeUserSessions } from 'sdk';
import { afterEach, describe, expect, it } from 'vitest';
import { baseDb as db } from '#/db/db';
import { passkeysTable } from '#/modules/auth/flows/passkeys/passkeys-db';
import { defaultHeaders } from '../fixtures';
import {
  createSystemAdminUser,
  createTestSession,
  createTestUser,
  createTotpUser,
  enableMFAForUser,
  expectRefusal,
  getUserByEmail,
  insertTestSession,
  mailsTo,
  sessionsOf,
  waitForMail,
} from '../helpers';
import { createAppClient } from '../test-client';
import { clearDatabase } from '../test-utils';

afterEach(async () => await clearDatabase());

const passkeyRow = (userId: string) => ({ userId, credentialId: `cred-${userId}`, publicKey: 'pQECAyYgASFYIA', counter: 0, nameOnDevice: 'Laptop' });

describe('account recovery by a system administrator', async () => {
  const call = await createAppClient();

  /** A system administrator's session with a recent step-up, as the recovery routes require. */
  const adminHeaders = async () => {
    const admin = await createSystemAdminUser(`recovery-admin-${Date.now()}@security-test.com`);
    return { ...defaultHeaders, Cookie: await createTestSession(admin, { steppedUpVia: 'passkey' }) };
  };
  const mailTypesTo = (email: string) => mailsTo(email).map(({ statics }) => statics.type);

  it('ends every session of the user, marked as the administrator’s act, and mails the person', async () => {
    const user = await createTestUser('locked-out@security-test.com');
    await insertTestSession(user);
    await insertTestSession(user, { authStrategy: 'magic' });

    const { data, response } = await call(revokeUserSessions, { path: { userId: user.id }, headers: await adminHeaders() });

    expect(response.status).toBe(200);
    expect(data).toEqual({ revoked: 2 });
    const sessions = await sessionsOf(user.id);
    expect(sessions.map((session) => session.revocationReason)).toEqual(['admin_revoke', 'admin_revoke']);
    await waitForMail(() => expect(mailTypesTo(user.email)).toContain('admin-sessions-revoked'));
  });

  it('removing the last required factor turns MFA off, and both are mailed', async () => {
    const user = await createTotpUser('lost-phone@security-test.com');
    await db.insert(passkeysTable).values(passkeyRow(user.id));
    await enableMFAForUser(user.id);

    const passkeys = await call(removeUserPasskeys, { path: { userId: user.id }, headers: await adminHeaders() });
    expect(passkeys.data).toEqual({ removed: 1, mfaDisabled: true });
    expect((await getUserByEmail(user.email))[0].mfaRequired).toBe(false);
    await waitForMail(() => expect(mailTypesTo(user.email)).toEqual(expect.arrayContaining(['admin-passkeys-removed', 'mfa-disabled'])));

    // With MFA off already, removing the authenticator is only that.
    const totp = await call(removeUserTotp, { path: { userId: user.id }, headers: await adminHeaders() });
    expect(totp.data).toEqual({ removed: 1, mfaDisabled: false });
    await waitForMail(() => expect(mailTypesTo(user.email)).toContain('admin-totp-removed'));
  });

  it('is refused without the system role, and without a recent proof of presence', async () => {
    const user = await createTestUser('target@security-test.com');
    const member = await createTestUser('member@security-test.com');
    const admin = await createSystemAdminUser('cold-admin@security-test.com');

    const asMember = await call(revokeUserSessions, {
      path: { userId: user.id },
      headers: { ...defaultHeaders, Cookie: await createTestSession(member) },
    });
    expect(asMember.response.status).toBe(403);

    const coldAdmin = { ...defaultHeaders, Cookie: await createTestSession(admin, { ageMs: 60 * 60 * 1000 }) };
    await expectRefusal(await call(removeUserPasskeys, { path: { userId: user.id }, headers: coldAdmin }), 403, 'step_up_required');
    expect((await sessionsOf(user.id)).length).toBe(0);
  });
});
