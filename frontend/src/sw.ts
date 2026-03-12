/// <reference lib="webworker" />
import { clientsClaim } from 'workbox-core';
import { cleanupOutdatedCaches, precacheAndRoute } from 'workbox-precaching';

declare const self: ServiceWorkerGlobalScope;
declare const __BACKEND_URL__: string;

// Take control of all pages immediately
clientsClaim();

// Allow the client to trigger skipWaiting via postMessage
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

// Workbox precaching — manifest injected by vite-plugin-pwa
cleanupOutdatedCaches();
precacheAndRoute(self.__WB_MANIFEST);

// ─── Periodic Background Sync: silently update app badge ────────────
// Chromium-only (Chrome 80+, Edge). Fires at browser-determined intervals.
// Fetches the real unseen count from the server so badge stays accurate.

self.addEventListener('periodicsync' as any, (event: any) => {
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
    // Network error or auth expired — silently ignore
  }
}
