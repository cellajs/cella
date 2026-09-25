import { eq } from 'drizzle-orm';
import { getMe, getMyAuth, revokeMySessions, signOut } from 'sdk';
import { nanoid } from 'shared/utils/nanoid';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { baseDb as db } from '#/db/db';
import { sessionsTable } from '#/modules/auth/sessions-db';
import { hashToken } from '#/utils/hash-token';
import { defaultHeaders } from '../fixtures';
import { authCookie, createTestSession, createTestUser } from '../helpers';
import { createAppClient } from '../test-client';
import { clearDatabase, mockFetchRequest, setTestConfig } from '../test-utils';

setTestConfig({ enabledAuthStrategies: ['passkey'] });

beforeAll(async () => {
  mockFetchRequest();
});

afterEach(async () => await clearDatabase());

/** The session id inside a `createTestSession` cookie: `<name>=<secret>.<sessionId>.` */
const sessionIdOf = (cookie: string) => cookie.split('=')[1].split('.')[1];

const findSession = async (id: string) => {
  const [row] = await db.select().from(sessionsTable).where(eq(sessionsTable.id, id));
  return row;
};

describe('Sign-out scoping', async () => {
  const call = await createAppClient();

  // GHSA-wmjr-v86c-m9jj: sign-out must validate the session secret against the DB
  // before revoking anything, so a forged cookie cannot revoke another user's session.
  it("should not revoke another user's session with a forged cookie", async () => {
    const victim = await createTestUser('victim@example.com');
    const victimCookie = await createTestSession(victim); // real session row
    const victimSessionId = sessionIdOf(victimCookie);
    const victimHeaders = { ...defaultHeaders, Cookie: victimCookie };

    // The victim's session is cached, so a sign-out that trusted a cached session id would find it.
    expect((await call(getMe, { headers: victimHeaders })).response.status).toBe(200);

    // Forge a cookie: victim's sessionId but an attacker-chosen (wrong) secret, signed so only the secret is wrong.
    const forgedSecret = hashToken(nanoid(40));
    const forgedContent = `${forgedSecret}.${victimSessionId}.`;
    const forgedCookie = authCookie('session', forgedContent);

    const { response: res } = await call(signOut, {
      headers: { ...defaultHeaders, Cookie: forgedCookie },
    });

    // The forged secret matches no session row → fail closed.
    expect(res.status).toBe(401);

    const remaining = await findSession(victimSessionId);
    expect(remaining.revokedAt).toBeNull();
    expect((await call(getMe, { headers: victimHeaders })).response.status).toBe(200);
  });
});

describe('Sign-out revokes the session', async () => {
  const call = await createAppClient();

  it('stamps the row with sign_out and keeps it; the cookie stops authenticating', async () => {
    const user = await createTestUser('owner@example.com');
    const cookie = await createTestSession(user);
    const headers = { ...defaultHeaders, Cookie: cookie };

    // Cache the session first, so the 401 below proves sign-out drops the cached entry.
    expect((await call(getMe, { headers })).response.status).toBe(200);

    const { response } = await call(signOut, { headers });
    expect(response.status).toBe(204);

    const row = await findSession(sessionIdOf(cookie));
    expect(row).toMatchObject({ revokedBy: user.id, revocationReason: 'sign_out' });
    expect(row.revokedAt).not.toBeNull();

    const afterwards = await call(getMe, { headers });
    expect(afterwards.response.status).toBe(401);
    expect(afterwards.error).toMatchObject({ type: 'session_revoked' });
  });
});

describe('Revoke my sessions', async () => {
  const call = await createAppClient();

  it('revokes another session of the user as other_session, lists it as revoked, and rejects a stranger session', async () => {
    const user = await createTestUser('owner@example.com');
    const current = await createTestSession(user);
    const other = await createTestSession(user);
    const stranger = await createTestUser('stranger@example.com');
    const strangerSession = await createTestSession(stranger);
    const headers = { ...defaultHeaders, Cookie: current };

    const { data, response } = await call(revokeMySessions, {
      body: { ids: [sessionIdOf(other), sessionIdOf(strangerSession)] },
      headers,
    });
    expect(response.status).toBe(200);
    expect(data).toMatchObject({
      data: [{ id: sessionIdOf(other), revokedBy: user.id, revocationReason: 'other_session' }],
      rejectedIds: [sessionIdOf(strangerSession)],
    });

    expect((await findSession(sessionIdOf(other))).revokedAt).not.toBeNull();
    expect((await findSession(sessionIdOf(strangerSession))).revokedAt).toBeNull();

    // The revoked session stays in the list, and the current one still authenticates.
    const auth = await call(getMyAuth, { headers });
    expect(auth.response.status).toBe(200);
    const listed = (auth.data as { sessions: { id: string; revokedAt: string | null }[] }).sessions;
    expect(listed.find((session) => session.id === sessionIdOf(other))?.revokedAt).not.toBeNull();

    // A second revoke finds no live row for that id and rejects it: the first stamp stays.
    const again = await call(revokeMySessions, { body: { ids: [sessionIdOf(other)] }, headers });
    expect(again.data).toMatchObject({ data: [], rejectedIds: [sessionIdOf(other)] });
  });

  it('revoking the current session is a sign-out', async () => {
    const user = await createTestUser('owner@example.com');
    const current = await createTestSession(user);
    const headers = { ...defaultHeaders, Cookie: current };

    const { response } = await call(revokeMySessions, { body: { ids: [sessionIdOf(current)] }, headers });
    expect(response.status).toBe(200);
    expect((await findSession(sessionIdOf(current))).revocationReason).toBe('sign_out');

    const afterwards = await call(getMe, { headers });
    expect(afterwards.response.status).toBe(401);
  });
});
