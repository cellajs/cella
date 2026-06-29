/**
 * Load Balancer — TLS termination, host-header routing, and the public DNS
 * records for every LB-exposed service.
 *
 * One LB-S sits on the main private network with a static public IPv4. HTTPS on
 * 443 fans out by Host header; each exposed service gets its own Let's Encrypt
 * cert and health check. WHICH services are exposed — and how — is derived from
 * the canonical service registry (`lbRoute` in `config/services.config.ts`):
 *  - 'default' — the LB's fallback backend (the API); DNS + cert, no route.
 *  - 'host'    — host-header routed; own DNS record + cert + route.
 *  - absent    — internal-only (cdc); nothing is created here.
 * Adding a registry entry with an `lbRoute` is enough to get its DNS record,
 * cert, LB backend and route — no service is listed by name in this file.
 *
 * The apex/www machinery (apex→www redirect, apex cert) is cella-owned
 * structure keyed to the frontend service, not per-service data. HTTP on 80
 * only carries the HTTP→HTTPS redirect ACL.
 *
 * Only provisioned when a real domain is configured AND compute is enabled,
 * since without compute VMs the LB has no backends to route to.
 */
import * as pulumi from '@pulumi/pulumi'
import * as scaleway from '@pulumiverse/scaleway'
import { appConfig } from '../../shared'
import { naming, zone, tags, dnsZone, serviceHost, infra, endpoints } from '../pulumi-context'
import { enabledServices } from '../lib/services'
import type { ServiceName } from '../compose/compose'
import { privateNetworkId } from './network'
import { serviceGenerationIps } from './compute'

/**
 * Pre-refactor resource base names, kept so Pulumi URNs (and Scaleway display
 * names) stay stable for resources that predate the registry-driven loop.
 * Migration metadata only — a NEW service needs no entry here.
 */
const legacyBaseNames: Record<string, string> = { backend: 'api', frontend: 'app' }
const baseName = (slug: string) => legacyBaseNames[slug] ?? slug

const _serviceUrls: Record<string, pulumi.Output<string>> = {}
let _lbId: pulumi.Output<string | undefined> = pulumi.output(undefined)
let _lbBackendIds: pulumi.Output<Record<string, string>> = pulumi.output({} as Record<string, string>)

// ---------------------------------------------------------------------------
// Guard — skip while compute is deferred (fresh bootstrap); without compute VMs
// the LB has no backends to route to. A real domain is asserted in pulumi-context.
// ---------------------------------------------------------------------------

if (infra.computeEnabled) {
  // LB-exposed services, derived from the canonical registry (feature flag +
  // `lbRoute`) so the LB never re-decides independently of compute. A service
  // is LB-exposed iff it is enabled AND declares an `lbRoute`.
  const lbServices = enabledServices(appConfig.services).filter((s) => s.lbRoute)
  const defaultService = lbServices.find((s) => s.lbRoute === 'default')
  if (!defaultService) {
    throw new Error("loadbalancer: no enabled service declares lbRoute 'default' — the HTTPS frontend needs a fallback backend.")
  }

  // Public scheme per service (https: / wss:), from the appConfig-derived
  // registry endpoints — not re-decided here.
  const schemeBySlug = new Map(endpoints.map((e) => [e.slug, new URL(e.url).protocol]))

  const appHost = serviceHost('frontend')
  const appIsAtApex = appHost === dnsZone

  // -------------------------------------------------------------------------
  // LB IP (static public IPv4)
  // -------------------------------------------------------------------------

  const lbIp = new scaleway.loadbalancers.Ip('lb-ip', {
    zone,
  })

  // -------------------------------------------------------------------------
  // Load Balancer
  // -------------------------------------------------------------------------

  const lb = new scaleway.loadbalancers.LoadBalancer('main-lb', {
    name: naming.resource('lb'),
    ipIds: [lbIp.id],
    type: 'LB-S',
    zone,
    tags,
    privateNetworks: [{
      privateNetworkId,
    }],
  })
  _lbId = lb.id

  // -------------------------------------------------------------------------
  // DNS A Records — all point to the LB public IP.
  // Must exist BEFORE Let's Encrypt certificates, since Scaleway validates
  // the cert by resolving the FQDN to the LB IP at creation time.
  // -------------------------------------------------------------------------

  const lbPublicIp = lb.ipAddress

  const dnsRecords = new Map<ServiceName, scaleway.domain.Record>()
  for (const service of lbServices) {
    const host = serviceHost(service.slug)
    // A service whose host IS the zone apex (frontend at apex) gets no own
    // record/cert/route — the default backend would have to serve it, which we
    // don't currently support; the apex handling below covers that hostname.
    if (host === dnsZone) continue
    dnsRecords.set(service.slug, new scaleway.domain.Record(`${baseName(service.slug)}-dns`, {
      dnsZone,
      name: host.replace(`.${dnsZone}`, ''),
      type: 'A',
      data: lbPublicIp,
      ttl: 300,
    }))
  }

  // Apex → points at the LB so the apex→www redirect ACL below can answer.
  let apexDns: scaleway.domain.Record | undefined
  if (!appIsAtApex) {
    apexDns = new scaleway.domain.Record('apex-dns', {
      dnsZone,
      name: '',
      type: 'A',
      data: lbPublicIp,
      ttl: 300,
    })
  }

  // -------------------------------------------------------------------------
  // Let's Encrypt certificates — depend on DNS records so the FQDN
  // resolves to the LB IP before Scaleway runs the ACME validation.
  // -------------------------------------------------------------------------

  const certs = new Map<ServiceName, scaleway.loadbalancers.Certificate>()
  for (const [slug, dns] of dnsRecords) {
    certs.set(slug, new scaleway.loadbalancers.Certificate(`${baseName(slug)}-cert`, {
      lbId: lb.id,
      name: naming.resource(`${baseName(slug)}-cert`),
      letsencrypt: {
        commonName: serviceHost(slug),
      },
    }, { dependsOn: [dns] }))
  }

  let apexCert: scaleway.loadbalancers.Certificate | undefined
  if (!appIsAtApex && apexDns) {
    apexCert = new scaleway.loadbalancers.Certificate('apex-cert', {
      lbId: lb.id,
      name: naming.resource('apex-cert'),
      letsencrypt: {
        commonName: dnsZone,
      },
    }, { dependsOn: [apexDns] })
  }

  // -------------------------------------------------------------------------
  // LB Backends — each targets the private IPs of its service's active VM
  // generation(s). Pulumi sets the initial list, then ignores live changes so
  // tasks/cutover.ts can perform explicit expand→health→contract handoff via
  // Scaleway SetBackendServers without Pulumi fighting drift. Health checks hit
  // the app's own `/health` (no ingress hop): a crashed generation is correctly
  // marked down.
  // `onMarkedDownAction` follows the service's drainPolicy — HTTP services let
  // in-flight requests finish ('none'); WebSocket services shed sessions so
  // clients reconnect to the new generation ('shutdown_sessions').
  // -------------------------------------------------------------------------

  const backends = new Map<ServiceName, scaleway.loadbalancers.Backend>()
  for (const service of lbServices) {
    // backend/yjs/ai answer /health with 204; the frontend Caddy proxy with 200.
    const healthCode = service.slug === 'frontend' ? 200 : 204
    backends.set(service.slug, new scaleway.loadbalancers.Backend(`${service.slug}-lb-backend`, {
      lbId: lb.id,
      name: naming.resource(service.slug),
      forwardProtocol: 'http',
      forwardPort: service.healthPort,
      serverIps: serviceGenerationIps(service.slug),
      onMarkedDownAction: service.drainPolicy === 'reconnect' ? 'shutdown_sessions' : 'none',
      healthCheckHttp: { uri: '/health', code: healthCode },
      healthCheckDelay: '3s',
      healthCheckTimeout: '2s',
      healthCheckMaxRetries: 2,
      // Long timeouts keep WebSocket connections open (registry `lbWebsockets`).
      ...(service.lbWebsockets ? { timeoutServer: '1h', timeoutTunnel: '1h' } : {}),
    }, {
      ignoreChanges: ['serverIps'],
    }))
  }

  const defaultBackend = backends.get(defaultService.slug)!
  _lbBackendIds = pulumi.output(Object.fromEntries([...backends.entries()].map(([service, backend]) => [service, backend.id])))

  // -------------------------------------------------------------------------
  // HTTPS Frontend (port 443) — TLS termination + host-header routes
  // -------------------------------------------------------------------------

  const allCertIds: pulumi.Input<string>[] = [...certs.values()].map((cert) => cert.id)
  if (apexCert) allCertIds.push(apexCert.id)

  const httpsFrontend = new scaleway.loadbalancers.Frontend('https-frontend', {
    lbId: lb.id,
    name: naming.resource('https'),
    backendId: defaultBackend.id, // Default backend (the lbRoute 'default' service)
    inboundPort: 443,
    certificateIds: allCertIds,
  })

  // Host-header routes for every host-routed service with a DNS record.
  for (const service of lbServices) {
    if (service.lbRoute !== 'host' || !dnsRecords.has(service.slug)) continue
    new scaleway.loadbalancers.Route(`${baseName(service.slug)}-route`, {
      frontendId: httpsFrontend.id,
      backendId: backends.get(service.slug)!.id,
      matchHostHeader: serviceHost(service.slug),
    })
  }

  // Apex → www redirect (HTTPS) via ACL on the HTTPS frontend
  if (!appIsAtApex) {
    new scaleway.loadbalancers.Acl('apex-redirect-https', {
      frontendId: httpsFrontend.id,
      name: naming.resource('apex-redirect'),
      index: 0,
      action: {
        type: 'redirect',
        redirects: [{
          type: 'location',
          // Preserve the original path and query so deep links (e.g. /static/logo/logo.png)
          // survive the apex→www redirect. Scaleway supports {{host}}, {{path}} and {{query}}
          // placeholders; {{path}} does NOT include the leading slash, so it must be added
          // literally — matching Scaleway's documented format `https://{{host}}/{{path}}?{{query}}`.
          // Omitting it yields a garbled redirect like `https://www.example.comauth/authenticate`.
          target: `https://${appHost}/{{path}}?{{query}}`,
          code: 301,
        }],
      },
      match: {
        httpFilter: 'http_header_match',
        httpFilterOption: 'host',
        httpFilterValues: [dnsZone],
      },
    })
  }

  // -------------------------------------------------------------------------
  // HTTP Frontend (port 80) — redirect all to HTTPS
  // -------------------------------------------------------------------------

  const httpFrontend = new scaleway.loadbalancers.Frontend('http-frontend', {
    lbId: lb.id,
    name: naming.resource('http'),
    backendId: defaultBackend.id, // Required but never reached (ACL redirects all)
    inboundPort: 80,
  })

  new scaleway.loadbalancers.Acl('http-to-https', {
    frontendId: httpFrontend.id,
    name: naming.resource('http-redirect'),
    index: 0,
    action: {
      type: 'redirect',
      redirects: [{
        type: 'scheme',
        target: 'https',
        code: 301,
      }],
    },
    match: {
      // Match everything on port 80
      httpFilter: 'acl_http_filter_none',
    },
  })

  // -------------------------------------------------------------------------
  // Exports — public URL per LB-exposed service (scheme from appConfig)
  // -------------------------------------------------------------------------

  for (const service of lbServices) {
    const scheme = schemeBySlug.get(service.slug) ?? 'https:'
    _serviceUrls[service.slug] = pulumi.output(`${scheme}//${serviceHost(service.slug)}`)
  }
}

/** Public URL per LB-exposed service slug; empty when no domain/compute. */
export const serviceDomainUrls: Readonly<Record<string, pulumi.Output<string>>> = _serviceUrls
export const lbId = _lbId
export const lbBackendIds = _lbBackendIds
