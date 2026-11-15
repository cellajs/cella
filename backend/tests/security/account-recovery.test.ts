import { removeUserFactor, revokeUserSessions } from 'sdk';
import { afterEach, describe, expect, it } from 'vitest';
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
import { insertPasskey } from './helpers';

afterEach(async () => await clearDatabase());

describe('account recovery by a system administrator', async () => {
  const call = await createAppClient();

  /** A system administrator who holds a passkey and proved it on this session: what the recovery routes require. */
  const signedInAdmin = async (email = `recovery-admin-${Date.now()}@security-test.com`) => {
    const admin = await createSystemAdminUser(email);
    await insertPasskey(admin);
    return { admin, headers: { ...defaultHeaders, Cookie: await createTestSession(admin, { steppedUpVia: 'passkey' }) } };
  };
  const mailTypesTo = (email: string) => mailsTo(email).map(({ statics }) => statics.type);

  it('ends every session of the user, marked as the administrator’s act, and mails the person', async () => {
    const user = await createTestUser('locked-out@security-test.com');
    await insertTestSession(user);
    await insertTestSession(user, { authStrategy: 'magic' });
    const { headers } = await signedInAdmin();

    const { data, response } = await call(revokeUserSessions, { path: { userId: user.id }, headers });

    expect(response.status).toBe(200);
    expect(data).toEqual({ revoked: 2 });
    const sessions = await sessionsOf(user.id);
    expect(sessions.map((session) => session.revocationReason)).toEqual(['admin_revoke', 'admin_revoke']);
    await waitForMail(() => expect(mailTypesTo(user.email)).toContain('admin-sessions-revoked'));
  });

  it('removing the last required factor turns MFA off, and both are mailed', async () => {
    const user = await createTotpUser('lost-phone@security-test.com');
    await insertPasskey(user);
    await enableMFAForUser(user.id);
    const { headers } = await signedInAdmin();

    const passkeys = await call(removeUserFactor, { path: { userId: user.id, factor: 'passkey' }, headers });
    expect(passkeys.data).toEqual({ removed: 1, mfaDisabled: true });
    expect((await getUserByEmail(user.email))[0].mfaRequired).toBe(false);
    await waitForMail(() => expect(mailTypesTo(user.email)).toEqual(expect.arrayContaining(['admin-passkeys-removed', 'mfa-disabled'])));

    // With MFA off already, removing the authenticator is only that.
    const totp = await call(removeUserFactor, { path: { userId: user.id, factor: 'totp' }, headers });
    expect(totp.data).toEqual({ removed: 1, mfaDisabled: false });
    await waitForMail(() => expect(mailTypesTo(user.email)).toContain('admin-totp-removed'));
  });

  it('is refused without the system role, without a proven factor, for the own account and for another administrator', async () => {
    const user = await createTestUser('target@security-test.com');
    const member = await createTestUser('member@security-test.com');
    const coldAdmin = await createSystemAdminUser('cold-admin@security-test.com');
    const { admin, headers } = await signedInAdmin('warm-admin@security-test.com');

    const asMember = await call(revokeUserSessions, {
      path: { userId: user.id },
      headers: { ...defaultHeaders, Cookie: await createTestSession(member) },
    });
    expect(asMember.response.status).toBe(403);

    // A recent sign-in is no factor: the removal of someone's factor needs one of the administrator's own.
    const cold = { ...defaultHeaders, Cookie: await createTestSession(coldAdmin) };
    await expectRefusal(await call(removeUserFactor, { path: { userId: user.id, factor: 'passkey' }, headers: cold }), 403, 'step_up_required');

    await expectRefusal(await call(revokeUserSessions, { path: { userId: admin.id }, headers }), 400, 'invalid_request');
    await expectRefusal(await call(revokeUserSessions, { path: { userId: coldAdmin.id }, headers }), 403, 'forbidden');
    expect((await sessionsOf(user.id)).length).toBe(0);
  });
});
