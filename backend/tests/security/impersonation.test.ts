import { eq } from 'drizzle-orm';
import { deleteUsers, getMe, revokeMySessions, signOut, startImpersonation } from 'sdk';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { getAdminDb } from '#/db/db';
import { invalidateCache } from '#/middlewares/guard/invalidate-cache';
import { authCookieName } from '#/modules/auth/general/helpers/cookie';
import { systemRolesTable } from '#/modules/system/system-roles-db';
import { defaultHeaders } from '../fixtures';
import { createSystemAdminUser, createTestUser, type ErrorResponse } from '../helpers';
import { createAppClient } from '../test-client';
import { mockFetchRequest } from '../test-utils';
import { clearSecurityTestData } from './helpers';
import {
  cancelOpenStreams,
  expectClosedWith,
  expectStillOpen,
  impersonationSetBy,
  insertSession,
  openStream,
  sessionRow,
  type TestSession,
} from './session-helpers';

beforeAll(() => mockFetchRequest());

afterEach(async () => {
  await cancelOpenStreams();
  await clearSecurityTestData();
});

/**
 * An impersonation is layered on the admin session that started it, in the same browser, and holds only while that
 * session does and its admin keeps the system role. Each test keeps an intact impersonation as the positive control.
 */
describe('impersonation lives on its admin', async () => {
  const call = await createAppClient();

  const meAs = async (session: TestSession) => {
    const { data, error, response } = await call(getMe, { headers: session.headers });
    return { status: response.status, userId: (data as { user: { id: string } } | undefined)?.user.id, error };
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

    expect((await meAs(impersonation)).status).toBe(200);
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
    expect(attempt.response.status).toBe(403);
    expect((attempt.error as ErrorResponse).type).toBe('impersonation_forbidden');
    const cookieNames = [authCookieName('session'), authCookieName('impersonation')];
    expect(
      attempt.response.headers.getSetCookie().some((line) => cookieNames.some((n) => line.startsWith(`${n}=`))),
    ).toBe(false);
    expect((await sessionRow(targetsOwn.id)).revokedAt).toBeNull();
    expect(await meAs(impersonation)).toMatchObject({ status: 200, userId: target.id });

    // The user's own session ends their other sessions (positive control).
    const other = await insertSession(target);
    const own = await call(revokeMySessions, { body: { ids: [other.id] }, headers: targetsOwn.headers });
    expect(own.response.status).toBe(200);
    expect((await sessionRow(other.id)).revocationReason).toBe('other_session');
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
    invalidateCache.user(admin.id);

    const refused = await meAs(impersonation);
    expect(refused.status).toBe(401);
    expect((refused.error as ErrorResponse).type).toBe('unauthorized');

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
