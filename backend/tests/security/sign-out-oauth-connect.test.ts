import { eq } from 'drizzle-orm';
import { signOut, startOAuthConnect } from 'sdk';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { baseDb as db } from '#/db/db';
import { authCookieName } from '#/modules/auth/general/helpers/cookie';
import { tokensTable } from '#/modules/auth/tokens-db';
import { defaultHeaders } from '../fixtures';
import { createTestUser } from '../helpers';
import { createAppClient } from '../test-client';
import { mockFetchRequest, setTestConfig } from '../test-utils';
import { clearSecurityTestData } from './helpers';
import { cookiesAfter, insertSession } from './session-helpers';

setTestConfig({ enabledAuthStrategies: ['oauth', 'magic'], enabledOAuthProviders: ['github'] });

beforeAll(() => mockFetchRequest());

afterEach(async () => await clearSecurityTestData());

const connectPins = () => db.select().from(tokensTable).where(eq(tokensTable.type, 'oauth-connect'));

const connectCookieCleared = (res: Response) =>
  res.headers.getSetCookie().some((line) => line.startsWith(`${authCookieName('oauth-connect')}=;`));

/**
 * A provider connect started in a browser goes to whoever finishes the provider's page in it. On a shared computer
 * that can be the next person, so the pin serves only the session that started it, and signing out spends it.
 */
describe('Sign-out with a provider connect under way', async () => {
  const call = await createAppClient();

  it('must not leave a provider connect pin behind at sign-out', async () => {
    const owner = await createTestUser('connect-owner@security-test.com');
    const session = await insertSession(owner);

    const started = await call(startOAuthConnect, { headers: session.headers });
    expect(started.response.status).toBe(204);
    // The pin names the session that asked for it (positive control).
    expect(await connectPins()).toMatchObject([{ userId: owner.id, sessionId: session.id }]);
    const browser = cookiesAfter(session.cookie, started.response);

    const signedOut = await call(signOut, { headers: { ...defaultHeaders, Cookie: browser } });
    expect(signedOut.response.status).toBe(204);
    expect(connectCookieCleared(signedOut.response)).toBe(true);
    expect(await connectPins()).toHaveLength(0);
  });
});
