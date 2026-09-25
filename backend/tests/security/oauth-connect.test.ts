import { eq } from 'drizzle-orm';
import { startOAuthConnect } from 'sdk';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { baseDb as db } from '#/db/db';
import { authCookieName } from '#/modules/auth/general/helpers/cookie';
import { tokensTable } from '#/modules/auth/tokens-db';
import { defaultHeaders } from '../fixtures';
import { createTestUser, insertTestSession } from '../helpers';
import { createAppClient } from '../test-client';
import { mockFetchRequest, setTestConfig } from '../test-utils';
import { clearSecurityTestData } from './helpers';

setTestConfig({ enabledAuthStrategies: ['oauth'], enabledOAuthProviders: ['github'] });

beforeAll(() => mockFetchRequest());

afterEach(async () => await clearSecurityTestData());

const pins = () => db.select().from(tokensTable).where(eq(tokensTable.type, 'oauth-connect'));

/** A connect is pinned to the account that starts it, by a token only this browser's Lax cookie carries. */
describe('starting a provider connect', async () => {
  const call = await createAppClient();

  it('must not pin a connect via a request without a session', async () => {
    const { response } = await call(startOAuthConnect, { headers: defaultHeaders });

    expect(response.status).toBe(401);
    expect(await pins()).toHaveLength(0);
  });

  it('pins a connect to the signed-in account, in a Lax cookie (positive control)', async () => {
    const user = await createTestUser('connecting@security-test.com');
    const session = await insertTestSession(user);

    const { response } = await call(startOAuthConnect, { headers: { ...defaultHeaders, Cookie: session.cookie } });

    expect(response.status).toBe(204);
    const cookie = response.headers
      .getSetCookie()
      .find((line) => line.startsWith(`${authCookieName('oauth-connect')}=`));
    expect(cookie).toContain('SameSite=Lax');
    expect(await pins()).toEqual([expect.objectContaining({ userId: user.id, createdBy: user.id })]);
  });
});
