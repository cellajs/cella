import { describe, expect, it } from 'vitest';
import { shareLinkPath } from './share-link.ts';
import { nanoidTenant } from './utils/nanoid.ts';

const pattern = new RegExp(shareLinkPath);

describe('shareLinkPath', () => {
  it('matches a channel link and a product link, with or without a query', () => {
    for (const path of ['/4k9qx2m', '/4k9qx2m/t42', '/0000000/t1', '/4k9qx2m/t42?utm=x', '/4k9qx2m?utm=x']) {
      expect(pattern.test(path), path).toBe(true);
    }
  });

  it("leaves the app's own pages and the API alone", () => {
    // The task page a preview sends a browser on to, an organization page, the API, pages and assets.
    const pages = ['/t/3f9c2d1e', `/${nanoidTenant()}/acme/project`, '/api/t/uesewi', '/about', '/features', '/assets/x', '/static/x'];
    for (const path of pages) expect(pattern.test(path), path).toBe(false);
  });

  it('refuses a malformed product key', () => {
    for (const path of ['/4k9qx2m/t0', '/4k9qx2m/t042', '/4k9qx2m/42', '/4k9qx2m/t42/cover', '/4k9qx2m/tt42', '/4k9qx2mx']) {
      expect(pattern.test(path), path).toBe(false);
    }
  });
});
