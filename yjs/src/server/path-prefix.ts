/**
 * Same-origin migration: the LB path route forwards `/yjs/...` from the app
 * origin without stripping the prefix (Scaleway routes match, never rewrite),
 * so the server accepts both the bare path (legacy subdomain / direct LB
 * health check) and the `/yjs`-prefixed one. Operates on the raw request URL,
 * so a query string survives the strip.
 */
export function stripYjsPrefix(url: string): string {
  if (url === '/yjs') return '/';
  return url.startsWith('/yjs/') ? url.slice('/yjs'.length) : url;
}
