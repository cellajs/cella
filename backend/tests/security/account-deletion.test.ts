import { eq } from 'drizzle-orm';
import { deleteMe } from 'sdk';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { baseDb as db } from '#/db/db';
import { mockPasskeyRecord } from '#/modules/auth/auth-mocks';
import { passkeysTable } from '#/modules/auth/passkeys/passkeys-db';
import { sessionsTable } from '#/modules/auth/sessions-db';
import { defaultHeaders } from '../fixtures';
import { createTestSession, createTestUser } from '../helpers';
import { createAppClient } from '../test-client';
import { clearDatabase, mockFetchRequest, setTestConfig } from '../test-utils';

setTestConfig({ enabledAuthStrategies: ['passkey'] });

beforeAll(async () => {
  mockFetchRequest();
});

afterEach(async () => await clearDatabase());

describe('Account deletion invalidates sessions', async () => {
  const call = await createAppClient();

  // GHSA-2vg6-77g8-24mp: deleting a user must not leave stale sessions behind.
  it('should remove all sessions and passkeys when a user deletes their account', async () => {
    const user = await createTestUser('deleter@example.com');
    const sessionCookie = await createTestSession(user);
    // A second, independent session for the same user.
    await createTestSession(user);
    await db.insert(passkeysTable).values(mockPasskeyRecord(user.id, 'Device', 'passkey-deleter'));

    const { response: res } = await call(deleteMe, {
      headers: { ...defaultHeaders, Cookie: sessionCookie },
    });

    expect(res.status).toBe(204);

    const sessions = await db.select().from(sessionsTable).where(eq(sessionsTable.userId, user.id));
    expect(sessions).toHaveLength(0);

    const passkeys = await db.select().from(passkeysTable).where(eq(passkeysTable.userId, user.id));
    expect(passkeys).toHaveLength(0);
  });
});
