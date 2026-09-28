import { eq } from 'drizzle-orm';
import { deleteUsers, getMe, revokeMySessions, signOut, startImpersonation } from 'sdk';
import { appConfig } from 'shared';
import { afterEach, describe, expect, it, onTestFinished } from 'vitest';
import { baseDb, getAdminDb } from '#/db/db';
import { env } from '#/env';
import { invalidateCache } from '#/middlewares/guard/invalidate-cache';
import { systemRolesTable } from '#/modules/system/system-roles-db';
import { defaultHeaders, overrideConfig } from '../fixtures';
import {
  authCookie,
  cookieChange,
  createSystemAdminUser,
  createTestUser,
  expectRefusal,
  mailsTo,
  sessionRow,
  sessionsOf,
} from '../helpers';
import { createAppClient } from '../test-client';
import { clearSecurityTestData } from './helpers';
import {
  cancelOpenStreams,
  expectClosedWith,
  expectStillOpen,
  impersonationSetBy,
  insertSession,
  openStream,
  type TestSession,
} from './session-helpers';

afterEach(async () => {
  await cancelOpenStreams();
  await clearSecurityTestData();
});

/**
 * An impersonation is layered on the admin session that started it, in the same browser, and holds only while that
 * session does, its admin keeps the system role and the request comes from an address the role may be used from. Each
 * test keeps an intact impersonation as the positive control.
 */
describe('impersonation lives on its admin', async () => {
  const call = await createAppClient();

  const meAs = async (session: TestSession) => {
    const { data, error, response } = await call(getMe, { headers: session.headers });
    return { status: response.status, userId: (data as { user: { id: string } } | undefined)?.user.id, body: error };
  };

  /** A system admin with a session, impersonating a fresh user from it. */
  const impersonating = async (label: string) => {
    const admin = await createSystemAdminUser(`${label}-admin@security-test.com`);
    const adminSession = await insertSession(admin);
    const target = await createTestUser(`${label}-target@security-test.com`);
    const started = await call(startImpersonation, {
      body: { targetUserId: target.id },
      headers: adminSession.headers,
    });
    expect(started.response.status).toBe(204);
    const impersonation = await impersonationSetBy(started.response, adminSession);
    expect(await meAs(impersonation)).toMatchObject({ status: 200, userId: target.id });
    return { admin, adminSession, target, impersonation };
  };

  it("must not act as the impersonated user via an impersonation cookie without its admin's session", async () => {
    const { adminSession, impersonation } = await impersonating('detached');
    const other = await createTestUser('other-browser@security-test.com');
    const otherSession = await insertSession(other);
    const impersonationCookie = impersonation.cookie.slice(adminSession.cookie.length + 2);

    const alone = await meAs({ ...impersonation, headers: { ...defaultHeaders, Cookie: impersonationCookie } });
    expect(alone.status).toBe(401);
    const elsewhere = await meAs({
      ...impersonation,
      headers: { ...defaultHeaders, Cookie: `${otherSession.cookie}; ${impersonationCookie}` },
    });
    expect(elsewhere.status).toBe(401);
    // Its token signed as a session cookie, as a leaked cookie secret allows: an impersonation is never a session.
    const token = decodeURIComponent(impersonationCookie.slice(impersonationCookie.indexOf('=') + 1)).split('.')[0];
    const asSession = await meAs({
      ...impersonation,
      headers: { ...defaultHeaders, Cookie: authCookie('session', token) },
    });
    await expectRefusal(asSession, 401, 'unauthorized');

    expect((await meAs(impersonation)).status).toBe(200);
  });

  it('must not act as the impersonated user via an address the system role may not be used from', async () => {
    const { target, impersonation } = await impersonating('remote');
    onTestFinished(overrideConfig(env, { SYSTEM_ADMIN_IP_ALLOWLIST: '10.0.0.1' }));
    const from = (ip: string) => ({ ...impersonation, headers: { ...impersonation.headers, 'x-forwarded-for': ip } });

    const refused = await meAs(from('10.0.0.2'));
    await expectRefusal(refused, 401, 'unauthorized');

    expect(await meAs(from('10.0.0.1'))).toMatchObject({ status: 200, userId: target.id });
  });

  it('must not keep an impersonation live via its cookie or stream once the admin revokes the session behind it', async () => {
    const { admin, target, impersonation } = await impersonating('revoked');
    const kept = await impersonating('kept');
    const stream = await openStream(target.id, impersonation);
    const keptStream = await openStream(kept.target.id, kept.impersonation);
    // The admin, on another device, signs the impersonating browser out.
    const elsewhere = await insertSession(admin);
    const adminSessionId = (await sessionRow(impersonation.id)).impersonatorSessionId as string;

    const revoked = await call(revokeMySessions, { body: { ids: [adminSessionId] }, headers: elsewhere.headers });
    expect(revoked.response.status).toBe(200);

    await expectClosedWith(stream, 'session_replaced');
    expect(await sessionRow(impersonation.id)).toMatchObject({
      revocationReason: 'impersonation_stopped',
      revokedBy: admin.id,
    });
    expect((await meAs(impersonation)).status).toBe(401);

    expectStillOpen(kept.target.id, keptStream);
    expect(await meAs(kept.impersonation)).toMatchObject({ status: 200, userId: kept.target.id });
  });

  it("must not end the impersonated user's sessions via the impersonation", async () => {
    const { target, impersonation } = await impersonating('revoking');
    const targetsOwn = await insertSession(target);

    const attempt = await call(revokeMySessions, {
      body: { ids: [targetsOwn.id, impersonation.id] },
      headers: impersonation.headers,
    });
    await expectRefusal(attempt, 403, 'impersonation_forbidden');
    expect(cookieChange(attempt.response, 'session')).toBeUndefined();
    expect(cookieChange(attempt.response, 'impersonation')).toBeUndefined();
    expect((await sessionRow(targetsOwn.id)).revokedAt).toBeNull();
    expect(await meAs(impersonation)).toMatchObject({ status: 200, userId: target.id });

    // The user's own session ends their other sessions (positive control).
    const other = await insertSession(target);
    const own = await call(revokeMySessions, { body: { ids: [other.id] }, headers: targetsOwn.headers });
    expect(own.response.status).toBe(200);
    expect((await sessionRow(other.id)).revocationReason).toBe('other_session');
  });

  it('must not start a second impersonation via an impersonation', async () => {
    const { target, impersonation } = await impersonating('layering');
    const other = await createTestUser('layering-other@security-test.com');

    const attempt = await call(startImpersonation, {
      body: { targetUserId: other.id },
      headers: impersonation.headers,
    });
    await expectRefusal(attempt, 403, 'impersonation_forbidden');
    expect(cookieChange(attempt.response, 'impersonation')).toBeUndefined();
    expect(await sessionsOf(other.id)).toHaveLength(0);
    // Refused as an impersonation, not as a user without the system role: no security alert goes out for the admin.
    expect(mailsTo(appConfig.securityEmail)).toHaveLength(0);
    expect(await meAs(impersonation)).toMatchObject({ status: 200, userId: target.id });
  });

  it('must not keep an impersonation live once its admin signs out', async () => {
    const { impersonation } = await impersonating('signed-out');
    const kept = await impersonating('kept');

    expect((await call(signOut, { headers: impersonation.headers })).response.status).toBe(204);

    expect(await sessionRow(impersonation.id)).toMatchObject({ revocationReason: 'impersonation_stopped' });
    expect((await meAs(impersonation)).status).toBe(401);
    expect(await meAs(kept.impersonation)).toMatchObject({ status: 200, userId: kept.target.id });
  });

  it('must not keep an impersonation live via its cookie once its admin lost the system role', async () => {
    const { admin, impersonation } = await impersonating('demoted');
    const kept = await impersonating('kept');

    // Roles change outside the API; the change listener drops the admin's cached sessions.
    await getAdminDb('test arrange').delete(systemRolesTable).where(eq(systemRolesTable.userId, admin.id));
    await invalidateCache.user(baseDb, admin.id);

    const refused = await meAs(impersonation);
    await expectRefusal(refused, 401, 'unauthorized');

    expect(await meAs(kept.impersonation)).toMatchObject({ status: 200, userId: kept.target.id });
  });

  it("must not keep an impersonation live via its cookie once its admin's account is deleted", async () => {
    const { admin, impersonation } = await impersonating('deleted');
    const kept = await impersonating('kept');

    const deleted = await call(deleteUsers, { body: { ids: [admin.id] }, headers: kept.adminSession.headers });
    expect(deleted.response.status).toBe(200);

    expect((await meAs(impersonation)).status).toBe(401);
    expect(await sessionRow(impersonation.id)).toBeUndefined();

    expect(await meAs(kept.impersonation)).toMatchObject({ status: 200, userId: kept.target.id });
  });
});
