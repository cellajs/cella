import { appConfig } from 'shared';
import webpush, { type RequestOptions } from 'web-push';
import { env } from '#/env';
import { streamSubscriberManager } from '#/modules/entities/stream/subscriber-manager';
import { log } from '#/utils/logger';
import { isPushServiceEndpoint } from './helpers/push-service-endpoint';
import { deleteSubscriptionsByEndpoints, findSubscriptionsByUserIds } from './push-queries';

/**
 * Wire payload for one push, `{ t: 'notif', ... }`. Ids only, never content: the service worker
 * recounts through the API (always current, and nothing sensitive rides the push service).
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
const concurrency = 8;

/** web-push's socket idle limit in ms, connecting included: a push service silent this long is abandoned and the batch moves on. */
const sendTimeoutMs = 10_000;

type VapidDetails = NonNullable<RequestOptions['vapidDetails']>;

/** This deployment's VAPID details once checked; null while sending is off. */
let vapid: VapidDetails | null | undefined;

/** Checks the VAPID keys and subject on first use: a subject or key web-push refuses turns sending off, logged once with the reason. */
function getVapid(): VapidDetails | null {
  if (vapid !== undefined) return vapid;
  vapid = null;
  const { VAPID_PUBLIC_KEY: publicKey, VAPID_PRIVATE_KEY: privateKey } = env;
  if (!appConfig.has.push || !publicKey || !privateKey) return vapid;
  const subject = env.VAPID_SUBJECT ?? appConfig.frontendUrl;
  try {
    // web-push checks the subject and both keys whenever it signs a token: this one is never sent.
    webpush.getVapidHeaders('https://push.example', subject, publicKey, privateKey, 'aes128gcm');
    vapid = { subject, publicKey, privateKey };
  } catch (error) {
    log.error('Push sending is off: the VAPID keys or subject are invalid', {
      reason: error instanceof Error ? error.message : String(error),
      subject,
    });
  }
  return vapid;
}

/** Sending needs the flag AND both keys, accepted by web-push; otherwise the module is receive-only. */
export const isPushSendConfigured = (): boolean => getVapid() !== null;

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
  send: async ({ endpoint, p256dh, auth }, payload) => {
    const vapidDetails = getVapid();
    if (!vapidDetails) throw new Error('Push sending is off');
    await webpush.sendNotification({ endpoint, keys: { p256dh, auth } }, payload, { TTL: 60 * 60 * 24, timeout: sendTimeoutMs, vapidDetails });
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
 * aborts the remaining batch (back off until the next event); 403s keep their rows and are
 * counted into one warning, because a VAPID key deployed by mistake answers 403 for every
 * subscription; other errors are logged per endpoint and skipped. A stored row whose host is not in `pushServiceHosts`
 * is never sent to, and the pass logs one warning with the count of such rows.
 */
export async function sendNotificationPush(userIds: string[], payload: NotificationPushPayload, deps: PushSendDeps = defaultDeps): Promise<void> {
  try {
    const offline = userIds.filter((userId) => !deps.isOnline(userId));
    if (offline.length === 0) return;

    // Registration checks the host too; this covers rows stored under an earlier host list or check, whatever `deps` reads.
    const stored = await deps.findSubscriptions(offline);
    const subscriptions = stored.filter((row) => isPushServiceEndpoint(row.endpoint));
    const skipped = stored.length - subscriptions.length;
    if (skipped > 0) {
      log.warn('Push subscriptions skipped: their host is not in pushServiceHosts', { count: skipped, activityId: payload.activityId });
    }
    if (subscriptions.length === 0) return;

    const body = JSON.stringify(payload);
    const gone: string[] = [];
    let refused = 0;
    let backOff = false;

    for (let i = 0; i < subscriptions.length && !backOff; i += concurrency) {
      const batch = subscriptions.slice(i, i + concurrency);
      await Promise.all(
        batch.map(async (subscription) => {
          try {
            await deps.send(subscription, body);
          } catch (error) {
            // A timeout or connection error has no status code; the error says what happened.
            if (!(error instanceof webpush.WebPushError)) {
              log.warn('Push delivery failed', { error, activityId: payload.activityId });
              return;
            }
            const { statusCode } = error;
            if (statusCode === 404 || statusCode === 410) gone.push(subscription.endpoint);
            else if (statusCode === 403) refused++;
            else if (statusCode === 429) backOff = true;
            // The error also holds the endpoint, which stays out of the log; the body is the push service's reason, cut to 500 characters.
            else log.warn('Push delivery failed', { statusCode, body: String(error.body).slice(0, 500), activityId: payload.activityId });
          }
        }),
      );
    }

    await deps.pruneEndpoints(gone);
    if (refused > 0) {
      log.warn('Push services refused the VAPID token (403): mismatched VAPID keys, or keys changed after these subscriptions', {
        count: refused,
        activityId: payload.activityId,
      });
    }
    if (backOff) log.warn('Push service rate-limited; remaining batch dropped', { activityId: payload.activityId });
  } catch (error) {
    log.error('Push send pass failed', { error, activityId: payload.activityId });
  }
}
