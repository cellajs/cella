import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { deriveInfra } from '../../lib/naming'
import { fakeConfig } from '../helpers/fake-config'

const caddyfile = readFileSync(resolve(__dirname, '../../caddy/Caddyfile'), 'utf-8')
const dockerfile = readFileSync(resolve(__dirname, '../../caddy/Dockerfile'), 'utf-8')

// Derived from the canonical fixture so the negative assertion below stays
// fork-agnostic (the point is "no bucket is hardcoded", not "not this slug").
const frontendBucket = deriveInfra(fakeConfig()).naming.frontendBucket

// Pins the Caddyfile contract the rollout and smoke tests depend on.
describe('frontend Caddyfile', () => {
  it('emits every required security header', () => {
    for (const header of [
      'Content-Security-Policy',
      'Strict-Transport-Security',
      'X-Frame-Options',
      'X-Content-Type-Options',
      'Referrer-Policy',
      'Permissions-Policy',
      'Cross-Origin-Opener-Policy',
    ]) {
      expect(caddyfile, `missing header: ${header}`).toContain(header)
    }
  })

  it('sets HSTS with includeSubDomains + preload', () => {
    expect(caddyfile).toMatch(/Strict-Transport-Security[^\n]*includeSubDomains/)
    expect(caddyfile).toMatch(/Strict-Transport-Security[^\n]*preload/)
  })

  it('strips the Server header so the upstream is not advertised', () => {
    expect(caddyfile).toMatch(/-Server\b/)
  })

  it('exposes X-App-Version bound to {$RELEASE_SHA} env', () => {
    // The rollout verifier asserts X-App-Version == GITHUB_SHA. If this
    // breaks, every deploy will hang for 5 minutes and then fail.
    expect(caddyfile).toMatch(/X-App-Version\s+"\{\$RELEASE_SHA\}"/)
  })

  it('binds CSP from the {$FRONTEND_CSP} env', () => {
    expect(caddyfile).toMatch(/Content-Security-Policy\s+"\{\$FRONTEND_CSP\}"/)
  })

  it('serves /health locally (LB + CI rollout verification depend on it)', () => {
    expect(caddyfile).toMatch(/handle\s+\/health\s*\{/)
    expect(caddyfile).toMatch(/respond\s+"ok"\s+200/)
  })

  it('rewrites 404 from origin to /index.html for SPA deep links', () => {
    expect(caddyfile).toMatch(/handle_response\s+@notfound/)
    expect(caddyfile).toMatch(/rewrite\s+\*\s+\/index\.html/)
    expect(caddyfile).toMatch(/@notfound\s+status\s+404/)
  })

  it('long-caches versioned /assets/* and /static/* paths', () => {
    expect(caddyfile).toMatch(/@assets\s+path\s+\/assets\/\*\s+\/static\/\*/)
    expect(caddyfile).toMatch(/Cache-Control\s+"public,\s*max-age=31536000,\s*immutable"/)
  })

  it('reverse-proxies to the {$ORIGIN_HOST} env, not a hardcoded bucket', () => {
    // Hard-coding would couple the image to a single fork's bucket name.
    expect(caddyfile).toContain('{$ORIGIN_HOST}')
    expect(caddyfile).not.toContain(`${frontendBucket}.s3.`)
  })

  it('listens on port 80 (matches LB backend.forwardPort)', () => {
    expect(caddyfile).toMatch(/^:80\s*\{/m)
  })

  it('disables auto_https since the LB terminates TLS', () => {
    expect(caddyfile).toMatch(/auto_https\s+off/)
  })
})

describe('frontend Caddy Dockerfile', () => {
  it('bakes RELEASE_SHA in via ARG + ENV so X-App-Version survives image start', () => {
    expect(dockerfile).toMatch(/ARG\s+RELEASE_SHA/)
    expect(dockerfile).toMatch(/ENV\s+RELEASE_SHA=\$\{RELEASE_SHA\}/)
  })

  it('copies the Caddyfile from infra/caddy into the image', () => {
    expect(dockerfile).toMatch(/COPY\s+infra\/caddy\/Caddyfile\s+\/etc\/caddy\/Caddyfile/)
  })

  it('pins a minor version of the upstream caddy image', () => {
    // `caddy:latest` would make the image rebuild silently when upstream tags
    // move; pin to a real version. Update intentionally, never implicitly.
    expect(dockerfile).toMatch(/^FROM\s+caddy:2\.\d+/m)
  })
})
