/** App-owned health contract every deployed service implements: the engine probes `path` and reads the release version from `versionHeader`. Per-service response codes are `healthExpectStatus` in services.config.ts. */
export const healthContract = {
  /** Path the health endpoint answers on. */
  path: '/health',
  /** Response header carrying the running release version (the deploy SHA). */
  versionHeader: 'x-app-version',
} as const;
