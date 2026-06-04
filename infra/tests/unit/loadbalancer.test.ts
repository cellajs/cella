/**
 * Source-level invariants on the load balancer module.
 *
 * The LB is rendered live in Pulumi previews, but the cross-resource wiring
 * (cert ↔ DNS ↔ backend ↔ route) is hard to test that way without a full
 * Pulumi runtime. These string-level checks pin the contracts the rollout
 * pipeline + reconciler depend on.
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const src = readFileSync(resolve(__dirname, '../../modules/loadbalancer.ts'), 'utf-8')

describe('loadbalancer module — www / frontend wiring', () => {
  it('declares an app (www) DNS A record pointing at the LB IP', () => {
    expect(src).toContain("new scaleway.domain.Record('app-dns'")
    // DNS data is the LB public IP — same as the other records.
    expect(src).toMatch(/'app-dns'[\s\S]*?data:\s*lbPublicIp/)
  })

  it('issues a Lets Encrypt certificate for the app domain', () => {
    expect(src).toContain("new scaleway.loadbalancers.Certificate('app-cert'")
    expect(src).toMatch(/'app-cert'[\s\S]*?commonName:\s*domains\.app/)
  })

  it('creates an LB backend for the frontend VM on port 80', () => {
    expect(src).toContain("new scaleway.loadbalancers.Backend('frontend-lb-backend'")
    expect(src).toMatch(/'frontend-lb-backend'[\s\S]*?forwardPort:\s*80/)
    expect(src).toMatch(/'frontend-lb-backend'[\s\S]*?serverIps:\s*\[frontendIp\]/)
  })

  it('all backends health-check the ingress liveness path (not the app /health)', () => {
    // The per-VM ingress proxy answers /__ingress/health locally and always
    // 200 while it is up, so an app rollover never drains the LB backend.
    for (const backend of ['backend-lb-backend', 'yjs-lb-backend', 'ai-lb-backend', 'frontend-lb-backend']) {
      expect(src).toMatch(
        new RegExp(`'${backend}'[\\s\\S]*?healthCheckHttp:\\s*\\{\\s*uri:\\s*'/__ingress/health',\\s*code:\\s*200\\s*\\}`),
      )
    }
  })

  it('registers the app-cert on the HTTPS frontend', () => {
    expect(src).toMatch(/allCertIds\.push\(appCert\.id\)/)
  })

  it('adds a host-header route from www to the frontend backend', () => {
    expect(src).toContain("new scaleway.loadbalancers.Route('app-route'")
    expect(src).toMatch(/'app-route'[\s\S]*?backendId:\s*frontendBackend\.id/)
    expect(src).toMatch(/'app-route'[\s\S]*?matchHostHeader:\s*domains\.app/)
  })

  it('pulls the frontend VM private IP from the compute module', () => {
    expect(src).toMatch(/const\s+frontendIp\s*=\s*getInstanceIp\(['"]frontend['"]\)/)
  })

  it('keeps existing api / yjs / ai / apex routes intact (regression guard)', () => {
    expect(src).toContain("'api-dns'")
    expect(src).toContain("'yjs-dns'")
    expect(src).toContain("'ai-dns'")
    expect(src).toContain("'api-cert'")
    expect(src).toContain("'yjs-cert'")
    expect(src).toContain("'ai-cert'")
    expect(src).toContain("'backend-lb-backend'")
    expect(src).toContain("'yjs-lb-backend'")
    expect(src).toContain("'ai-lb-backend'")
  })
})
