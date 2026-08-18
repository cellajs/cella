/** The load balancer forwards `/yjs/...` without stripping the prefix, so both the bare and prefixed paths are accepted. Operates on the raw request URL, so the query string survives. */
export function stripYjsPrefix(url: string): string {
  if (url === '/yjs') return '/';
  return url.startsWith('/yjs/') ? url.slice('/yjs'.length) : url;
}
