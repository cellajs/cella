import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const src = readFileSync(resolve(__dirname, '../../resources/loadbalancer.ts'), 'utf-8')

// Pins registry-driven LB wiring and the cutover-owned server list contract.
describe('loadbalancer module — registry-driven wiring', () => {
  it('derives the LB-exposed service set from the registry, never by name', () => {
    expect(src).toMatch(/enabledServices\(appConfig\.services\)\.filter\(\(s\) => s\.lbRoute\)/)
    // The default backend comes from the lbRoute 'default' declaration.
    expect(src).toMatch(/lbRoute === 'default'/)
    // No service-specific resource construction outside the loops.
    expect(src).not.toMatch(/new scaleway\.loadbalancers\.Backend\('(backend|yjs|ai|frontend)-lb-backend'/)
  })

  it('creates one DNS record per exposed service pointing at the LB IP', () => {
    expect(src).toMatch(/new scaleway\.domain\.Record\(`\$\{baseName\(service\.slug\)\}-dns`/)
    expect(src).toMatch(/data:\s*lbPublicIp/)
  })

  it('issues a Lets Encrypt certificate per DNS record, gated on public propagation', () => {
    expect(src).toMatch(/new scaleway\.loadbalancers\.Certificate\(`\$\{baseName\(slug\)\}-cert`/)
    expect(src).toMatch(/commonName:\s*serviceHost\(slug\)/)
    // Cert creation waits for the record to answer publicly (not merely exist),
    // and the frontend attach waits for the cert to be `ready` — both via the
    // create-only gates in resources/dns-cert-gates.ts.
    expect(src).toMatch(/dependsOn:\s*\[dns,\s*dnsGates\.get\(slug\)!\]/)
    expect(src).toMatch(/new DnsPropagationGate\(/)
    expect(src).toMatch(/new CertReadyGate\(/)
    expect(src).toMatch(/dependsOn:\s*certGates/)
  })

  it('creates one LB backend per exposed service on its declared port', () => {
    expect(src).toMatch(/new scaleway\.loadbalancers\.Backend\(`\$\{service\.slug\}-lb-backend`/)
    expect(src).toMatch(/forwardPort:\s*service\.healthPort/)
    expect(src).toMatch(/serverIps:\s*serviceGenerationIps\(service\.slug\)/)
  })

  it('lets the explicit cutover task own the live server list', () => {
    // Pulumi sets the initial serverIps, then ignores live drift so
    // tasks/cutover.ts can do expand/contract with SetBackendServers.
    expect(src).toMatch(/ignoreChanges:\s*\['serverIps'\]/)
  })

  it('health-checks the app\'s own /health (no ingress hop)', () => {
    // The app binds the host port directly in the immutable-node model, so the
    // LB health-checks its real /health: a crashed generation is marked down.
    expect(src).toMatch(/uri:\s*'\/health'/)
    expect(src).not.toContain('__ingress/health')
    // onMarkedDownAction follows the service drainPolicy.
    expect(src).toMatch(/onMarkedDownAction:/)
    // Exactly one Backend construction site: the registry loop.
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

  it('adds a path-begin route for every lbPathBegin service (same-origin migration)', () => {
    // Registry-driven like the host routes: the prefix comes from the service
    // declaration, never hardcoded per service, and targets the same backend.
    expect(src).toMatch(/if \(!service\.lbPathBegin\) continue/)
    expect(src).toMatch(/new scaleway\.loadbalancers\.Route\(`\$\{baseName\(service\.slug\)\}-path-route`/)
    expect(src).toMatch(/matchPathBegin:\s*service\.lbPathBegin/)
    expect(src).not.toMatch(/matchPathBegin:\s*'/)
  })

  it('keeps pre-refactor Pulumi resource names stable (regression guard)', () => {
    // backend→api and frontend→app produce the original URNs (api-dns,
    // api-cert, app-dns, app-cert, app-route) so no resource is replaced.
    expect(src).toMatch(/legacyBaseNames:\s*Partial<Record<ServiceName,\s*string>>\s*=\s*\{\s*backend:\s*'api',\s*frontend:\s*'app'\s*\}/)
  })

  it('skips dns/cert/route for a service whose host is the zone apex', () => {
    expect(src).toMatch(/if \(host === dnsZone\) continue/)
  })

  it('registers the apex cert on the HTTPS frontend when app is not at apex', () => {
    expect(src).toMatch(/if \(apexCert\) allCertIds\.push\(apexCert\.id\)/)
  })

  it('exports a public URL per exposed service via the generic map only', () => {
    expect(src).toMatch(/export const serviceDomainUrls/)
    // No per-service named exports: a new service needs no export added.
    expect(src).not.toMatch(/export const (api|yjs|ai)DomainUrl/)
  })
})
