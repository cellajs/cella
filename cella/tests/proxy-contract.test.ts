import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { engineAssetsDir } from '@cellajs/cli/infra/contract';
import { servicePaths } from 'shared';
import { shareLinkPath } from 'shared/share-link';
import { describe, expect, it } from 'vitest';

const caddyfile = readFileSync(resolve(engineAssetsDir, 'caddy/Caddyfile'), 'utf-8');

describe("the engine's proxy and the app's paths", () => {
  it('points the RFC 8414 and RFC 9728 root locations at the paths the services publish, on this origin only', () => {
    // Without it the static bucket answers 404, and a client that builds the standard location finds no metadata.
    const pattern = new RegExp(caddyfile.match(/@oauthMetadata\s+path_regexp\s+oauthMetadata\s+(\S+)/)?.[1] ?? '$^');
    expect(pattern.exec(`/.well-known/oauth-authorization-server${servicePaths.oauth}`)?.slice(1)).toEqual([
      'oauth-authorization-server',
      servicePaths.oauth,
    ]);
    const resource = `${servicePaths.mcp}/tenants/t/organizations/o/mcp`;
    expect(pattern.exec(`/.well-known/oauth-protected-resource${resource}`)?.slice(1)).toEqual(['oauth-protected-resource', resource]);
    // A redirect to `//host` or `/\host` would send the client to another origin.
    for (const path of ['/.well-known/oauth-protected-resource//evil.example', '/.well-known/oauth-protected-resource/\\evil.example']) {
      expect(pattern.test(path), path).toBe(false);
    }
    // Handles with named matchers run in the order written: this one before the bucket's /.well-known/*.
    expect(caddyfile.indexOf('handle @oauthMetadata')).toBeLessThan(caddyfile.indexOf('handle @wellKnown'));
  });

  it("redirects a share link to its preview under the API's links, with the pattern the service worker and Vite use", () => {
    // A drifted copy would leave the service worker or dev passing links that production serves as the SPA shell.
    expect(caddyfile.match(/@shareLink\s+path_regexp\s+(\S+)/)?.[1]).toBe(shareLinkPath);
    expect(caddyfile).toMatch(new RegExp(`handle @shareLink \\{\\s*\\n\\s*redir \\* ${servicePaths.backend}/links\\{uri\\}\\s*\\n`));
    expect(caddyfile.indexOf('handle @shareLink')).toBeLessThan(caddyfile.indexOf('handle @root'));
  });
});
