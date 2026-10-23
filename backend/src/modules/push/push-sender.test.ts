import { describe, expect, it } from 'vitest';
import webpush from 'web-push';
import { type NotificationPushPayload, type PushSendDeps, sendNotificationPush } from './push-sender';

const payload: NotificationPushPayload = { t: 'notif', activityId: 'act-1', channelId: 'chan-1', type: 'mention' };

/** An endpoint on a host in `appConfig.pushServiceHosts`, so the send-time host check lets it through. */
const endpointOf = (userId: string) => `https://fcm.googleapis.com/fcm/send/${userId}`;

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
    ...overrides,
  };
  return { deps, sent, pruned };
}

const statusError = (statusCode: number) => new webpush.WebPushError('Received unexpected response code', statusCode, {}, '', 'https://push.test');

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

  it('aborts the remaining batches on 429', async () => {
    const users = Array.from({ length: 20 }, (_, i) => `u${i}`);
    const { deps, sent } = makeDeps({
      send: async (sub) => {
        if (sub.endpoint.endsWith('/u0')) throw statusError(429);
        sent.push(sub.endpoint);
      },
    });
    await sendNotificationPush(users, payload, deps);
    // The first batch (concurrency window) still completes; later batches are dropped.
    expect(sent.length).toBeLessThan(users.length - 1);
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
