import { createHash } from 'node:crypto';
import { appConfig } from 'shared';
import type { NotificationPushPayload } from 'shared/push-payload';
import { getVapidHeaders, type RequestOptions, sendNotification, WebPushError } from 'web-push';
import { baseDb } from '#/db/db';
import { env } from '#/env';
import { streamSubscriberManager, userTopic } from '#/modules/entities/stream/subscriber-manager';
import { isPushServiceEndpoint } from '#/modules/push/helpers/push-service-endpoint';
import { deleteSubscriptionsByEndpoints, findSubscriptionsByUserIds } from '#/modules/push/push-queries';
import { log } from '#/utils/logger';

export type { NotificationPushPayload };

/** Parallel sends per batch; push services rate-limit aggressively above small bursts. */
const concurrency = 8;

/** web-push's socket idle limit in ms, connecting included: a push service silent this long is abandoned and the batch moves on. */
const sendTimeoutMs = 10_000;

/** The longest wait a push service's `Retry-After` pauses its sends for: a longer one would drop more pushes than it spares the service. */
const maxServicePauseMs = 60 * 60 * 1000;

/**
 * The Topic of a channel's pushes (RFC 8030 §5.4): a push service replaces a device's undelivered push of the same
 * topic, so a device offline for hours wakes once per channel, for its latest. Hashed, since the header reaches the push
 * service in the clear, and cut to the 32 base64url characters the header allows.
 */
const topicOf = (channelId: string) => createHash('sha256').update(channelId).digest('base64url').slice(0, 32);

/** A push service as a 429 throttles it: the endpoint's host. */
const serviceOf = (endpoint: string) => new URL(endpoint).host;

/** The moment, in ms since the epoch, a 429's `Retry-After` (seconds or an HTTP date) ends; null without a readable one. */
function retryAfterEnd(error: WebPushError, now: number): number | null {
  const value = error.headers?.['retry-after'];
  if (!value) return null;
  const seconds = Number(value);
  const end = Number.isFinite(seconds) ? now + seconds * 1000 : Date.parse(value);
  return Number.isNaN(end) ? null : Math.min(end, now + maxServicePauseMs);
}

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
    getVapidHeaders('https://push.example', subject, publicKey, privateKey, 'aes128gcm');
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
export function isPushSendConfigured(): boolean {
  return getVapid() !== null;
}

/** The VAPID public key while sending is on, else null: a browser subscribes only where a push can reach it. */
export function getVapidPublicKey(): string | null {
  return getVapid()?.publicKey ?? null;
}

interface SendableSubscription {
  endpoint: string;
  p256dh: string;
  auth: string;
}

/** Injected so the batch logic (pruning, backoff, online check) tests without a push service. */
export interface PushSendDeps {
  send: (subscription: SendableSubscription, payload: string, topic: string) => Promise<void>;
  findSubscriptions: (userIds: string[]) => Promise<SendableSubscription[]>;
  pruneEndpoints: (endpoints: string[]) => Promise<void>;
  isOnline: (userId: string) => boolean;
  /** Push service hosts whose 429 named a wait, each with the moment it ends: every send pass skips them until then. */
  pausedServices: Map<string, number>;
}

/** Runs off the fan-out, outside any request. */
const dbCtx = { var: { db: baseDb } };

const defaultDeps: PushSendDeps = {
  send: async ({ endpoint, p256dh, auth }, payload, topic) => {
    const vapidDetails = getVapid();
    if (!vapidDetails) throw new Error('Push sending is off');
    await sendNotification({ endpoint, keys: { p256dh, auth } }, payload, { TTL: 60 * 60 * 24, timeout: sendTimeoutMs, topic, vapidDetails });
  },
  findSubscriptions: (userIds) => findSubscriptionsByUserIds(dbCtx, { userIds }),
  pruneEndpoints: (endpoints) => deleteSubscriptionsByEndpoints(dbCtx, { endpoints }),
  // A live SSE connection means the client is provably current: its inbox refreshes off
  // onChangeEvent, so a push would only spend the browser's silent-push budget.
  isOnline: (userId) => streamSubscriberManager.getByTopic(userTopic(userId)).length > 0,
  pausedServices: new Map(),
};

/**
 * Push one notification payload to every offline subscriber among `userIds`. Never throws: the caller is the
 * post-commit fan-out, and delivery is best-effort on top of the durable inbox row.
 *
 * 404/410 responses prune the subscription (the push service says the endpoint is gone); a 429 drops that push
 * service's remaining sends of the pass, and its `Retry-After` its sends of later passes until the wait ends, while
 * other push services go on; 403s keep their rows and are counted into one warning, because a VAPID key deployed by
 * mistake answers 403 for every subscription; other errors are logged per endpoint and skipped. A stored row whose host
 * is not in `pushServiceHosts` is never sent to, and the pass logs one warning with the count of such rows.
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
    const topic = topicOf(payload.channelId);
    const gone: string[] = [];
    let refused = 0;
    // Push services that answered 429 in this pass, and per service the pushes a 429 kept from it, the refused one included.
    const throttled = new Set<string>();
    const dropped = new Map<string, number>();
    const drop = (service: string) => dropped.set(service, (dropped.get(service) ?? 0) + 1);
    const isPaused = (service: string) => {
      const end = deps.pausedServices.get(service);
      if (end !== undefined && end <= Date.now()) deps.pausedServices.delete(service);
      return throttled.has(service) || deps.pausedServices.has(service);
    };

    for (let i = 0; i < subscriptions.length; i += concurrency) {
      const batch = subscriptions.slice(i, i + concurrency);
      await Promise.all(
        batch.map(async (subscription) => {
          const service = serviceOf(subscription.endpoint);
          if (isPaused(service)) {
            drop(service);
            return;
          }
          try {
            await deps.send(subscription, body, topic);
          } catch (error) {
            // A timeout or connection error has no status code; the error says what happened.
            if (!(error instanceof WebPushError)) {
              log.warn('Push delivery failed', { error, activityId: payload.activityId });
              return;
            }
            const { statusCode } = error;
            if (statusCode === 404 || statusCode === 410) gone.push(subscription.endpoint);
            else if (statusCode === 403) refused++;
            else if (statusCode === 429) {
              throttled.add(service);
              drop(service);
              const end = retryAfterEnd(error, Date.now());
              if (end !== null) deps.pausedServices.set(service, end);
            }
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
    if (dropped.size > 0) {
      log.warn('Push services rate-limited; their pushes of this notification dropped', {
        dropped: Object.fromEntries(dropped),
        activityId: payload.activityId,
      });
    }
  } catch (error) {
    log.error('Push send pass failed', { error, activityId: payload.activityId });
  }
}
