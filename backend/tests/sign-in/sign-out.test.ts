import { eq } from 'drizzle-orm';
import { getMe, getMyAuth, revokeMySessions, signOut } from 'sdk';
import { nanoid } from 'shared/utils/nanoid';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { baseDb as db } from '#/db/db';
import { sessionsTable } from '#/modules/auth/sessions-db';
import { hashToken } from '#/utils/hash-token';
import { defaultHeaders } from '../fixtures';
import { authCookie, createTestUser, insertTestSession } from '../helpers';
import { createAppClient } from '../test-client';
import { clearDatabase, mockFetchRequest, setTestConfig } from '../test-utils';

setTestConfig({ enabledAuthStrategies: ['passkey'] });

beforeAll(async () => {
  mockFetchRequest();
});

afterEach(async () => await clearDatabase());

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
    const { id: victimSessionId, cookie: victimCookie } = await insertTestSession(victim);
    const victimHeaders = { ...defaultHeaders, Cookie: victimCookie };

    // The victim's session is cached, so a sign-out that trusted a cached session id would find it.
    expect((await call(getMe, { headers: victimHeaders })).response.status).toBe(200);

    // Forge a cookie naming the victim's session id with an attacker-chosen secret, signed so only the secret is wrong.
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
    const session = await insertTestSession(user);
    const headers = { ...defaultHeaders, Cookie: session.cookie };

    // Cache the session first, so the 401 below proves sign-out drops the cached entry.
    expect((await call(getMe, { headers })).response.status).toBe(200);

    const { response } = await call(signOut, { headers });
    expect(response.status).toBe(204);

    const row = await findSession(session.id);
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
    const current = await insertTestSession(user);
    const other = await insertTestSession(user);
    const stranger = await createTestUser('stranger@example.com');
    const strangerSession = await insertTestSession(stranger);
    const headers = { ...defaultHeaders, Cookie: current.cookie };

    const { data, response } = await call(revokeMySessions, {
      body: { ids: [other.id, strangerSession.id] },
      headers,
    });
    expect(response.status).toBe(200);
    expect(data).toMatchObject({
      data: [{ id: other.id, revokedBy: user.id, revocationReason: 'other_session' }],
      rejectedIds: [strangerSession.id],
    });

    expect((await findSession(other.id)).revokedAt).not.toBeNull();
    expect((await findSession(strangerSession.id)).revokedAt).toBeNull();

    // The revoked session stays in the list, and the current one still authenticates.
    const auth = await call(getMyAuth, { headers });
    expect(auth.response.status).toBe(200);
    const listed = (auth.data as { sessions: { id: string; revokedAt: string | null }[] }).sessions;
    expect(listed.find((session) => session.id === other.id)?.revokedAt).not.toBeNull();

    // A second revoke finds no live row for that id and rejects it: the first stamp stays.
    const again = await call(revokeMySessions, { body: { ids: [other.id] }, headers });
    expect(again.data).toMatchObject({ data: [], rejectedIds: [other.id] });
  });

  it('revoking the current session is a sign-out', async () => {
    const user = await createTestUser('owner@example.com');
    const current = await insertTestSession(user);
    const headers = { ...defaultHeaders, Cookie: current.cookie };

    const { response } = await call(revokeMySessions, { body: { ids: [current.id] }, headers });
    expect(response.status).toBe(200);
    expect((await findSession(current.id)).revocationReason).toBe('sign_out');

    const afterwards = await call(getMe, { headers });
    expect(afterwards.response.status).toBe(401);
  });
});
