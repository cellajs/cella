/// <reference lib="webworker" />
import { CacheFirst, ExpirationPlugin, type PrecacheEntry, Serwist, StaleWhileRevalidate } from 'serwist';

declare const self: ServiceWorkerGlobalScope & {
  __WB_MANIFEST: (PrecacheEntry | string)[];
};

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

// Exclude a same-origin backend prefix from the SPA navigation fallback so OAuth and
// download navigations retain network responses; cross-origin backends never match it.
const apiPathPrefix = new URL(__BACKEND_URL__, self.location.origin).pathname.replace(/\/+$/, '');
const navigationDenylist = apiPathPrefix
  ? [new RegExp(`^${apiPathPrefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}/`)]
  : [];

// Serwist wires precaching (manifest injected by vite-plugin-pwa), the offline app-shell
// navigation fallback, and runtime caching. `skipWaiting: false` keeps the update prompt
// contract: Serwist itself listens for the client's `{type: 'SKIP_WAITING'}` message.
const serwist = new Serwist({
  precacheEntries: self.__WB_MANIFEST,
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
      // Cache runtime docs data after its first visit so the section works offline.
      // Stale-while-revalidate refreshes these non-content-hashed files after each deploy.
      matcher: ({ url }) =>
        url.origin === self.location.origin &&
        (url.pathname.startsWith('/static/docs.gen/') || url.pathname === '/static/openapi.json'),
      handler: new StaleWhileRevalidate({
        cacheName: 'docs-gen',
        plugins: [new ExpirationPlugin({ maxEntries: 40 })],
      }),
    },
    {
      // Syntax-highlight grammar/theme chunks are excluded from the precache (globIgnores
      // in vite.config.ts). Content-hashed and immutable, so cache-first is safe; this
      // keeps highlighting working offline after a language loads once.
      matcher: ({ url }) => url.origin === self.location.origin && /^\/assets\/grammars-/.test(url.pathname),
      handler: new CacheFirst({
        cacheName: 'grammars',
        plugins: [new ExpirationPlugin({ maxEntries: 80 })],
      }),
    },
  ],
});

// Chromium-only (Chrome 80+, Edge). Fires at browser-determined intervals.
// Fetches the real unseen count from the server so badge stays accurate.

self.addEventListener('periodicsync', (event) => {
  if (event.tag === 'unseen-badge-sync') {
    event.waitUntil(updateBadge());
  }
});

serwist.addEventListeners();

async function updateBadge() {
  try {
    const res = await fetch(`${__BACKEND_URL__}/unseen/counts`, { credentials: 'include' });
    if (!res.ok) return;

    const data: Record<string, Record<string, number>> = await res.json();

    // Sum all unseen counts across all contexts and entity types
    let total = 0;
    for (const channelCounts of Object.values(data)) {
      for (const count of Object.values(channelCounts)) {
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
