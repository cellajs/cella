import { parse } from 'node:url';
import { eq } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { createPushSubscription } from 'sdk';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { baseDb as db } from '#/db/db';
import { isPushServiceEndpoint } from '#/modules/push/helpers/push-service-endpoint';
import { pushSubscriptionsTable } from '#/modules/push/push-subscription-db';
import { defaultHeaders } from '../fixtures';
import { createTestSession, createTestUser, expectRefusal } from '../helpers';
import { createAppClient } from '../test-client';
import { clearSecurityTestData } from './helpers';

// The registration limiter is under test here; each test signs in a user of its own, so its budget starts empty.
vi.unmock('#/middlewares/rate-limiter/core');

const keys = { p256dh: 'test-p256dh', auth: 'test-auth' };

/** One endpoint per push service (FCM, Mozilla, Apple, WNS), in the shape it hands out, with a test token. */
const realEndpoints = [
  'https://fcm.googleapis.com/fcm/send/test-fcm-token:APA91b-test_fcm_token',
  'https://updates.push.services.mozilla.com/wpush/v2/test-mozilla-token_0123',
  'https://web.push.apple.com/test-apple-token_0123',
  'https://wns2-par02p.notify.windows.com/w/?token=test%2bwns%2ftoken%3d%3d',
];

const endpointsOf = async (userId: string) =>
  (await db.select({ endpoint: pushSubscriptionsTable.endpoint }).from(pushSubscriptionsTable).where(eq(pushSubscriptionsTable.userId, userId))).map(
    ({ endpoint }) => endpoint,
  );

/**
 * The server POSTs every push to the endpoint its subscription names, so a user who could register any URL would make
 * the server send requests to a host of their choosing: an internal listener, a cloud metadata address. Registration
 * takes only https on a `pushServiceHosts` host and the default port, read the same by `url.parse`, which web-push uses.
 */
describe('Push subscription endpoints', async () => {
  const call = await createAppClient();

  afterEach(async () => await clearSecurityTestData());

  async function userWithSession() {
    const user = await createTestUser(`push-${nanoid(8)}@security-test.com`);
    const sessionCookie = await createTestSession(user);
    return { user, headers: { ...defaultHeaders, Cookie: sessionCookie } };
  }

  it.each([
    ['a cloud metadata address', 'https://169.254.169.254/latest/meta-data/'],
    ['an internal listener', 'https://localhost:4005/internal'],
    ['plain http to a push service', 'http://fcm.googleapis.com/fcm/send/abc'],
    ['another port on a push service', 'https://fcm.googleapis.com:8443/fcm/send/abc'],
    ['a host that starts with a push service name', 'https://fcm.googleapis.com.evil.example/fcm/send/abc'],
    ['a push service name as user info', 'https://web.push.apple.com@evil.example/abc'],
    ['the bare domain behind a wildcard', 'https://notify.windows.com/w/?token=abc'],
    ['a metadata address that url.parse ends at ;', 'https://169.254.169.254;.notify.windows.com/latest/meta-data/'],
    ['an internal listener that url.parse ends at ;', 'https://localhost;.notify.windows.com/internal'],
    ...['"', "'", '{', '}', '`'].map((char) => [`a host that url.parse ends at ${char}`, `https://evil.example${char}.notify.windows.com/x`]),
    ['a percent-encoded dot in a push service name', 'https://fcm%2Egoogleapis.com/fcm/send/abc'],
    ['a percent-encoded dot behind a wildcard', 'https://evil%2enotify.windows.com/w/?token=abc'],
  ])('must not register %s as a push endpoint', async (_, endpoint) => {
    const { user, headers } = await userWithSession();

    const { error, response } = await call(createPushSubscription, { body: { endpoint, keys }, headers });
    await expectRefusal({ response, error }, 400, 'invalid_push_endpoint', endpoint);
    expect(await endpointsOf(user.id)).toEqual([]);
  });

  it('accepts no endpoint whose host under url.parse differs from the host that was checked', () => {
    const chars = Array.from({ length: 128 }, (_, code) => String.fromCharCode(code));
    const hex = (char: string) => char.charCodeAt(0).toString(16).padStart(2, '0');
    const probes = chars.flatMap((char) => [
      `https://evil.example${char}.notify.windows.com/x`,
      `https://fcm${char}googleapis.com/x`,
      `https://fcm.googleapis.com${char}/x`,
      `https://fcm%${hex(char)}googleapis.com/x`,
      `https://fcm%${hex(char).toUpperCase()}googleapis.com/x`,
    ]);

    for (const endpoint of [...realEndpoints, ...probes].filter(isPushServiceEndpoint)) {
      expect(parse(endpoint).hostname, endpoint).toBe(new URL(endpoint).hostname);
    }
  });

  it('must not keep more than 20 push subscriptions for one user via repeated registrations', async () => {
    const { user, headers } = await userWithSession();
    const other = await userWithSession();
    const otherEndpoint = `${realEndpoints[0]}-other`;
    expect((await call(createPushSubscription, { body: { endpoint: otherEndpoint, keys }, headers: other.headers })).response.status).toBe(200);
    const endpoints = Array.from({ length: 25 }, (_, n) => `https://fcm.googleapis.com/fcm/send/flood-${n}`);

    for (const endpoint of endpoints) {
      const { response } = await call(createPushSubscription, { body: { endpoint, keys }, headers });
      expect(response.status, endpoint).toBe(200);
    }

    // The newest registrations stay, a new device among them; another user's subscription is untouched.
    expect((await endpointsOf(user.id)).sort()).toEqual(endpoints.slice(-20).sort());
    expect(await endpointsOf(other.user.id)).toEqual([otherEndpoint]);
  });

  it('must not register push subscriptions past 30 an hour for one user', async () => {
    const { headers } = await userWithSession();
    const register = (n: number) =>
      call(createPushSubscription, { body: { endpoint: `https://fcm.googleapis.com/fcm/send/paced-${n}`, keys }, headers });

    for (let n = 0; n < 30; n++) expect((await register(n)).response.status).toBe(200);
    await expectRefusal(await register(30), 429, 'too_many_requests');

    // Another user's budget is their own (positive control).
    const other = await userWithSession();
    const { response } = await call(createPushSubscription, { body: { endpoint: realEndpoints[0], keys }, headers: other.headers });
    expect(response.status).toBe(200);
  });

  it('registers subscriptions on known push services (positive control)', async () => {
    const { user, headers } = await userWithSession();

    for (const endpoint of realEndpoints) {
      const { response } = await call(createPushSubscription, { body: { endpoint, keys }, headers });
      expect(response.status, endpoint).toBe(200);
    }
    expect((await endpointsOf(user.id)).sort()).toEqual([...realEndpoints].sort());
  });
});
