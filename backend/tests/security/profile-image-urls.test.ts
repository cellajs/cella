import { eq } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { updateMe } from 'sdk';
import { appConfig } from 'shared';
import { afterEach, describe, expect, it } from 'vitest';
import { baseDb as db } from '#/db/db';
import { usersTable } from '#/modules/user/user-db';
import { defaultHeaders } from '../fixtures';
import { createTestSession, createTestUser, type ErrorResponse } from '../helpers';
import { createAppClient } from '../test-client';
import { clearSecurityTestData } from './helpers';

const cdn = appConfig.s3.publicCDNUrl;

const imageUrlsOf = async (userId: string) =>
  (
    await db
      .select({ thumbnailUrl: usersTable.thumbnailUrl, bannerUrl: usersTable.bannerUrl })
      .from(usersTable)
      .where(eq(usersTable.id, userId))
  )[0];

/**
 * Avatars and banners render as `<img src>` in every viewer's browser. Only the app's own CDN may serve them, so a
 * user cannot make each viewer's browser call a server of the user's choosing (a tracking pixel that logs who looked).
 * The origin check and its bypass forms are covered in shared/src/utils/is-cdn-url.test.ts and url-origin.test.ts.
 */
describe('Profile image URLs', async () => {
  const call = await createAppClient();

  afterEach(async () => await clearSecurityTestData());

  async function userWithSession() {
    const user = await createTestUser(`images-${nanoid(8)}@security-test.com`);
    const sessionCookie = await createTestSession(user);
    return { user, headers: { ...defaultHeaders, Cookie: sessionCookie } };
  }

  it('must not point an avatar or a banner at another host via a CDN-prefixed URL', async () => {
    const { user, headers } = await userWithSession();

    for (const body of [
      { thumbnailUrl: `${cdn}@evil.example/pixel.png` },
      { bannerUrl: `${cdn}.evil.example/banner.png` },
    ]) {
      const { error, response } = await call(updateMe, { body, headers });
      expect(response.status, JSON.stringify(body)).toBe(400);
      expect((error as ErrorResponse).type).toBe('invalid_cdn_url');
    }
    expect(await imageUrlsOf(user.id)).toEqual({ thumbnailUrl: null, bannerUrl: null });
  });

  it('stores an avatar and banner on the CDN, trimmed (positive control)', async () => {
    const { user, headers } = await userWithSession();

    const { response } = await call(updateMe, {
      body: { thumbnailUrl: ` ${cdn}/avatars/a.png `, bannerUrl: `${cdn}/banners/b.png` },
      headers,
    });
    expect(response.status).toBe(200);
    expect(await imageUrlsOf(user.id)).toEqual({
      thumbnailUrl: `${cdn}/avatars/a.png`,
      bannerUrl: `${cdn}/banners/b.png`,
    });
  });
});
