import { eq } from 'drizzle-orm';
import { signOut } from 'sdk';
import { nanoid } from 'shared/utils/nanoid';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { baseDb as db } from '#/db/db';
import { authCookieName } from '#/modules/auth/general/helpers/cookie';
import { sessionsTable } from '#/modules/auth/sessions-db';
import { encodeLowerCased } from '#/utils/oslo';
import { defaultHeaders } from '../fixtures';
import { createTestSession, createTestUser } from '../helpers';
import { createAppClient } from '../test-client';
import { clearDatabase, mockFetchRequest, setTestConfig } from '../test-utils';

setTestConfig({ enabledAuthStrategies: ['passkey'] });

beforeAll(async () => {
  mockFetchRequest();
});

afterEach(async () => await clearDatabase());

describe('Sign-out scoping', async () => {
  const call = await createAppClient();

  // GHSA-wmjr-v86c-m9jj: sign-out must validate the session secret against the DB
  // before deleting anything, so a forged cookie cannot revoke another user's session.
  it("should not revoke another user's session with a forged cookie", async () => {
    const victim = await createTestUser('victim@example.com');
    const victimCookie = await createTestSession(victim); // real session row

    // Extract the victim's sessionId from the issued cookie value.
    const cookieValue = victimCookie.split('=')[1];
    const [, victimSessionId] = cookieValue.split('.');

    // Forge a cookie: victim's sessionId but an attacker-chosen (wrong) secret.
    const forgedSecret = encodeLowerCased(nanoid(40));
    const forgedContent = `${forgedSecret}.${victimSessionId}.`;
    const forgedCookie = `${authCookieName('session')}=${forgedContent}`;

    const { response: res } = await call(signOut, {
      headers: { ...defaultHeaders, Cookie: forgedCookie },
    });

    // The forged secret matches no session row → fail closed.
    expect(res.status).toBe(401);

    // The victim's session remains.
    const remaining = await db.select().from(sessionsTable).where(eq(sessionsTable.id, victimSessionId));
    expect(remaining).toHaveLength(1);
  });
});
