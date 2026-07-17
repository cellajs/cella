import * as pulumi from '@pulumi/pulumi'
import * as scaleway from '@pulumiverse/scaleway'
import { appConfig } from '../../shared'
import { naming, zone, tags, dnsZone, serviceHost, serviceUrl, infra } from '../pulumi-context'
import { enabledServices } from '../lib/services'
import type { ServiceName } from '../compose/compose'
import { privateNetworkId } from './network'
import { serviceGenerationIps } from './compute'
import { CertReadyGate, DnsPropagationGate } from './dns-cert-gates'

/**
 * Resource base names for resources whose shipped Pulumi URNs and Scaleway
 * display names predate the registry-driven loop.
 */
const legacyBaseNames: Partial<Record<ServiceName, string>> = { backend: 'api', frontend: 'app' }
const baseName = (slug: ServiceName) => legacyBaseNames[slug] ?? slug

/** Everything the rest of the program consumes from this module. */
interface LoadBalancerOutputs {
  /** Public URL per LB-exposed service slug. */
  serviceUrls: Record<string, pulumi.Output<string>>
  lbId: pulumi.Output<string | undefined>
  lbBackendIds: pulumi.Output<Record<string, string>>
}

/** Provision the LB + DNS + certs + backends/frontends and return the outputs. */
function provisionLoadBalancer(): LoadBalancerOutputs {
  // LB-exposed services, derived from the canonical registry (feature flag +
  // `lbRoute`) so the LB never re-decides independently of compute. A service
  // is LB-exposed iff it is enabled AND declares an `lbRoute`.
  const lbServices = enabledServices(appConfig.services).filter((s) => s.lbRoute)
  const defaultService = lbServices.find((s) => s.lbRoute === 'default')
  if (!defaultService) {
    throw new Error("loadbalancer: no enabled service declares lbRoute 'default' — the HTTPS frontend needs a fallback backend.")
  }

  const appHost = serviceHost('frontend')
  const appIsAtApex = appHost === dnsZone

  // Public hosts: one DNS record + cert per unique HOSTNAME, not per service.
  // Under the same-origin model every path-routed service shares the app host,
  // so a per-service loop would emit duplicate records. `base` names the Pulumi
  // resources and the first service carrying a host claims it: the default (app)
  // service goes first, so the shared app host keeps its `app-*` URNs. A fork
  // running host-routed services gets one host (and one base name) per service.

  interface PublicHost {
    host: string
    /** Resource base name of the first service carrying this host. */
    base: string
  }

  const hostEntries = new Map<string, PublicHost>()
  for (const service of [defaultService, ...lbServices.filter((s) => s !== defaultService)]) {
    const host = serviceHost(service.slug)
    if (!hostEntries.has(host)) hostEntries.set(host, { host, base: baseName(service.slug) })
  }
  const publicHosts = [...hostEntries.values()]

  // LB IP (static public IPv4)

  const lbIp = new scaleway.loadbalancers.Ip('lb-ip', {
    zone,
  })

  // Load Balancer

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

  // DNS A Records: all point to the LB public IP.
  // Must exist BEFORE Let's Encrypt certificates, since Scaleway validates
  // the cert by resolving the FQDN to the LB IP at creation time.

  const lbPublicIp = lb.ipAddress

  const dnsRecords = new Map<string, scaleway.domain.Record>()
  const dnsGates = new Map<string, DnsPropagationGate>()
  for (const { host, base } of publicHosts) {
    // A host that IS the zone apex (frontend at apex) gets no own
    // record/cert/route. The default backend would have to serve it, which we
    // don't currently support; the apex handling below covers that hostname.
    if (host === dnsZone) continue
    const record = new scaleway.domain.Record(`${base}-dns`, {
      dnsZone,
      name: host.replace(`.${dnsZone}`, ''),
      type: 'A',
      data: lbPublicIp,
      ttl: 300,
    })
    dnsRecords.set(host, record)
    // Hold the cert request until the record answers on public resolvers, so
    // the ACME validation never races propagation (see dns-cert-gates.ts).
    dnsGates.set(host, new DnsPropagationGate(`${base}-dns-gate`, {
      fqdn: host,
      expectedIp: lbPublicIp,
    }, { dependsOn: [record] }))
  }

  // Apex → points at the LB so the apex→www redirect ACL below can answer.
  let apexDns: scaleway.domain.Record | undefined
  let apexDnsGate: DnsPropagationGate | undefined
  if (!appIsAtApex) {
    apexDns = new scaleway.domain.Record('apex-dns', {
      dnsZone,
      name: '',
      type: 'A',
      data: lbPublicIp,
      ttl: 300,
    })
    apexDnsGate = new DnsPropagationGate('apex-dns-gate', {
      fqdn: dnsZone,
      expectedIp: lbPublicIp,
    }, { dependsOn: [apexDns] })
  }

  // Let's Encrypt certificates: gated on the DNS record being publicly
  // resolvable (not merely created) before Scaleway runs the ACME validation,
  // and gated after on `ready` status so an issuance failure surfaces AT the
  // cert with its ACME detail instead of at the frontend attach.

  const certs = new Map<string, scaleway.loadbalancers.Certificate>()
  const certGates: CertReadyGate[] = []
  for (const { host, base } of publicHosts) {
    const dns = dnsRecords.get(host)
    if (!dns) continue // apex-hosted: covered by the apex cert below
    const cert = new scaleway.loadbalancers.Certificate(`${base}-cert`, {
      lbId: lb.id,
      name: naming.resource(`${base}-cert`),
      letsencrypt: {
        commonName: host,
      },
    }, { dependsOn: [dns, dnsGates.get(host)!] })
    certs.set(host, cert)
    certGates.push(new CertReadyGate(`${base}-cert-ready`, { certificateId: cert.id }, { dependsOn: [cert] }))
  }

  let apexCert: scaleway.loadbalancers.Certificate | undefined
  if (!appIsAtApex && apexDns && apexDnsGate) {
    apexCert = new scaleway.loadbalancers.Certificate('apex-cert', {
      lbId: lb.id,
      name: naming.resource('apex-cert'),
      letsencrypt: {
        commonName: dnsZone,
      },
    }, { dependsOn: [apexDns, apexDnsGate] })
    certGates.push(new CertReadyGate('apex-cert-ready', { certificateId: apexCert.id }, { dependsOn: [apexCert] }))
  }

  // LB Backends: each targets the private IPs of its service's active VM
  // generation(s). Pulumi sets the initial list, then ignores live changes so
  // tasks/cutover.ts can perform explicit expand→health→contract handoff via
  // Scaleway SetBackendServers without Pulumi fighting drift. Health checks hit
  // the app's own `/health` (no ingress hop): a crashed generation is correctly
  // marked down.
  // `onMarkedDownAction` follows the service's drainPolicy: HTTP services let
  // in-flight requests finish ('none'); WebSocket services shed sessions so
  // clients reconnect to the new generation ('shutdown_sessions').

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

  // HTTPS Frontend (port 443): TLS termination + host-header routes

  const allCertIds: pulumi.Input<string>[] = [...certs.values()].map((cert) => cert.id)
  if (apexCert) allCertIds.push(apexCert.id)

  const httpsFrontend = new scaleway.loadbalancers.Frontend('https-frontend', {
    lbId: lb.id,
    name: naming.resource('https'),
    backendId: defaultBackend.id, // Default backend (the lbRoute 'default' service)
    inboundPort: 443,
    certificateIds: allCertIds,
  }, {
    // Attach only certs proven `ready` — a pending/errored cert fails its own
    // gate first, with the ACME detail (see dns-cert-gates.ts).
    dependsOn: certGates,
  })

  // Host-header routes for every host-routed service with a DNS record.
  // (No shipped service is host-routed after the same-origin migration; the
  // loop stays for forks that still run — or add — host-routed services.)
  for (const service of lbServices) {
    if (service.lbRoute !== 'host' || !dnsRecords.has(serviceHost(service.slug))) continue
    new scaleway.loadbalancers.Route(`${baseName(service.slug)}-route`, {
      frontendId: httpsFrontend.id,
      backendId: backends.get(service.slug)!.id,
      matchHostHeader: serviceHost(service.slug),
    })
  }

  // Path-begin routes (same-origin model): `https://<any host>/<prefix>...`
  // reaches the service's backend; everything else falls through to the
  // default backend (the app origin / SPA proxy). Scaleway routes match on
  // exactly ONE criterion (host or path) and do NOT strip the prefix — each
  // service also serves itself under its `lbPathBegin` (registry-declared;
  // validated in compose/infrastructure.ts).
  for (const service of lbServices) {
    if (!service.lbPathBegin) continue
    new scaleway.loadbalancers.Route(`${baseName(service.slug)}-path-route`, {
      frontendId: httpsFrontend.id,
      backendId: backends.get(service.slug)!.id,
      matchPathBegin: service.lbPathBegin,
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
          // literally, matching Scaleway's documented format `https://{{host}}/{{path}}?{{query}}`.
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

  // HTTP Frontend (port 80): redirect all to HTTPS

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

  // Outputs: public URL per LB-exposed service (scheme from appConfig)

  const serviceUrls: Record<string, pulumi.Output<string>> = {}
  for (const service of lbServices) {
    // The full public URL (path-routed services carry their prefix, e.g.
    // https://www.example.com/api); lbServices ⊆ endpoints, so this always hits.
    serviceUrls[service.slug] = pulumi.output(serviceUrl(service.slug))
  }

  return {
    serviceUrls,
    lbId: lb.id,
    lbBackendIds: pulumi.output(Object.fromEntries([...backends.entries()].map(([service, backend]) => [service, backend.id]))),
  }
}

// Guard: skip while compute is deferred (fresh bootstrap); without compute VMs
// the LB has no backends to route to. A real domain is asserted in pulumi-context.
const outputs: LoadBalancerOutputs = infra.computeEnabled
  ? provisionLoadBalancer()
  : { serviceUrls: {}, lbId: pulumi.output(undefined), lbBackendIds: pulumi.output({} as Record<string, string>) }

/** Public URL per LB-exposed service slug; empty when no domain/compute. */
export const serviceDomainUrls: Readonly<Record<string, pulumi.Output<string>>> = outputs.serviceUrls
export const lbId = outputs.lbId
export const lbBackendIds = outputs.lbBackendIds
