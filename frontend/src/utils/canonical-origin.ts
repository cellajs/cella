import type { ConfigMode } from 'shared';

type PageLocation = Pick<Location, 'origin' | 'pathname' | 'search' | 'hash'>;

/** The same page on `frontendUrl` when a deployed build runs on another host, whose origin the CSP and the API refuse; otherwise null. */
export const canonicalOriginUrl = (location: PageLocation, frontendUrl: string, mode: ConfigMode): string | null => {
  // Development, tunnel and test serve one build under several hosts on purpose: localhost, a LAN address, the tunnel.
  if (mode !== 'production' && mode !== 'staging') return null;

  const { origin } = new URL(frontendUrl);
  if (location.origin === origin) return null;

  return `${origin}${location.pathname}${location.search}${location.hash}`;
};
