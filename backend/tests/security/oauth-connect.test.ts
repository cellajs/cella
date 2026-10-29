import { eq } from 'drizzle-orm';
import { github, githubCallback, startOAuthConnect } from 'sdk';
import { afterEach, describe, expect, it, onTestFinished, vi } from 'vitest';
import { baseDb as db } from '#/db/db';
import { githubAuth } from '#/modules/auth/oauth/helpers/providers';
import { tokensTable } from '#/modules/auth/tokens/tokens-db';
import { defaultHeaders } from '../fixtures';
import { CookieJar, cookieChange, createTestUser, expectRefusal, insertTestSession, linkIdentity, setCookieOf } from '../helpers';
import { createAppClient } from '../test-client';
import { setTestConfig } from '../test-utils';
import { clearSecurityTestData } from './helpers';

setTestConfig({ enabledAuthStrategies: ['oauth'], enabledOAuthProviders: ['github'] });

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
    expect(setCookieOf(response, 'oauth-connect').line).toContain('SameSite=Lax');
    expect(await pins()).toEqual([expect.objectContaining({ userId: user.id, createdBy: user.id })]);
  });
});

/** Each start of a provider round trip sets the browser's state cookie; another site can trigger starts at will. */
describe('starting a provider sign-in', async () => {
  const call = await createAppClient();

  /** GitHub accepts any code and answers with the profile of the account `email` holds, linked as subject 4711. */
  const githubSignsIn = (email: string) => {
    const exchange = vi.spyOn(githubAuth, 'validateAuthorizationCode').mockResolvedValue({ accessToken: 'test-access-token' });
    const stub = vi.mocked(fetch);
    const original = stub.getMockImplementation();
    stub.mockImplementation(async (input) =>
      Response.json(
        String(input).endsWith('/emails') ? [{ email, primary: true, verified: true }] : { id: 4711, login: 'state-owner', name: 'State Owner' },
      ),
    );
    onTestFinished(() => {
      exchange.mockRestore();
      if (original) stub.mockImplementation(original);
    });
  };

  it('must not let repeated sign-in starts grow the request past the header limit', async () => {
    const user = await createTestUser('state-cookie@security-test.com');
    await linkIdentity(user, { subject: '4711' });
    const browser = new CookieJar();
    const inBrowser = () => ({ ...defaultHeaders, Cookie: browser.header() });

    // A page on another site navigates one window to the start again and again, each with a long redirect path.
    const states: string[] = [];
    for (let start = 0; start < 8; start++) {
      const { response } = await call(github, { query: { type: 'auth', redirectAfter: `/${'a'.repeat(2000)}` }, headers: inBrowser() });
      expect(response.status).toBe(302);
      states.push(new URL(response.headers.get('location') ?? '').searchParams.get('state') ?? '');
      browser.absorb(response);
    }
    expect(browser.header().match(/oauth-state/g)).toHaveLength(1);
    // Node answers 431 to every request whose headers pass 16 KiB.
    expect(browser.header().length).toBeLessThan(16 * 1024);

    githubSignsIn(user.email);
    const callback = (state: string) => call(githubCallback, { query: { state, code: 'test-code' }, headers: inBrowser() });

    // An earlier start's callback is refused and leaves the newest round trip to finish.
    await expectRefusal(await callback(states[0]), 401, 'invalid_state');
    const { response } = await callback(states[states.length - 1]);
    expect(response.status).toBe(302);
    expect(cookieChange(response, 'session')).toBe('set');
    expect(cookieChange(response, 'oauth-state')).toBe('cleared');
  });
});
