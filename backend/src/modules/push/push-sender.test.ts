import { afterEach, describe, expect, it, vi } from 'vitest';
import webpush from 'web-push';
import { type NotificationPushPayload, type PushSendDeps, sendNotificationPush } from './push-sender';

const payload: NotificationPushPayload = { t: 'notif', activityId: 'act-1', channelId: 'chan-1', type: 'mention' };

/** An endpoint on a host in `appConfig.pushServiceHosts`, so the send-time host check lets it through. */
const endpointOf = (userId: string) => `https://fcm.googleapis.com/fcm/send/${userId}`;
/** An endpoint on another push service of `appConfig.pushServiceHosts`. */
const mozillaEndpointOf = (userId: string) => `https://updates.push.services.mozilla.com/wpush/v2/${userId}`;

const subscription = (endpoint: string) => ({ endpoint, p256dh: 'p', auth: 'a' });

function makeDeps(overrides: Partial<PushSendDeps> = {}) {
  const sent: string[] = [];
  const pruned: string[] = [];
  const deps: PushSendDeps = {
    send: async (sub) => {
      sent.push(sub.endpoint);
    },
    findSubscriptions: async (userIds) => userIds.map((id) => subscription(endpointOf(id))),
    pruneEndpoints: async (endpoints) => {
      pruned.push(...endpoints);
    },
    isOnline: () => false,
    pausedServices: new Map(),
    ...overrides,
  };
  return { deps, sent, pruned };
}

const statusError = (statusCode: number, headers = {}) =>
  new webpush.WebPushError('Received unexpected response code', statusCode, headers, '', 'https://push.test');

afterEach(() => vi.useRealTimers());

describe('sendNotificationPush', () => {
  it('sends to every offline subscriber', async () => {
    const { deps, sent } = makeDeps();
    await sendNotificationPush(['u1', 'u2'], payload, deps);
    expect(sent).toEqual([endpointOf('u1'), endpointOf('u2')]);
  });

  it('skips users with a live SSE connection: their inbox refreshes off onChangeEvent', async () => {
    const { deps, sent } = makeDeps({ isOnline: (userId) => userId === 'u1' });
    await sendNotificationPush(['u1', 'u2'], payload, deps);
    expect(sent).toEqual([endpointOf('u2')]);
  });

  it('prunes subscriptions the push service reports gone (404/410) and keeps sending the rest', async () => {
    const { deps, sent, pruned } = makeDeps({
      send: async (sub) => {
        if (sub.endpoint.endsWith('u1')) throw statusError(410);
        sent.push(sub.endpoint);
      },
    });
    await sendNotificationPush(['u1', 'u2'], payload, deps);
    expect(pruned).toEqual([endpointOf('u1')]);
    expect(sent).toEqual([endpointOf('u2')]);
  });

  it("drops only a rate-limited push service's pushes, and sends it none until its Retry-After ends", async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    const users = Array.from({ length: 20 }, (_, i) => `u${i}`);
    const fcm = (endpoints: string[]) => endpoints.filter((endpoint) => endpoint.startsWith('https://fcm.'));
    let limited = true;
    const { deps, sent } = makeDeps({
      // Every other user on Mozilla's push service, the rest on FCM, which rate-limits u0's push.
      findSubscriptions: async (userIds) => userIds.map((id, i) => subscription(i % 2 ? mozillaEndpointOf(id) : endpointOf(id))),
      send: async (sub) => {
        if (limited && sub.endpoint === endpointOf('u0')) throw statusError(429, { 'retry-after': '120' });
        sent.push(sub.endpoint);
      },
    });

    // FCM gets only the sends already under way beside its 429; Mozilla gets every push.
    await sendNotificationPush(users, payload, deps);
    expect(fcm(sent)).toEqual([endpointOf('u2'), endpointOf('u4'), endpointOf('u6')]);
    expect(sent.length - fcm(sent).length).toBe(10);

    // The next notification within the wait reaches Mozilla alone.
    sent.length = 0;
    limited = false;
    await sendNotificationPush(users, payload, deps);
    expect(fcm(sent)).toEqual([]);
    expect(sent).toHaveLength(10);

    // Once the wait ends, FCM takes pushes again.
    sent.length = 0;
    vi.setSystemTime(Date.now() + 121_000);
    await sendNotificationPush(users, payload, deps);
    expect(sent).toHaveLength(20);
  });

  it('never throws: a failing dependency is contained', async () => {
    const { deps } = makeDeps({
      findSubscriptions: async () => {
        throw new Error('db down');
      },
    });
    await expect(sendNotificationPush(['u1'], payload, deps)).resolves.toBeUndefined();
  });

  it('never sends to a stored subscription whose host is not a known push service', async () => {
    const { deps, sent } = makeDeps({
      findSubscriptions: async () => [
        subscription('https://169.254.169.254/latest/meta-data/'),
        subscription('https://169.254.169.254;.notify.windows.com/latest/meta-data/'),
        subscription(endpointOf('u1')),
      ],
    });
    await sendNotificationPush(['u1'], payload, deps);
    expect(sent).toEqual([endpointOf('u1')]);
  });

  it('sends nothing when everyone is online', async () => {
    const { deps, sent } = makeDeps({ isOnline: () => true });
    await sendNotificationPush(['u1', 'u2'], payload, deps);
    expect(sent).toEqual([]);
  });
});
