/// <reference lib="webworker" />
import type { ListNotificationsResponse } from 'sdk';
import { ExpirationPlugin, type PrecacheEntry, Serwist, StaleWhileRevalidate } from 'serwist';
import type { ConfigMode } from 'shared';
import { servicePaths } from 'shared/config-builder/service-paths';
import type { NotificationPushPayload } from 'shared/push-payload';
import { shareLinkPath } from 'shared/share-link';
import { escapeRegExp } from 'shared/utils/escape-regexp';
import { canonicalOriginUrl } from '~/utils/canonical-origin';

declare const self: ServiceWorkerGlobalScope & { __SW_MANIFEST: (PrecacheEntry | string)[] };

declare const __BACKEND_URL__: string;
declare const __FRONTEND_URL__: string;
declare const __APP_MODE__: ConfigMode;

// Leaves to the network every navigation the app shell must not answer: each service's path (an OAuth or LTI step, a
// download), well-known documents, text artifacts (llms.txt, docs/page/*.md, /static/*.json), share links, which the
// server redirects to their preview, and embedded pages: the shell the worker holds carries the framing policy of
// every other page, which keeps them out of an LTI platform's frame.
const navigationDenylist = [
  /\.(?:txt|md|json)$/i,
  new RegExp(shareLinkPath),
  /^\/embed\//,
  /^\/\.well-known\//,
  ...Object.values(servicePaths).map((path) => new RegExp(`^${escapeRegExp(path)}/`)),
];

/** Docs files outside docs.gen/: the OpenAPI spec, and the type and zod indexes the docs code view reads. */
const docsFiles = new Set(['/static/openapi.json', '/static/types.gen.ts', '/static/zod.gen.ts']);

// A worker on another host than frontendUrl, such as the zone apex before it redirected, answers every visit from its
// precache and never meets the server's redirect, and a redirected script fails its update fetch without evicting it.
// That host answers its script request with this file (cella-cli:src/infra/resources/loadbalancer.ts), which takes over and leaves.
if (canonicalOriginUrl(self.location, __FRONTEND_URL__, __APP_MODE__)) {
  self.addEventListener('install', () => self.skipWaiting());
  self.addEventListener('activate', (event) => event.waitUntil(leaveHost()));
} else {
  // `skipWaiting: false` keeps the update prompt: Serwist listens for the client's `{type: 'SKIP_WAITING'}` message.
  const serwist = new Serwist({
    precacheEntries: self.__SW_MANIFEST,
    skipWaiting: false,
    clientsClaim: true,
    precacheOptions: { cleanupOutdatedCaches: true, concurrency: 10, navigateFallback: 'index.html', navigateFallbackDenylist: navigationDenylist },
    runtimeCaching: [
      {
        // Docs files keep stable names per release; the app appends ?v=<sha> so each release keys fresh cache entries.
        matcher: ({ url }) => url.origin === self.location.origin && (url.pathname.startsWith('/static/docs.gen/') || docsFiles.has(url.pathname)),
        handler: new StaleWhileRevalidate({ cacheName: 'docs-gen', plugins: [new ExpirationPlugin({ maxEntries: 40 })] }),
      },
    ],
  });
  serwist.addEventListeners();
}

/** Deletes this host's caches and registration, then moves every page on it to the same path on `frontendUrl`. */
async function leaveHost(): Promise<void> {
  const names = await caches.keys();
  await Promise.all(names.map((name) => caches.delete(name)));
  await self.registration.unregister();
  // The pages the replaced worker served are this worker's to navigate once claimed.
  await self.clients.claim();
  const clients = await self.clients.matchAll({ type: 'window' });
  await Promise.all(
    clients.map((client) => {
      const url = canonicalOriginUrl(new URL(client.url), __FRONTEND_URL__, __APP_MODE__);
      // A navigation to another origin resolves null once it starts; a page the worker does not control refuses it.
      return url ? client.navigate(url).catch(() => null) : null;
    }),
  );
}

// English-only titles by design: the payload carries ids and a kind, never localized content, so
// the closed-app toast stays generic and the app renders the localized inbox on open.
const pushTitles: Record<string, string> = { mention: 'You were mentioned', reply: 'New reply', comment: 'New comment' };

self.addEventListener('push', (event) => {
  let data: NotificationPushPayload | null = null;
  try {
    data = event.data?.json() ?? null;
  } catch {
    // Not our payload; showing nothing is safe because we never send opaque pushes.
  }
  if (data?.t !== 'notif') return;
  event.waitUntil(handleNotificationPush(data));
});

async function handleNotificationPush(data: NotificationPushPayload): Promise<void> {
  // Visible notification first (userVisibleOnly contract), collapsed per channel by tag: a burst edits one toast in place.
  await self.registration.showNotification(pushTitles[data.kind] ?? 'New notification', {
    tag: `notif-${data.channelId}`,
    data: { activityId: data.activityId, url: data.url },
  });
  await updateUnreadBadge();
}

/** Recount hint: the push carries no number; the API recount is current and cheap. */
async function updateUnreadBadge(): Promise<void> {
  try {
    const response = await fetch(`${__BACKEND_URL__}/notifications?maxPageSize=1`, { credentials: 'include' });
    if (!response.ok) return;
    const { unreadCount }: Pick<ListNotificationsResponse, 'unreadCount'> = await response.json();
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

/** An open tab navigates to the subject; otherwise a new window opens on it. An embedded page in a frame is no tab. */
async function focusOrOpenApp(url: string): Promise<void> {
  const clientList = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
  const existing = clientList.find((client) => client.frameType === 'top-level');
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
