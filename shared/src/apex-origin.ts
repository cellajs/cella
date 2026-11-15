/** The origin of the zone apex the load balancer redirects to the app host, when that host is `www.<zone>`; undefined for any other host. */
// A copy of infra/lib/naming.ts `redirectedApexOrigin`, which infra cannot import from here (its engine reads shared only
// through engine-config); infra/tests/unit/apex-origin.test.ts holds the two to the same answers.
export function redirectedApexOrigin(appHost: string, zone: string): string | undefined {
  return appHost === `www.${zone}` ? `https://${zone}` : undefined;
}
