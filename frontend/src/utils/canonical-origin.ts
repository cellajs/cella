import type { ConfigMode } from 'shared';

type PageLocation = Pick<Location, 'origin' | 'hostname' | 'pathname' | 'search' | 'hash'>;

const loopbackHosts = ['localhost', '127.0.0.1', '[::1]'];

/** The same page on `frontendUrl` when a deployed build runs on another host, whose origin the CSP and the API refuse; otherwise null. */
export const canonicalOriginUrl = (location: PageLocation, frontendUrl: string, mode: ConfigMode): string | null => {
  // Development, tunnel and test serve one build under several hosts on purpose: localhost, a LAN address, the tunnel.
  if (mode !== 'production' && mode !== 'staging') return null;
  // A loopback host is a local preview of the build (`pnpm start`), never a public alias.
  if (loopbackHosts.includes(location.hostname)) return null;

  const { origin } = new URL(frontendUrl);
  if (location.origin === origin) return null;

  return `${origin}${location.pathname}${location.search}${location.hash}`;
};

/** Unregisters this host's service workers and deletes its caches, then replaces the location with `url`, after `timeoutMs` at the latest. */
export const leaveForCanonicalOrigin = async (url: string, timeoutMs = 2000): Promise<void> => {
  // A worker left here answers later visits from its precache, and its updates fail once the server redirects this host.
  const cleanup = async () => {
    if ('serviceWorker' in navigator) {
      const registrations = await navigator.serviceWorker.getRegistrations();
      await Promise.all(registrations.map((registration) => registration.unregister()));
    }
    if (typeof caches === 'undefined') return;
    const names = await caches.keys();
    await Promise.all(names.map((name) => caches.delete(name)));
  };

  await Promise.race([cleanup().catch(() => {}), new Promise((resolve) => setTimeout(resolve, timeoutMs))]);
  window.location.replace(url);
};
