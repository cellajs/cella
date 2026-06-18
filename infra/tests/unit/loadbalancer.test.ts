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

const src = readFileSync(resolve(__dirname, '../../resources/loadbalancer.ts'), 'utf-8')

describe('loadbalancer module — registry-driven wiring', () => {
  it('derives the LB-exposed service set from the registry, never by name', () => {
    expect(src).toMatch(/enabledServices\(appConfig\.features\)\.filter\(\(s\) => s\.lbRoute\)/)
    // The default backend comes from the lbRoute 'default' declaration.
    expect(src).toMatch(/lbRoute === 'default'/)
    // No service-specific resource construction outside the loops.
    expect(src).not.toMatch(/new scaleway\.loadbalancers\.Backend\('(backend|yjs|ai|frontend)-lb-backend'/)
  })

  it('creates one DNS record per exposed service pointing at the LB IP', () => {
    expect(src).toMatch(/new scaleway\.domain\.Record\(`\$\{baseName\(service\.slug\)\}-dns`/)
    expect(src).toMatch(/data:\s*lbPublicIp/)
  })

  it('issues a Lets Encrypt certificate per DNS record, depending on it', () => {
    expect(src).toMatch(/new scaleway\.loadbalancers\.Certificate\(`\$\{baseName\(slug\)\}-cert`/)
    expect(src).toMatch(/commonName:\s*serviceHost\(slug\)/)
    expect(src).toMatch(/dependsOn:\s*\[dns\]/)
  })

  it('creates one LB backend per exposed service on its declared port', () => {
    expect(src).toMatch(/new scaleway\.loadbalancers\.Backend\(`\$\{service\.slug\}-lb-backend`/)
    expect(src).toMatch(/forwardPort:\s*service\.healthPort/)
    expect(src).toMatch(/serverIps:\s*serviceGenerationIps\(service\.slug\)/)
  })

  it('lets Pulumi own the server list so pulumi up re-points the LB to the new generation', () => {
    // serverIps comes from the active VM generation(s); Pulumi must NOT ignore
    // the field, or a generation replacement would leave the LB pointing at the
    // deleted old VMs. (The cutover task is the future zero-downtime owner, but
    // it is not wired into CI, so Pulumi owns serverIps for self-contained applies.)
    expect(src).not.toMatch(/ignoreChanges:\s*\['serverIps'\]/)
  })

  it('health-checks the app\'s own /health (no ingress hop)', () => {
    // The app binds the host port directly in the immutable-node model, so the
    // LB health-checks its real /health — a crashed generation is marked down.
    expect(src).toMatch(/uri:\s*'\/health'/)
    expect(src).not.toContain('__ingress/health')
    // onMarkedDownAction follows the service drainPolicy.
    expect(src).toMatch(/onMarkedDownAction:/)
    // Exactly one Backend construction site — the registry loop.
    expect(src.match(/new scaleway\.loadbalancers\.Backend\(/g)).toHaveLength(1)
  })

  it('keeps WebSocket LB timeouts gated on the registry lbWebsockets knob', () => {
    expect(src).toMatch(/service\.lbWebsockets \? \{ timeoutServer: '1h', timeoutTunnel: '1h' \}/)
  })

  it('adds a host-header route for every host-routed service', () => {
    expect(src).toMatch(/service\.lbRoute !== 'host'/)
    expect(src).toMatch(/new scaleway\.loadbalancers\.Route\(`\$\{baseName\(service\.slug\)\}-route`/)
    expect(src).toMatch(/matchHostHeader:\s*serviceHost\(service\.slug\)/)
  })

  it('keeps pre-refactor Pulumi resource names stable (regression guard)', () => {
    // backend→api and frontend→app produce the original URNs (api-dns,
    // api-cert, app-dns, app-cert, app-route) so no resource is replaced.
    expect(src).toMatch(/legacyBaseNames:\s*Record<string,\s*string>\s*=\s*\{\s*backend:\s*'api',\s*frontend:\s*'app'\s*\}/)
  })

  it('skips dns/cert/route for a service whose host is the zone apex', () => {
    expect(src).toMatch(/if \(host === dnsZone\) continue/)
  })

  it('registers the apex cert on the HTTPS frontend when app is not at apex', () => {
    expect(src).toMatch(/if \(apexCert\) allCertIds\.push\(apexCert\.id\)/)
  })

  it('exports a public URL per exposed service via the generic map only', () => {
    expect(src).toMatch(/export const serviceDomainUrls/)
    // No per-service named exports — a new service needs no export added.
    expect(src).not.toMatch(/export const (api|yjs|ai)DomainUrl/)
  })
})
