/// <reference lib="webworker" />
import { clientsClaim } from 'workbox-core';
import { ExpirationPlugin } from 'workbox-expiration';
import { cleanupOutdatedCaches, createHandlerBoundToURL, precacheAndRoute } from 'workbox-precaching';
import { NavigationRoute, registerRoute } from 'workbox-routing';
import { StaleWhileRevalidate } from 'workbox-strategies';

declare const self: ServiceWorkerGlobalScope;

// Periodic Background Sync API (Chromium-only), not yet in lib.dom.
interface PeriodicSyncEvent extends ExtendableEvent {
  readonly tag: string;
}
declare global {
  interface ServiceWorkerGlobalScopeEventMap {
    periodicsync: PeriodicSyncEvent;
  }
}
declare const __BACKEND_URL__: string;

// Take control of all pages immediately
clientsClaim();

// Allow the client to trigger skipWaiting via postMessage
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

// Workbox precaching: manifest injected by vite-plugin-pwa.
cleanupOutdatedCaches();
precacheAndRoute(self.__WB_MANIFEST);

// SPA navigations (e.g. a reload on /docs) don't match any precache URL; serve
// the precached app shell so every route loads offline. generateSW does this
// automatically — injectManifest workers must register it themselves.
registerRoute(new NavigationRoute(createHandlerBoundToURL('index.html')));

// Docs data JSON (openapi reference + search corpus) is fetched at runtime by
// react-query and excluded from the precache glob (json isn't in globPatterns).
// Serve it stale-while-revalidate so the docs section — reference pages and
// search — works offline after one online visit. The files aren't
// content-hashed, so background revalidation picks up new API docs per deploy.
// Scoped to these prefixes; no other request is affected.
registerRoute(
  ({ url }) =>
    url.origin === self.location.origin &&
    (url.pathname.startsWith('/static/docs.gen/') || url.pathname === '/static/openapi.json'),
  new StaleWhileRevalidate({
    cacheName: 'docs-gen',
    plugins: [new ExpirationPlugin({ maxEntries: 40 })],
  }),
);

// Chromium-only (Chrome 80+, Edge). Fires at browser-determined intervals.
// Fetches the real unseen count from the server so badge stays accurate.

self.addEventListener('periodicsync', (event) => {
  if (event.tag === 'unseen-badge-sync') {
    event.waitUntil(updateBadge());
  }
});

async function updateBadge() {
  try {
    const res = await fetch(`${__BACKEND_URL__}/unseen/counts`, { credentials: 'include' });
    if (!res.ok) return;

    const data: Record<string, Record<string, number>> = await res.json();

    // Sum all unseen counts across all contexts and entity types
    let total = 0;
    for (const contextCounts of Object.values(data)) {
      for (const count of Object.values(contextCounts)) {
        total += count;
      }
    }

    if (total > 0) {
      (self.navigator as Navigator).setAppBadge(total);
    } else {
      (self.navigator as Navigator).clearAppBadge();
    }
  } catch {
    // Network error or auth expired, silently ignore.
  }
}
