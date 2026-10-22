import { eq } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { createPushSubscription } from 'sdk';
import { afterEach, describe, expect, it } from 'vitest';
import { baseDb as db } from '#/db/db';
import { pushSubscriptionsTable } from '#/modules/push/push-subscription-db';
import { defaultHeaders } from '../fixtures';
import { createTestSession, createTestUser, expectRefusal } from '../helpers';
import { createAppClient } from '../test-client';
import { clearSecurityTestData } from './helpers';

const keys = { p256dh: 'test-p256dh', auth: 'test-auth' };

const endpointsOf = async (userId: string) =>
  (await db.select({ endpoint: pushSubscriptionsTable.endpoint }).from(pushSubscriptionsTable).where(eq(pushSubscriptionsTable.userId, userId))).map(
    ({ endpoint }) => endpoint,
  );

/**
 * The server POSTs every push to the endpoint its subscription names, so a user who could register any URL would make
 * the server send requests to a host of their choosing: an internal listener, a cloud metadata address. Registration
 * takes only https endpoints on the hosts in `appConfig.pushServiceHosts`, on the default port.
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
  ])('must not register %s as a push endpoint', async (_, endpoint) => {
    const { user, headers } = await userWithSession();

    const { error, response } = await call(createPushSubscription, { body: { endpoint, keys }, headers });
    await expectRefusal({ response, error }, 400, 'invalid_push_endpoint', endpoint);
    expect(await endpointsOf(user.id)).toEqual([]);
  });

  it('registers subscriptions on known push services (positive control)', async () => {
    const { user, headers } = await userWithSession();
    const endpoints = ['https://fcm.googleapis.com/fcm/send/abc', 'https://wns2-par02p.notify.windows.com/w/?token=abc'];

    for (const endpoint of endpoints) {
      const { response } = await call(createPushSubscription, { body: { endpoint, keys }, headers });
      expect(response.status, endpoint).toBe(200);
    }
    expect((await endpointsOf(user.id)).sort()).toEqual(endpoints);
  });
});
