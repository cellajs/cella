import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { deriveInfra } from '../../lib/naming';
import { SECURITY_HEADERS } from '../../tasks/smoke';
import { fakeConfig } from '../helpers/fake-config';

const caddyfile = readFileSync(resolve(__dirname, '../../caddy/Caddyfile'), 'utf-8');
const dockerfile = readFileSync(resolve(__dirname, '../../caddy/Dockerfile'), 'utf-8');

// Derived from the canonical fixture so the negative assertion below asserts "no bucket is hardcoded", not "not this slug".
const frontendBucket = deriveInfra(fakeConfig()).naming.frontendBucket;

// Pins the Caddyfile contract the agent's check and the smoke tests depend on.
/** The value the global header block sets for a response header, or undefined when the block does not set it. */
const headerValue = (name: string): string | undefined => caddyfile.match(new RegExp(`^\\s*${name}\\s+"([^"]*)"`, 'm'))?.[1];

describe('frontend Caddyfile', () => {
  it('sets every header the deploy smoke check requires, with the values that lock the response down', () => {
    // Names only would pass a header emptied or weakened; the smoke check verifies presence on the live deployment, so the values are pinned here.
    for (const header of SECURITY_HEADERS) expect(headerValue(header), header).toBeTruthy();
    const hsts = headerValue('Strict-Transport-Security') ?? '';
    expect(Number(hsts.match(/max-age=(\d+)/)?.[1])).toBeGreaterThanOrEqual(31536000);
    expect(hsts).toContain('includeSubDomains');
    expect(hsts).toContain('preload');
    expect(headerValue('X-Frame-Options')).toBe('SAMEORIGIN');
    expect(headerValue('X-Content-Type-Options')).toBe('nosniff');
    expect(headerValue('Cross-Origin-Opener-Policy')).toBe('same-origin');
    expect(headerValue('Referrer-Policy')).toBe('strict-origin-when-cross-origin');
    // The uploader's webcam and audio sources record on the app's own page; frames from other origins get neither device.
    expect(headerValue('Permissions-Policy')).toBe('camera=(self), microphone=(self), geolocation=()');
  });

  it('strips the Server header so the upstream is not advertised', () => {
    expect(caddyfile).toMatch(/-Server\b/);
  });

  it('exposes X-App-Version bound to {$RELEASE_SHA} env', () => {
    // The agent passes the check only when X-App-Version is the machine's release; breaking it fails every switch at its serving wait.
    expect(caddyfile).toMatch(/X-App-Version\s+"\{\$RELEASE_SHA\}"/);
  });

  it('binds CSP from the {$FRONTEND_CSP} env', () => {
    expect(headerValue('Content-Security-Policy')).toBe('{$FRONTEND_CSP}');
  });

  it("serves /health locally (the agent's check depends on it)", () => {
    expect(caddyfile).toMatch(/handle\s+\/health\s*\{/);
    expect(caddyfile).toMatch(/respond\s+"ok"\s+200/);
  });

  it('rewrites 404 from origin to /index.html for SPA deep links', () => {
    expect(caddyfile).toMatch(/handle_response\s+@notfound/);
    expect(caddyfile).toMatch(/rewrite\s+\*\s+\/index\.html/);
    expect(caddyfile).toMatch(/@notfound\s+status\s+404/);
  });

  it('long-caches content-hashed /assets/* only', () => {
    expect(caddyfile).toMatch(/@assets\s+path\s+\/assets\/\*\s*\n/);
    // `>` sets the header with defer, which is what makes it replace the Cache-Control S3 returns;
    // without it the response carries the field twice.
    expect(caddyfile).toMatch(/header >Cache-Control\s+"public,\s*max-age=31536000,\s*immutable"/);
  });

  it('short-caches stable-named /static/* (docs.gen etc. change per release)', () => {
    // Marking /static/* immutable froze docs data in browser caches for a year.
    expect(caddyfile).toMatch(/@static\s+path\s+\/static\/\*/);
    expect(caddyfile).toMatch(/@static\s+path[^{]*\{\s*\n\s*header >Cache-Control "public, max-age=3600"/);
  });

  it('reverse-proxies to the {$ORIGIN_HOST} env, not a hardcoded bucket', () => {
    // Hard-coding would couple the image to a single app's bucket name.
    expect(caddyfile).toContain('{$ORIGIN_HOST}');
    expect(caddyfile).not.toContain(`${frontendBucket}.s3.`);
  });

  it('listens on port 80 (matches LB backend.forwardPort)', () => {
    expect(caddyfile).toMatch(/^:80\s*\{/m);
  });

  it('disables auto_https since the LB terminates TLS', () => {
    expect(caddyfile).toMatch(/auto_https\s+off/);
  });

  it('compresses responses (S3 origin stores objects uncompressed)', () => {
    expect(caddyfile).toMatch(/encode\s+zstd\s+gzip/);
  });

  it('points the RFC 8414 and RFC 9728 root locations at the paths the services publish, on this origin only', () => {
    // Without it the static bucket answers 404, and a client that builds the standard location finds no metadata.
    const pattern = new RegExp(caddyfile.match(/@oauthMetadata\s+path_regexp\s+oauthMetadata\s+(\S+)/)?.[1] ?? '$^');
    expect(pattern.exec('/.well-known/oauth-authorization-server/oauth')?.slice(1)).toEqual(['oauth-authorization-server', '/oauth']);
    expect(pattern.exec('/.well-known/oauth-protected-resource/mcp/tenants/t/organizations/o/mcp')?.slice(1)).toEqual([
      'oauth-protected-resource',
      '/mcp/tenants/t/organizations/o/mcp',
    ]);
    // A redirect to `//host` or `/\host` would send the client to another origin.
    for (const path of ['/.well-known/oauth-protected-resource//evil.example', '/.well-known/oauth-protected-resource/\\evil.example']) {
      expect(pattern.test(path), path).toBe(false);
    }
    // Handles with named matchers run in the order written: this one before the bucket's /.well-known/*.
    expect(caddyfile.indexOf('handle @oauthMetadata')).toBeLessThan(caddyfile.indexOf('handle @wellKnown'));
  });

  it("serves the build's brotli copies, and the original when a release before them has none", () => {
    // Without the fallback, a tab still running an older release could no longer load its lazy chunks.
    expect(caddyfile).toMatch(/rewrite\s+\*\s+\{path\}\.br/);
    expect(caddyfile).toMatch(/header_down\s+Content-Encoding\s+br/);
    expect(caddyfile).toMatch(/handle_response\s+@nocopy\s*\{\s*\n\s*rewrite\s+\*\s+\{http\.request\.orig_uri\.path\}/);
  });
});

describe('frontend Caddy Dockerfile', () => {
  it('bakes RELEASE_SHA in via ARG + ENV so X-App-Version survives image start', () => {
    expect(dockerfile).toMatch(/ARG\s+RELEASE_SHA/);
    expect(dockerfile).toMatch(/ENV\s+RELEASE_SHA=\$\{RELEASE_SHA\}/);
  });

  it('copies the Caddyfile from infra/caddy into the image', () => {
    expect(dockerfile).toMatch(/COPY\s+infra\/caddy\/Caddyfile\s+\/etc\/caddy\/Caddyfile/);
  });

  it('pins a minor version of the upstream caddy image', () => {
    // `caddy:latest` rebuilds the image whenever upstream tags move, so pin a real version and update it deliberately.
    expect(dockerfile).toMatch(/^FROM\s+caddy:2\.\d+/m);
  });
});
