/** The origin of the zone apex the load balancer redirects to the app host, when that host is `www.<zone>`; undefined for any other host. */
// A copy of the deploy engine's `redirectedApexOrigin` (cella-cli:src/infra/lib/naming.ts), which shared cannot import:
// the engine reads shared only through the app's engine config. infra/tests/apex-origin.test.ts holds the two to the same answers.
export function redirectedApexOrigin(appHost: string, zone: string): string | undefined {
  return appHost === `www.${zone}` ? `https://${zone}` : undefined;
}
