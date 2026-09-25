import { eq } from 'drizzle-orm';
import { afterAll, afterEach, beforeAll, describe, expect, it, onTestFinished, vi } from 'vitest';
import { baseDb as db, getAdminDb } from '#/db/db';
import { env } from '#/env';
import { sessionsTable } from '#/modules/auth/sessions-db';
import { streamSubscriberManager } from '#/modules/entities/stream';
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
  type TestSession,
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

  it('tells a stream to reconnect once its user gains the system role, so it gets system-admin reads', async () => {
    const [promoted, regular] = [
      await createTestUser('promoted@security-test.com'),
      await createTestUser('regular@security-test.com'),
    ];
    const [promotedSession, regularSession] = [await insertSession(promoted), await insertSession(regular)];
    const promotedStream = await openStream(promoted.id, promotedSession);
    const regularStream = await openStream(regular.id, regularSession);

    // system_roles is written by operators, outside the API.
    await getAdminDb('test arrange')
      .insert(systemRolesTable)
      .values({ id: promoted.id, userId: promoted.id, role: 'admin', createdAt: new Date().toISOString() });

    vi.advanceTimersByTime(SWEEP_INTERVAL_MS);

    await expectClosedWith(promotedStream, 'access_changed');
    expectStillOpen(regular.id, regularStream);
  });

  it('keeps an admin stream from an address the role may not be used from, with no reconnect loop', async () => {
    const allowlistBefore = env.SYSTEM_ADMIN_IP_ALLOWLIST;
    Object.assign(env, { SYSTEM_ADMIN_IP_ALLOWLIST: '10.0.0.1' });
    onTestFinished(() => void Object.assign(env, { SYSTEM_ADMIN_IP_ALLOWLIST: allowlistBefore }));

    const admin = await createSystemAdminUser('remote-admin@security-test.com');
    const [adminSession, revoked] = [await insertSession(admin), await insertSession(admin)];
    const fromElsewhere = (session: TestSession) => ({
      ...session,
      headers: { ...session.headers, 'x-forwarded-for': '10.0.0.2' },
    });
    const adminStream = await openStream(admin.id, fromElsewhere(adminSession));
    const revokedStream = await openStream(admin.id, fromElsewhere(revoked));

    await stamp(revoked.id, { revokedAt: new Date().toISOString(), revocationReason: 'other_session' });
    vi.advanceTimersByTime(SWEEP_INTERVAL_MS);

    // The sweep ran and found the role; the stream never read as system admin from this address, so nothing changed.
    await expectClosedWith(revokedStream, 'unauthorized');
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

  it('must not close a stream without a session, such as a public stream an app registers, via the session sweep', async () => {
    const user = await createTestUser('app-stream@security-test.com');
    const [revoked, live] = [await insertSession(user), await insertSession(user)];
    const revokedStream = await openStream(user.id, revoked);
    const liveStream = await openStream(user.id, live);

    const publicStream = { aborted: false, written: [] as unknown[] };
    Object.assign(publicStream, {
      writeSSE: async (message: unknown) => void publicStream.written.push(message),
      abort: () => (publicStream.aborted = true),
      close: async () => {},
    });
    // A stub stream records what the sweep does to it; it implements only the calls a close makes.
    const publicSubscriber = { id: 'public-stream', channel: 'public:board', stream: publicStream } as never;
    streamSubscriberManager.register(publicSubscriber);
    onTestFinished(() => streamSubscriberManager.unregister('public-stream'));

    await stamp(revoked.id, { revokedAt: new Date().toISOString(), revocationReason: 'other_session' });
    vi.advanceTimersByTime(SWEEP_INTERVAL_MS);

    await expectClosedWith(revokedStream, 'unauthorized');
    expectStillOpen(user.id, liveStream);
    expect(streamSubscriberManager.getByChannel('public:board').map(({ id }) => id)).toEqual(['public-stream']);
    expect(publicStream).toMatchObject({ aborted: false, written: [] });
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
