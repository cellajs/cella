import { appConfig } from 'shared';
import webpush from 'web-push';
import { env } from '#/env';
import { streamSubscriberManager } from '#/modules/entities/stream/subscriber-manager';
import { log } from '#/utils/logger';
import { deleteSubscriptionsByEndpoints, findSubscriptionsByUserIds } from './push-queries';

/**
 * Wire payload for one push, `{ t: 'notif', ... }`. Ids only, never content: the service worker
 * recounts through the API (authoritative, and nothing sensitive rides the push service).
 * `activityId` doubles as the dedupe key against at-least-once CDC redelivery.
 */
export interface NotificationPushPayload {
  t: 'notif';
  activityId: string;
  channelId: string;
  type: string;
  /** Self-describing `/n` link to the subject (ids only); the click handler opens it. */
  url?: string;
}

/** Parallel sends per batch; push services rate-limit aggressively above small bursts. */
const CONCURRENCY = 8;

/** Sending needs the flag AND both keys; either alone leaves the module receive-only. */
export const isPushSendConfigured = (): boolean =>
  appConfig.has.push && Boolean(env.VAPID_PUBLIC_KEY) && Boolean(env.VAPID_PRIVATE_KEY);

let vapidApplied = false;
function applyVapidDetails(): void {
  if (vapidApplied) return;
  webpush.setVapidDetails(
    env.VAPID_SUBJECT ?? appConfig.frontendUrl,
    env.VAPID_PUBLIC_KEY as string,
    env.VAPID_PRIVATE_KEY as string,
  );
  vapidApplied = true;
}

interface SendableSubscription {
  endpoint: string;
  p256dh: string;
  auth: string;
}

/** Injectable seams so the batch logic (pruning, backoff, online subtraction) unit-tests without a push service. */
export interface PushSendDeps {
  send: (subscription: SendableSubscription, payload: string) => Promise<void>;
  findSubscriptions: (userIds: string[]) => Promise<SendableSubscription[]>;
  pruneEndpoints: (endpoints: string[]) => Promise<void>;
  isOnline: (userId: string) => boolean;
}

const defaultDeps: PushSendDeps = {
  send: async (subscription, payload) => {
    applyVapidDetails();
    await webpush.sendNotification(
      { endpoint: subscription.endpoint, keys: { p256dh: subscription.p256dh, auth: subscription.auth } },
      payload,
      { TTL: 60 * 60 * 24 },
    );
  },
  findSubscriptions: (userIds) => findSubscriptionsByUserIds(userIds),
  pruneEndpoints: (endpoints) => deleteSubscriptionsByEndpoints(endpoints),
  // A live SSE connection means the client is provably current: its inbox refreshes off
  // onChangeEvent, so a push would only spend the browser's silent-push budget.
  isOnline: (userId) => streamSubscriberManager.getByChannel(`user:${userId}`).length > 0,
};

/**
 * Push one notification payload to every offline subscriber among `userIds`. Never throws: the
 * caller is the post-commit fan-out, and delivery is best-effort on top of the durable inbox row.
 *
 * 404/410 responses prune the subscription (the push service says the endpoint is gone); a 429
 * aborts the remaining batch (back off until the next event); other errors are logged per
 * endpoint and skipped.
 */
export async function sendNotificationPush(
  userIds: string[],
  payload: NotificationPushPayload,
  deps: PushSendDeps = defaultDeps,
): Promise<void> {
  try {
    const offline = userIds.filter((userId) => !deps.isOnline(userId));
    if (offline.length === 0) return;

    const subscriptions = await deps.findSubscriptions(offline);
    if (subscriptions.length === 0) return;

    const body = JSON.stringify(payload);
    const gone: string[] = [];
    let backOff = false;

    for (let i = 0; i < subscriptions.length && !backOff; i += CONCURRENCY) {
      const batch = subscriptions.slice(i, i + CONCURRENCY);
      await Promise.all(
        batch.map(async (subscription) => {
          try {
            await deps.send(subscription, body);
          } catch (error) {
            const statusCode = (error as { statusCode?: number }).statusCode;
            if (statusCode === 404 || statusCode === 410) gone.push(subscription.endpoint);
            else if (statusCode === 429) backOff = true;
            else log.warn('Push delivery failed', { statusCode, activityId: payload.activityId });
          }
        }),
      );
    }

    await deps.pruneEndpoints(gone);
    if (backOff) log.warn('Push service rate-limited; remaining batch dropped', { activityId: payload.activityId });
  } catch (error) {
    log.error('Push send pass failed', { error, activityId: payload.activityId });
  }
}
