import { servicePaths } from 'shared';

/**
 * On the path-routed app origin the load balancer forwards `/yjs/...` without stripping the prefix, so both the bare
 * and the prefixed paths are accepted. Operates on the raw request URL, so the query string survives.
 */
export function stripYjsPrefix(url: string): string {
  if (url === servicePaths.yjs) return '/';
  return url.startsWith(`${servicePaths.yjs}/`) ? url.slice(servicePaths.yjs.length) : url;
}
