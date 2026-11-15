import { redirectedApexOrigin as shareLinkApexOrigin } from 'shared/apex-origin';
import { describe, expect, it } from 'vitest';
import { redirectedApexOrigin } from '../../lib/naming';

// Share links are built on the apex: one the load balancer does not redirect would leave every pasted link dead.
describe("the frontend's copy of redirectedApexOrigin", () => {
  it('answers as the load balancer does', () => {
    const cases: [string, string][] = [
      ['www.raak.dev', 'raak.dev'],
      ['staging.raak.dev', 'raak.dev'],
      ['app.example.com', 'example.com'],
      ['localhost', ''],
    ];
    for (const [host, zone] of cases) expect(shareLinkApexOrigin(host, zone), host).toBe(redirectedApexOrigin(host, zone));
  });
});
