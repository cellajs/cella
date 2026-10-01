import { eq } from 'drizzle-orm';
import { deleteMe, deleteUsers, revokeMySessions, signOut, startImpersonation, stopImpersonation, toggleMfa } from 'sdk';
import { appConfig } from 'shared';
import { nanoid } from 'shared/utils/nanoid';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { baseDb as db } from '#/db/db';
import { createSession, type SignInContext } from '#/modules/auth/general/helpers/session';
import { usersTable } from '#/modules/user/user-db';
import { adminRole, overrideConfig } from '../fixtures';
import {
  authCookie,
  createOrganizationAdminUser,
  createSystemAdminUser,
  createTestOrganization,
  createTestUser,
  createTotpUser,
  expectRefusal,
  sessionRow,
} from '../helpers';
import { createAppClient } from '../test-client';
import { setTestConfig } from '../test-utils';
import { clearSecurityTestData, insertPasskey } from './helpers';
import {
  asSession,
  cancelOpenStreams,
  expectClosedWith,
  expectReleased,
  expectSignedOut,
  expectStillOpen,
  impersonationSetBy,
  insertSession,
  insertSteppedUpSession,
  openStream,
  openUnreadStream,
  sessionSetBy,
  warmSession,
} from './session-helpers';

setTestConfig({ enabledAuthStrategies: ['passkey', 'totp'] });

afterEach(async () => {
  await cancelOpenStreams();
  await clearSecurityTestData();
});

/**
 * Every way a session ends must reach what the session left behind: the auth cache (up to 72 s per entry) and an open
 * SSE stream, which otherwise keeps delivering the account's events. Each test warms the cache first, so a 401
 * afterwards proves the cached entry was dropped, and keeps another session of the same user as a positive control.
 */
describe('Ending a session closes its stream and its cached entry', async () => {
  const call = await createAppClient();

  it('must not keep a signed-out session live via its open stream or the auth cache', async () => {
    const user = await createTestUser('sign-out@security-test.com');
    const [ending, other] = [await insertSession(user), await insertSession(user)];
    await warmSession(ending);
    await warmSession(other);
    const [endingStream, otherStream] = [await openStream(user.id, ending), await openStream(user.id, other)];

    expect((await call(signOut, { headers: ending.headers })).response.status).toBe(204);

    await expectClosedWith(endingStream, 'unauthorized');
    await expectSignedOut(ending.cookie, 'session_revoked');
    expect(await sessionRow(ending.id)).toMatchObject({ revocationReason: 'sign_out', revokedBy: user.id });

    expectStillOpen(user.id, otherStream);
    await warmSession(other);
  });

  it('must not keep a session revoked from another device live via its open stream or the auth cache', async () => {
    const user = await createTestUser('revoke-other@security-test.com');
    const [current, revoked] = [await insertSession(user), await insertSession(user)];
    await warmSession(current);
    await warmSession(revoked);
    const [currentStream, revokedStream] = [await openStream(user.id, current), await openStream(user.id, revoked)];

    const { response } = await call(revokeMySessions, { body: { ids: [revoked.id] }, headers: current.headers });
    expect(response.status).toBe(200);

    await expectClosedWith(revokedStream, 'unauthorized');
    await expectSignedOut(revoked.cookie, 'session_revoked');
    expect(await sessionRow(revoked.id)).toMatchObject({ revocationReason: 'other_session', revokedBy: user.id });

    expectStillOpen(user.id, currentStream);
    await warmSession(current);
  });

  it("must not keep an ended session's stream live via another stream of the user that stopped reading", async () => {
    const user = await createTestUser('stalled-sibling@security-test.com');
    const [current, stalled, other] = [await insertSession(user), await insertSession(user), await insertSession(user)];
    // Opened first, so the ending meets it first.
    const stalledStream = await openUnreadStream(user.id, stalled);
    const otherStream = await openStream(user.id, other);
    const currentStream = await openStream(user.id, current);

    const { response } = await call(revokeMySessions, {
      body: { ids: [stalled.id, other.id] },
      headers: current.headers,
    });
    expect(response.status).toBe(200);

    await expectClosedWith(otherStream, 'unauthorized');
    await expectReleased(user.id, stalledStream);
    expectStillOpen(user.id, currentStream);
  });

  it('must not keep pre-MFA sessions live via their open streams or the auth cache once MFA is on', async () => {
    const user = await createTotpUser('mfa-on@security-test.com');
    await db.update(usersTable).set({ mfaRequired: false }).where(eq(usersTable.id, user.id));
    await insertPasskey(user);

    const current = await insertSteppedUpSession(user);
    const otherRegular = await insertSession(user);
    // Proven with a second factor while MFA was on before: enabling MFA again leaves it standing.
    const earlierMfa = await insertSession(user, { type: 'mfa' });
    for (const session of [current, otherRegular, earlierMfa]) await warmSession(session);
    const currentStream = await openStream(user.id, current);
    const otherStream = await openStream(user.id, otherRegular);
    const mfaStream = await openStream(user.id, earlierMfa);

    const { response } = await call(toggleMfa, { body: { mfaRequired: true }, headers: current.headers });
    expect(response.status).toBe(200);

    // This browser carries on with the mfa session the response set, so its stream closes with a code the client
    // reconnects on; the other browser lost its session for good.
    await expectClosedWith(currentStream, 'session_replaced');
    await expectClosedWith(otherStream, 'unauthorized');
    await expectSignedOut(current.cookie, 'session_revoked');
    await expectSignedOut(otherRegular.cookie, 'session_revoked');
    expect(await sessionRow(current.id)).toMatchObject({ revocationReason: 'replaced', revokedBy: user.id });
    expect(await sessionRow(otherRegular.id)).toMatchObject({ revocationReason: 'mfa_enabled', revokedBy: user.id });

    await warmSession(await sessionSetBy(response));
    expectStillOpen(user.id, mfaStream);
    await warmSession(earlierMfa);
  });

  describe('sign-in housekeeping', () => {
    const TEST_CAP = 2;
    let restoreCap = () => {};
    beforeAll(() => {
      restoreCap = overrideConfig(appConfig, { maxSessionsPerUser: TEST_CAP });
    });
    afterAll(() => restoreCap());

    const browser = (deviceId: string | null): SignInContext => ({
      rawIp: null,
      country: null,
      asn: null,
      device: { name: null, type: 'desktop', os: 'macOS', browser: 'Firefox' },
      deviceId,
    });

    /** Signs the user in from a browser, as every sign-in route does once its proof checked out. */
    const signIn = async (user: { id: string }, deviceId: string | null) => {
      const { sessionId, sessionToken } = await createSession(user, browser(deviceId), 'passkey');
      return asSession(sessionId, authCookie('session', sessionToken, 7 * 24 * 60 * 60));
    };

    it('must not keep a session evicted by the session cap live via its open stream or the auth cache', async () => {
      const user = await createTestUser('cap@security-test.com');
      const oldest = await insertSession(user, { ageMs: 120_000 });
      const newer = await insertSession(user, { ageMs: 60_000 });
      await warmSession(oldest);
      await warmSession(newer);
      const [oldestStream, newerStream] = [await openStream(user.id, oldest), await openStream(user.id, newer)];

      const newest = await signIn(user, null);

      await expectClosedWith(oldestStream, 'unauthorized');
      await expectSignedOut(oldest.cookie, 'session_revoked');
      expect(await sessionRow(oldest.id)).toMatchObject({ revocationReason: 'session_cap', revokedBy: null });

      expectStillOpen(user.id, newerStream);
      await warmSession(newer);
      await warmSession(newest);
    });

    it('must not keep a session replaced in the same browser live via its open stream or the auth cache', async () => {
      const user = await createTestUser('replace@security-test.com');
      const deviceId = nanoid(24);
      const earlier = await signIn(user, deviceId);
      const elsewhere = await signIn(user, nanoid(24));
      await warmSession(earlier);
      await warmSession(elsewhere);
      const [earlierStream, elsewhereStream] = [await openStream(user.id, earlier), await openStream(user.id, elsewhere)];

      const later = await signIn(user, deviceId);

      // The browser now holds the later session, so the client reconnects with it.
      await expectClosedWith(earlierStream, 'session_replaced');
      await expectSignedOut(earlier.cookie, 'session_revoked');
      expect(await sessionRow(earlier.id)).toMatchObject({ revocationReason: 'replaced', revokedBy: null });

      expectStillOpen(user.id, elsewhereStream);
      await warmSession(elsewhere);
      await warmSession(later);
    });
  });

  it('must not keep an impersonation session live via its open stream or the auth cache after it stops', async () => {
    const admin = await createSystemAdminUser('impersonator@security-test.com');
    const target = await createTestUser('impersonated@security-test.com');
    const adminSession = await insertSession(admin);
    const targetOwn = await insertSession(target);

    const started = await call(startImpersonation, { body: { targetUserId: target.id }, headers: adminSession.headers });
    expect(started.response.status).toBe(204);
    const impersonation = await impersonationSetBy(started.response, adminSession);
    await warmSession(impersonation);
    await warmSession(targetOwn);
    const impersonationStream = await openStream(target.id, impersonation);
    const targetOwnStream = await openStream(target.id, targetOwn);

    const stopped = await call(stopImpersonation, { headers: impersonation.headers });
    expect(stopped.response.status).toBe(204);

    // The browser returns to the admin's own session, so the client reconnects with it.
    await expectClosedWith(impersonationStream, 'session_replaced');
    await expectSignedOut(impersonation.cookie, 'session_revoked');
    expect(await sessionRow(impersonation.id)).toMatchObject({
      type: 'impersonation',
      revocationReason: 'impersonation_stopped',
      revokedBy: admin.id,
    });

    await warmSession(adminSession);
    expectStillOpen(target.id, targetOwnStream);
    await warmSession(targetOwn);
  });

  it('must not keep a deleted account live via its open streams or the auth cache', async () => {
    const user = await createTestUser('delete-me@security-test.com');
    const bystander = await createTestUser('bystander@security-test.com');
    const [current, other] = [await insertSession(user), await insertSession(user)];
    const bystanderSession = await insertSession(bystander);
    for (const session of [current, other, bystanderSession]) await warmSession(session);
    const currentStream = await openStream(user.id, current);
    const otherStream = await openStream(user.id, other);
    const bystanderStream = await openStream(bystander.id, bystanderSession);

    expect((await call(deleteMe, { headers: current.headers })).response.status).toBe(204);

    await expectClosedWith(currentStream, 'unauthorized');
    await expectClosedWith(otherStream, 'unauthorized');
    await expectSignedOut(current.cookie, 'no_session');
    await expectSignedOut(other.cookie, 'no_session');

    expectStillOpen(bystander.id, bystanderStream);
    await warmSession(bystanderSession);
  });

  it('keeps the sessions of an account whose deletion was refused (positive control)', async () => {
    const org = await createTestOrganization();
    // The only admin of an organization: the database refuses to delete the account.
    const soleAdmin = await createOrganizationAdminUser('sole-admin@security-test.com', org.id, adminRole, org.tenantId);
    const session = await insertSession(soleAdmin);
    await warmSession(session);
    const stream = await openStream(soleAdmin.id, session);

    const { error, response } = await call(deleteMe, { headers: session.headers });
    await expectRefusal({ response, error }, 409, 'last_admin');

    expectStillOpen(soleAdmin.id, stream);
    await warmSession(session);
  });

  it("must not keep a user a system admin deleted live via the user's open streams or the auth cache", async () => {
    const admin = await createSystemAdminUser('deleter@security-test.com');
    const adminSession = await insertSession(admin);
    const user = await createTestUser('deleted@security-test.com');
    const bystander = await createTestUser('bystander@security-test.com');
    const [first, second] = [await insertSession(user), await insertSession(user)];
    const bystanderSession = await insertSession(bystander);
    for (const session of [first, second, bystanderSession]) await warmSession(session);
    const firstStream = await openStream(user.id, first);
    const secondStream = await openStream(user.id, second);
    const bystanderStream = await openStream(bystander.id, bystanderSession);

    const { response } = await call(deleteUsers, { body: { ids: [user.id] }, headers: adminSession.headers });
    expect(response.status).toBe(200);

    await expectClosedWith(firstStream, 'unauthorized');
    await expectClosedWith(secondStream, 'unauthorized');
    await expectSignedOut(first.cookie, 'no_session');
    await expectSignedOut(second.cookie, 'no_session');

    expectStillOpen(bystander.id, bystanderStream);
    await warmSession(bystanderSession);
    await warmSession(adminSession);
  });
});
