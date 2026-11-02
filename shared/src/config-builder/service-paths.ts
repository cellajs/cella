/**
 * The path each service serves under the app origin. The Vite dev server proxies them to the service ports, the load
 * balancer routes them by path prefix, and each service mounts itself at its own: one origin keeps cookies first-party
 * and the CSP at 'self'. The builder derives every service URL from `origin` and this map.
 */
export const servicePaths = {
  backend: '/api',
  yjs: '/yjs',
  mcp: '/mcp',
  oauth: '/oauth',
} as const;

/** The auth module's mount under the API, where sign-in flows and provider callbacks land. */
export const authPath = `${servicePaths.backend}/auth` as const;
