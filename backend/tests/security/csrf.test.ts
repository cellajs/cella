import { appConfig } from 'shared';
import { afterEach, describe, expect, it } from 'vitest';
import { createTestUser, type ErrorResponse, insertTestSession } from '../helpers';
import { clearSecurityTestData } from './helpers';
import { sessionRow } from './session-helpers';

/**
 * The browser sends the session cookie with every request to the app, a form another site posts included. The CSRF
 * middleware refuses such a post by its Origin before any handler runs, so the cookie is authority from the app's own
 * pages only. (A JSON request needs no check: another origin cannot send one without a CORS grant, and there is none.)
 */
describe('cross-site form posts', async () => {
  const { baseApp: app } = await import('#/routes');

  afterEach(async () => await clearSecurityTestData());

  /** A form post carrying the session cookie, as a page on `origin` submits it; undefined sends no Origin header. */
  const formPost = (path: string, cookie: string, origin?: string) =>
    app.request(path, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Cookie: cookie,
        ...(origin === undefined ? {} : { Origin: origin }),
      },
      body: '',
    });

  it.each([
    ['another site', 'https://evil.example'],
    ['a page that names no origin', undefined],
  ])('must not sign the user out via a form posted from %s', async (_source, origin) => {
    const user = await createTestUser('csrf-target@security-test.com');
    const { id, cookie } = await insertTestSession(user);

    const response = await formPost('/auth/sign-out', cookie, origin);
    expect(response.status).toBe(403);
    expect(((await response.json()) as ErrorResponse).type).toBe('forbidden');
    // The handler never ran: the session stands and its cookie was left alone.
    expect(response.headers.getSetCookie()).toEqual([]);
    expect((await sessionRow(id)).revokedAt).toBeNull();
  });

  it('signs the user out via a form posted from the app itself (positive control)', async () => {
    const user = await createTestUser('csrf-own@security-test.com');
    const { id, cookie } = await insertTestSession(user);

    const response = await formPost('/auth/sign-out', cookie, appConfig.frontendUrl);
    expect(response.status).toBe(204);
    expect((await sessionRow(id)).revokedAt).not.toBeNull();
  });
});
