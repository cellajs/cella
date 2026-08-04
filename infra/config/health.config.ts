/**
 * App-owned health contract every deployed service implements. The engine
 * probes `path` (container healthcheck, LB health check, cutover version gate,
 * smoke) and reads the release version from `versionHeader`. The app must serve
 * these; an app that changes them updates its implementation in lockstep. Per-service
 * response codes are declared as `healthExpectStatus` in services.config.ts.
 */
export const healthContract = {
  /** Path the health endpoint answers on. */
  path: '/health',
  /** Response header carrying the running release version (the deploy SHA). */
  versionHeader: 'x-app-version',
} as const;
