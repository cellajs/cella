/// <reference lib="webworker" />
import { ExpirationPlugin, type PrecacheEntry, Serwist, StaleWhileRevalidate } from 'serwist';
import { escapeRegExp } from 'shared/utils/escape-regexp';

declare const self: ServiceWorkerGlobalScope & { __SW_MANIFEST: (PrecacheEntry | string)[] };

declare const __BACKEND_URL__: string;

// Excludes a same-origin backend prefix from the SPA navigation fallback so OAuth and downloads hit the network.
const apiPathPrefix = new URL(__BACKEND_URL__, self.location.origin).pathname.replace(/\/+$/, '');
const navigationDenylist = apiPathPrefix ? [new RegExp(`^${escapeRegExp(apiPathPrefix)}/`)] : [];

/** Docs files outside docs.gen/: the OpenAPI spec, and the type and zod indexes the docs code view reads. */
const docsFiles = new Set(['/static/openapi.json', '/static/types.gen.ts', '/static/zod.gen.ts']);

// `skipWaiting: false` keeps the update prompt: Serwist listens for the client's `{type: 'SKIP_WAITING'}` message.
const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  skipWaiting: false,
  clientsClaim: true,
  precacheOptions: {
    cleanupOutdatedCaches: true,
    // Number of parallel precache downloads during SW install
    concurrency: 10,
    navigateFallback: 'index.html',
    navigateFallbackDenylist: navigationDenylist,
  },
  runtimeCaching: [
    {
      // Docs files keep stable names per release; the app appends ?v=<sha> so each release keys fresh cache entries.
      matcher: ({ url }) => url.origin === self.location.origin && (url.pathname.startsWith('/static/docs.gen/') || docsFiles.has(url.pathname)),
      handler: new StaleWhileRevalidate({
        cacheName: 'docs-gen',
        plugins: [new ExpirationPlugin({ maxEntries: 40 })],
      }),
    },
  ],
});

// English-only titles by design: the payload carries ids and a type, never localized content, so
// the closed-app toast stays generic and the app renders the localized inbox on open.
const pushTitles: Record<string, string> = { mention: 'You were mentioned', reply: 'New reply', comment: 'New comment' };

/** { t: 'notif', activityId, channelId, type, url } from push-sender.ts; anything else is dropped. */
interface NotificationPushData {
  t: string;
  activityId: string;
  channelId: string;
  type: string;
  /** Self-describing `/n` link to the subject; a click opens it. */
  url?: string;
}

self.addEventListener('push', (event) => {
  let data: NotificationPushData | null = null;
  try {
    data = event.data?.json() ?? null;
  } catch {
    // Not our payload; showing nothing is safe because we never send opaque pushes.
  }
  if (data?.t !== 'notif') return;
  event.waitUntil(handleNotificationPush(data));
});

async function handleNotificationPush(data: NotificationPushData): Promise<void> {
  // Visible notification first (userVisibleOnly contract), collapsed per channel by tag: a
  // burst edits one toast in place.
  await self.registration.showNotification(pushTitles[data.type] ?? 'New notification', {
    tag: `notif-${data.channelId}`,
    data: { activityId: data.activityId, url: data.url },
  });
  await updateUnreadBadge();
}

/** Recount hint: the push carries no number; the API recount is current and cheap. */
async function updateUnreadBadge(): Promise<void> {
  try {
    const response = await fetch(`${__BACKEND_URL__}/notifications?limit=1`, { credentials: 'include' });
    if (!response.ok) return;
    const { unreadCount }: { unreadCount: number } = await response.json();
    await (unreadCount > 0 ? self.navigator.setAppBadge(unreadCount) : self.navigator.clearAppBadge());
  } catch {
    // Network error or expired auth: leave the badge unchanged.
  }
}

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = typeof event.notification.data?.url === 'string' ? event.notification.data.url : '/';
  event.waitUntil(focusOrOpenApp(url));
});

/** An open tab navigates to the subject; otherwise a new window opens on it. */
async function focusOrOpenApp(url: string): Promise<void> {
  const clientList = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
  const existing = clientList[0];
  if (!existing) {
    await self.clients.openWindow(url);
    return;
  }
  await existing.focus();
  if ('navigate' in existing) await existing.navigate(url);
}

// The push service rotated the subscription: re-subscribe with the same key and re-register, or the device receives no
// pushes until the user toggles push off and on again.
self.addEventListener('pushsubscriptionchange', (event) => event.waitUntil(resubscribe(event.oldSubscription)));

async function resubscribe(oldSubscription: PushSubscription | null): Promise<void> {
  try {
    const applicationServerKey = oldSubscription?.options.applicationServerKey ?? undefined;
    const subscription = await self.registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey });
    await fetch(`${__BACKEND_URL__}/push/subscriptions`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(subscription.toJSON()),
    });
  } catch {
    // Re-subscribe failed (offline, permission revoked); the settings toggle recovers it.
  }
}

serwist.addEventListeners();
