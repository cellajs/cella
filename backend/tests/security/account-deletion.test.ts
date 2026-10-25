import { eq } from 'drizzle-orm';
import { deleteMe, getMe } from 'sdk';
import { afterEach, describe, expect, it } from 'vitest';
import { baseDb } from '#/db/db';
import { actorsTable } from '#/modules/actors/actors-db';
import { defaultHeaders } from '../fixtures';
import { createTestSession, createTestUser, expectRefusal, sessionsOf } from '../helpers';
import { createAppClient } from '../test-client';
import { clearDatabase, setTestConfig } from '../test-utils';
import { insertPasskey, passkeysOf } from './helpers';

setTestConfig({ enabledAuthStrategies: ['passkey'] });

afterEach(async () => await clearDatabase());

describe('Account deletion invalidates sessions', async () => {
  const call = await createAppClient();

  // GHSA-2vg6-77g8-24mp: deleting a user must not leave stale sessions behind.
  it("must not keep a deleted account's sessions or passkeys via its session cookie", async () => {
    const user = await createTestUser('deleter@example.com');
    const sessionCookie = await createTestSession(user);
    const headers = { ...defaultHeaders, Cookie: sessionCookie };
    // A second, independent session for the same user.
    await createTestSession(user);
    await insertPasskey(user);

    // Cache the session first, so the 401 below proves the deletion drops the cached entry.
    expect((await call(getMe, { headers })).response.status).toBe(200);

    const { response: res } = await call(deleteMe, { headers });

    expect(res.status).toBe(204);

    const afterwards = await call(getMe, { headers });
    await expectRefusal(afterwards, 401, 'no_session');

    expect(await sessionsOf(user.id)).toHaveLength(0);

    expect(await passkeysOf(user.id)).toHaveLength(0);
  });

  // The actor row stays as the credit on content; the times it kept say when this person was last around.
  it("must not keep a deleted account's activity times", async () => {
    const user = await createTestUser('leaver@example.com');
    const headers = { ...defaultHeaders, Cookie: await createTestSession(user) };
    const seen = new Date().toISOString();
    await baseDb.update(actorsTable).set({ lastSeenAt: seen, lastSignInAt: seen }).where(eq(actorsTable.id, user.id));

    expect((await call(deleteMe, { headers })).response.status).toBe(204);

    const [actor] = await baseDb.select().from(actorsTable).where(eq(actorsTable.id, user.id));
    expect(actor).toMatchObject({ lastSeenAt: null, lastSignInAt: null });
  });
});
