import { eq } from 'drizzle-orm';
import { afterAll, afterEach, beforeAll, describe, it, vi } from 'vitest';
import { baseDb as db, getAdminDb } from '#/db/db';
import { sessionsTable } from '#/modules/auth/sessions-db';
import { systemRolesTable } from '#/modules/system/system-roles-db';
import { usersTable } from '#/modules/user/user-db';
import { createSystemAdminUser, createTestUser } from '../helpers';
import { mockFetchRequest, setTestConfig } from '../test-utils';
import { clearSecurityTestData } from './helpers';
import {
  cancelOpenStreams,
  expectClosedWith,
  expectReleased,
  expectStillOpen,
  insertImpersonation,
  insertSession,
  openStream,
  openUnreadStream,
} from './session-helpers';

setTestConfig({ enabledAuthStrategies: ['passkey'] });

/** How often the stream sweep re-checks sessions; the tests move a fake clock past it. */
const SWEEP_INTERVAL_MS = 60_000;

beforeAll(() => {
  mockFetchRequest();
  // Only interval timers are fake: the sweep runs when a test moves the clock, the stream and the database in real time.
  vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
});

afterAll(() => vi.useRealTimers());

afterEach(async () => {
  await cancelOpenStreams();
  await clearSecurityTestData();
});

const stamp = (sessionId: string, values: Partial<typeof sessionsTable.$inferInsert>) =>
  db.update(sessionsTable).set(values).where(eq(sessionsTable.id, sessionId));

/**
 * An ending this process never hears of must still close the stream: another instance revoked the session, it
 * expired, or the user or their system role was deleted outside the API. The sweep re-checks every open stream once
 * a minute; each test keeps a stream on a live session open as the positive control.
 */
describe('The stream sweep closes streams whose session no longer holds', () => {
  it('must not keep streaming to a session revoked on another instance via its open stream', async () => {
    const user = await createTestUser('elsewhere@security-test.com');
    const [revoked, replaced, live] = [await insertSession(user), await insertSession(user), await insertSession(user)];
    const revokedStream = await openStream(user.id, revoked);
    const replacedStream = await openStream(user.id, replaced);
    const liveStream = await openStream(user.id, live);

    // Stamped by another instance: no in-process event reaches this one.
    const revokedAt = new Date().toISOString();
    await stamp(revoked.id, { revokedAt, revokedBy: user.id, revocationReason: 'other_session' });
    await stamp(replaced.id, { revokedAt, revocationReason: 'replaced' });

    vi.advanceTimersByTime(SWEEP_INTERVAL_MS);

    await expectClosedWith(revokedStream, 'unauthorized');
    await expectClosedWith(replacedStream, 'session_replaced');
    expectStillOpen(user.id, liveStream);
  });

  it('must not keep streaming to an expired session via its open stream', async () => {
    const user = await createTestUser('expired@security-test.com');
    const [expired, live] = [await insertSession(user), await insertSession(user)];
    const expiredStream = await openStream(user.id, expired);
    const liveStream = await openStream(user.id, live);

    await stamp(expired.id, { expiresAt: new Date(Date.now() - 1000).toISOString() });

    vi.advanceTimersByTime(SWEEP_INTERVAL_MS);

    await expectClosedWith(expiredStream, 'unauthorized');
    expectStillOpen(user.id, liveStream);
  });

  it('must not keep streaming to a user deleted outside the API via their open stream', async () => {
    const [user, bystander] = [
      await createTestUser('removed@security-test.com'),
      await createTestUser('bystander@security-test.com'),
    ];
    const [removed, kept] = [await insertSession(user), await insertSession(bystander)];
    const removedStream = await openStream(user.id, removed);
    const keptStream = await openStream(bystander.id, kept);

    // The session rows go with the user.
    await getAdminDb('test arrange').delete(usersTable).where(eq(usersTable.id, user.id));

    vi.advanceTimersByTime(SWEEP_INTERVAL_MS);

    await expectClosedWith(removedStream, 'unauthorized');
    expectStillOpen(bystander.id, keptStream);
  });

  it('must not keep system-admin reads on a stream via a system role that was removed', async () => {
    const [demoted, admin] = [
      await createSystemAdminUser('demoted@security-test.com'),
      await createSystemAdminUser('still-admin@security-test.com'),
    ];
    const [demotedSession, adminSession] = [await insertSession(demoted), await insertSession(admin)];
    const demotedStream = await openStream(demoted.id, demotedSession);
    const adminStream = await openStream(admin.id, adminSession);

    // system_roles is written by operators, outside the API.
    await getAdminDb('test arrange').delete(systemRolesTable).where(eq(systemRolesTable.userId, demoted.id));

    vi.advanceTimersByTime(SWEEP_INTERVAL_MS);

    // The session still holds, so the client reconnects and the stream is rebuilt without system-admin reads.
    await expectClosedWith(demotedStream, 'access_changed');
    expectStillOpen(admin.id, adminStream);
  });

  it('must not stall the sweep of every stream via a client that stopped reading', async () => {
    const [stalled, other] = [
      await createTestUser('stalled@security-test.com'),
      await createTestUser('other@security-test.com'),
    ];
    const [stalledSession, otherSession] = [await insertSession(stalled), await insertSession(other)];
    // Opened first, so the sweep meets it first.
    const stalledStream = await openUnreadStream(stalled.id, stalledSession);
    const otherStream = await openStream(other.id, otherSession);

    const revokedAt = new Date().toISOString();
    await stamp(stalledSession.id, { revokedAt, revocationReason: 'other_session' });
    await stamp(otherSession.id, { revokedAt, revocationReason: 'other_session' });

    vi.advanceTimersByTime(SWEEP_INTERVAL_MS);

    await expectClosedWith(otherStream, 'unauthorized');
    await expectReleased(stalled.id, stalledStream);

    // Later sweeps still run: a session revoked after the stalled close is swept on the next tick.
    const late = await insertSession(other);
    const lateStream = await openStream(other.id, late);
    await stamp(late.id, { revokedAt: new Date().toISOString(), revocationReason: 'other_session' });
    await new Promise((resolve) => setTimeout(resolve, 50));
    vi.advanceTimersByTime(SWEEP_INTERVAL_MS);
    await expectClosedWith(lateStream, 'unauthorized');
  });

  it('must not keep streaming to an impersonation via its open stream once its admin lost the session or the role', async () => {
    const [demoted, expiring, admin] = [
      await createSystemAdminUser('demoted-impersonator@security-test.com'),
      await createSystemAdminUser('expiring-impersonator@security-test.com'),
      await createSystemAdminUser('impersonator@security-test.com'),
    ];
    const target = await createTestUser('impersonated@security-test.com');
    const [demotedSession, expiringSession, adminSession] = [
      await insertSession(demoted),
      await insertSession(expiring),
      await insertSession(admin),
    ];
    const demotedStream = await openStream(target.id, await insertImpersonation(demotedSession, target));
    const expiringStream = await openStream(target.id, await insertImpersonation(expiringSession, target));
    const keptStream = await openStream(target.id, await insertImpersonation(adminSession, target));

    // Outside the API: an operator removes a role, and a session expires without a stamp.
    await getAdminDb('test arrange').delete(systemRolesTable).where(eq(systemRolesTable.userId, demoted.id));
    await stamp(expiringSession.id, { expiresAt: new Date(Date.now() - 1000).toISOString() });

    vi.advanceTimersByTime(SWEEP_INTERVAL_MS);

    await expectClosedWith(demotedStream, 'unauthorized');
    await expectClosedWith(expiringStream, 'unauthorized');
    expectStillOpen(target.id, keptStream);
  });
});
