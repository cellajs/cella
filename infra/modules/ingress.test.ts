import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

// Guards for the in-host zero-downtime rollover wiring. These assert the two
// static files (compose.yml + ingress.Caddyfile) keep the invariants the
// reconciler and load balancer depend on. See infra/INFRA_ARCHITECTURE.md
// (Zero-downtime deploys).

const compose = fs.readFileSync(
  path.resolve(import.meta.dirname, '../compose.yml'),
  'utf-8',
)
const ingressCaddyfile = fs.readFileSync(
  path.resolve(import.meta.dirname, '../ingress.Caddyfile'),
  'utf-8',
)

describe('compose.yml ingress model', () => {
  it('defines an ingress service that publishes the host port', () => {
    expect(compose).toMatch(/^ {2}ingress:/m)
    expect(compose).toContain("- '${INGRESS_PORT}:${INGRESS_PORT}'")
  })

  it('runs the ingress for every service profile', () => {
    expect(compose).toContain('profiles: [backend, cdc, yjs, ai, frontend]')
  })

  it('app services publish NO host port (only `expose`)', () => {
    // A stray `ports:` on an app service would bypass the ingress and
    // reintroduce a downtime window on rollover. The only host-port mapping
    // allowed is the ingress — never backend/cdc/yjs/ai/frontend.
    const allowed = new Set([
      "- '${INGRESS_PORT}:${INGRESS_PORT}'",
    ])
    const hostPortMappings = (compose.match(/^\s*-\s*'[^']*:[^']*'/gm) ?? [])
      .map((m) => m.trim())
    for (const mapping of hostPortMappings) {
      expect(allowed.has(mapping)).toBe(true)
    }
  })

  it('gives app containers a drain window on SIGTERM', () => {
    // backend, cdc, yjs, ai, frontend — five app services.
    const grace = compose.match(/stop_grace_period: 30s/g) ?? []
    expect(grace.length).toBeGreaterThanOrEqual(5)
  })
})

describe('ingress.Caddyfile', () => {
  it('serves a local liveness endpoint the LB can health-check', () => {
    expect(ingressCaddyfile).toContain('handle /__ingress/health')
    expect(ingressCaddyfile).toMatch(/respond "ok" 200/)
  })

  it('proxies everything else to the env-driven upstream', () => {
    expect(ingressCaddyfile).toContain('reverse_proxy {$UPSTREAM_HOST}:{$UPSTREAM_PORT}')
  })

  it('retries the upstream dial to bridge the app restart gap', () => {
    expect(ingressCaddyfile).toContain('lb_try_duration')
    expect(ingressCaddyfile).toContain('lb_try_interval')
  })

  it('listens on the env-injected port without ACME', () => {
    expect(ingressCaddyfile).toContain(':{$INGRESS_PORT}')
    expect(ingressCaddyfile).toContain('auto_https off')
  })
})
