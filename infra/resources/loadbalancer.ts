/**
 * Load Balancer — TLS termination, host-header routing, and the public DNS records
 * for the API, Yjs, AI and apex hostnames.
 *
 * One LB-S sits on the main private network with a static public IPv4. HTTPS on 443
 * fans out to backend (4000), yjs (4002) and ai (4003) by Host header, each with its
 * own Let's Encrypt cert and health check. HTTP on 80 only carries redirect ACLs
 * (HTTP→HTTPS, plus apex→www so the apex stays canonical-free).
 *
 * Only provisioned when a real domain is configured AND compute is enabled,
 * since without compute VMs the LB has no backends to route to.
 */
import * as pulumi from '@pulumi/pulumi'
import * as scaleway from '@pulumiverse/scaleway'
import { naming, zone, tags, dnsZone, serviceHost, hasDomain, infra, appConfig } from '../helpers'
import { enabledServices } from '../lib/services'
import { privateNetworkId } from './network'
import { getInstanceIp } from './compute'

// ---------------------------------------------------------------------------
// Guard — skip if no domain or not deploying compute
// ---------------------------------------------------------------------------

let _apiDomainUrl: pulumi.Output<string> | undefined
let _yjsDomainUrl: pulumi.Output<string> | undefined
let _aiDomainUrl: pulumi.Output<string> | undefined

if (hasDomain && infra.computeEnabled) {
  // Which optional services this app exposes publicly — derived from the
  // canonical registry (feature flag + `lbRoute`) so the LB never re-decides
  // independently of compute. A service is LB-exposed iff it is enabled AND
  // declares an `lbRoute` (cdc has none → internal-only).
  const lbServiceNames = new Set(
    enabledServices(appConfig.has).filter((s) => s.lbRoute).map((s) => s.slug),
  )
  const yjsEnabled = lbServiceNames.has('yjs')
  const aiEnabled = lbServiceNames.has('ai')

  // Local hostname/zone bundle, derived from the service registry (slug → host)
  // plus the DNS zone — not a parallel source of truth. Keeps the cert/route/DNS
  // wiring below readable without re-deriving `serviceHost(...)` at each call.
  const domains = {
    zone: dnsZone,
    app: serviceHost('frontend'),
    api: serviceHost('backend'),
    yjs: serviceHost('yjs'),
    ai: serviceHost('ai'),
  }

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

  const appIsAtApex = domains.app === domains.zone

  // -------------------------------------------------------------------------
  // DNS A Records — all point to the LB public IP.
  // Must exist BEFORE Let's Encrypt certificates, since Scaleway validates
  // the cert by resolving the FQDN to the LB IP at creation time.
  // -------------------------------------------------------------------------

  const lbPublicIp = lb.ipAddress

  const apiSubdomain = domains.api.replace(`.${domains.zone}`, '')
  const yjsSubdomain = domains.yjs.replace(`.${domains.zone}`, '')
  const aiSubdomain = domains.ai.replace(`.${domains.zone}`, '')
  const appSubdomain = domains.app.replace(`.${domains.zone}`, '')

  const apiDns = new scaleway.domain.Record('api-dns', {
    dnsZone: domains.zone,
    name: apiSubdomain,
    type: 'A',
    data: lbPublicIp,
    ttl: 300,
  })

  // Conditionally create yjs DNS record
  let yjsDns: scaleway.domain.Record | undefined
  if (yjsEnabled) {
    yjsDns = new scaleway.domain.Record('yjs-dns', {
      dnsZone: domains.zone,
      name: yjsSubdomain,
      type: 'A',
      data: lbPublicIp,
      ttl: 300,
    })
  }

  // Conditionally create ai DNS record
  let aiDns: scaleway.domain.Record | undefined
  if (aiEnabled) {
    aiDns = new scaleway.domain.Record('ai-dns', {
      dnsZone: domains.zone,
      name: aiSubdomain,
      type: 'A',
      data: lbPublicIp,
      ttl: 300,
    })
  }

  // App (www) DNS — points at the LB, which serves the SPA via the Caddy
  // frontend VM.
  let appDns: scaleway.domain.Record | undefined
  if (!appIsAtApex) {
    appDns = new scaleway.domain.Record('app-dns', {
      dnsZone: domains.zone,
      name: appSubdomain,
      type: 'A',
      data: lbPublicIp,
      ttl: 300,
    })
  }

  let apexDns: scaleway.domain.Record | undefined
  if (!appIsAtApex) {
    apexDns = new scaleway.domain.Record('apex-dns', {
      dnsZone: domains.zone,
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

  const apiCert = new scaleway.loadbalancers.Certificate('api-cert', {
    lbId: lb.id,
    name: naming.resource('api-cert'),
    letsencrypt: {
      commonName: domains.api,
    },
  }, { dependsOn: [apiDns] })

  // Conditionally create yjs certificate
  let yjsCert: scaleway.loadbalancers.Certificate | undefined
  if (yjsEnabled && yjsDns) {
    yjsCert = new scaleway.loadbalancers.Certificate('yjs-cert', {
      lbId: lb.id,
      name: naming.resource('yjs-cert'),
      letsencrypt: {
        commonName: domains.yjs,
      },
    }, { dependsOn: [yjsDns] })
  }

  // Conditionally create ai certificate
  let aiCert: scaleway.loadbalancers.Certificate | undefined
  if (aiEnabled && aiDns) {
    aiCert = new scaleway.loadbalancers.Certificate('ai-cert', {
      lbId: lb.id,
      name: naming.resource('ai-cert'),
      letsencrypt: {
        commonName: domains.ai,
      },
    }, { dependsOn: [aiDns] })
  }

  let apexCert: scaleway.loadbalancers.Certificate | undefined
  if (!appIsAtApex && apexDns) {
    apexCert = new scaleway.loadbalancers.Certificate('apex-cert', {
      lbId: lb.id,
      name: naming.resource('apex-cert'),
      letsencrypt: {
        commonName: domains.zone,
      },
    }, { dependsOn: [apexDns] })
  }

  let appCert: scaleway.loadbalancers.Certificate | undefined
  if (!appIsAtApex && appDns) {
    appCert = new scaleway.loadbalancers.Certificate('app-cert', {
      lbId: lb.id,
      name: naming.resource('app-cert'),
      letsencrypt: {
        commonName: domains.app,
      },
    }, { dependsOn: [appDns] })
  }

  // -------------------------------------------------------------------------
  // LB Backends — each points to a VM's private IP
  // -------------------------------------------------------------------------

  const backendIp = getInstanceIp('backend')
  const yjsIp = getInstanceIp('yjs')
  const aiIp = getInstanceIp('ai')
  const frontendIp = getInstanceIp('frontend')

  const backendBackend = new scaleway.loadbalancers.Backend('backend-lb-backend', {
    lbId: lb.id,
    name: naming.resource('backend'),
    forwardProtocol: 'http',
    forwardPort: 4000,
    serverIps: [backendIp],
    // Health-check the ingress proxy's own liveness endpoint, not the app's
    // /health. The ingress always answers 200 while its process is up, so an
    // app-container rollover (brief 502s on proxied paths) never drains this
    // backend. See infra/ingress.Caddyfile.
    healthCheckHttp: { uri: '/__ingress/health', code: 200 },
    healthCheckDelay: '3s',
    healthCheckTimeout: '2s',
    healthCheckMaxRetries: 2,
  })

  // Conditionally create yjs backend
  let yjsBackend: scaleway.loadbalancers.Backend | undefined
  if (yjsEnabled) {
    yjsBackend = new scaleway.loadbalancers.Backend('yjs-lb-backend', {
      lbId: lb.id,
      name: naming.resource('yjs'),
      forwardProtocol: 'http',
      forwardPort: 4002,
      serverIps: [yjsIp],
      healthCheckHttp: { uri: '/__ingress/health', code: 200 },
      healthCheckDelay: '3s',
      healthCheckTimeout: '2s',
      healthCheckMaxRetries: 2,
      // Long timeout for WebSocket connections
      timeoutServer: '1h',
      timeoutTunnel: '1h',
    })
  }

  // Conditionally create ai backend
  let aiBackend: scaleway.loadbalancers.Backend | undefined
  if (aiEnabled) {
    aiBackend = new scaleway.loadbalancers.Backend('ai-lb-backend', {
      lbId: lb.id,
      name: naming.resource('ai'),
      forwardProtocol: 'http',
      forwardPort: 4003,
      serverIps: [aiIp],
      healthCheckHttp: { uri: '/__ingress/health', code: 200 },
      healthCheckDelay: '3s',
      healthCheckTimeout: '2s',
      healthCheckMaxRetries: 2,
    })
  }

  // Caddy reverse-proxy in front of the SPA bucket. Listens on :80 inside
  // the container; LB forwards plain HTTP and adds TLS at the edge.
  const frontendBackend = new scaleway.loadbalancers.Backend('frontend-lb-backend', {
    lbId: lb.id,
    name: naming.resource('frontend'),
    forwardProtocol: 'http',
    forwardPort: 80,
    serverIps: [frontendIp],
    healthCheckHttp: { uri: '/__ingress/health', code: 200 },
    healthCheckDelay: '3s',
    healthCheckTimeout: '2s',
    healthCheckMaxRetries: 2,
  })

  // -------------------------------------------------------------------------
  // HTTPS Frontend (port 443) — TLS termination + host-header routes
  // -------------------------------------------------------------------------

  const allCertIds = [apiCert.id]
  if (yjsCert) allCertIds.push(yjsCert.id)
  if (aiCert) allCertIds.push(aiCert.id)
  if (apexCert) allCertIds.push(apexCert.id)
  if (appCert) allCertIds.push(appCert.id)

  const httpsFrontend = new scaleway.loadbalancers.Frontend('https-frontend', {
    lbId: lb.id,
    name: naming.resource('https'),
    backendId: backendBackend.id, // Default backend (api)
    inboundPort: 443,
    certificateIds: allCertIds,
  })

  // Host-header routes for yjs and ai (backend is the default)
  if (yjsEnabled && yjsBackend) {
    new scaleway.loadbalancers.Route('yjs-route', {
      frontendId: httpsFrontend.id,
      backendId: yjsBackend.id,
      matchHostHeader: domains.yjs,
    })
  }

  if (aiEnabled && aiBackend) {
    new scaleway.loadbalancers.Route('ai-route', {
      frontendId: httpsFrontend.id,
      backendId: aiBackend.id,
      matchHostHeader: domains.ai,
    })
  }

  // www (app) route — only when app is on its own subdomain. When app is at
  // the apex, the default backend would have to be frontend instead of api,
  // which we don't currently support.
  if (!appIsAtApex) {
    new scaleway.loadbalancers.Route('app-route', {
      frontendId: httpsFrontend.id,
      backendId: frontendBackend.id,
      matchHostHeader: domains.app,
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
          // placeholders; {{path}} includes the leading slash.
          target: `https://${domains.app}{{path}}?{{query}}`,
          code: 301,
        }],
      },
      match: {
        httpFilter: 'http_header_match',
        httpFilterOption: 'host',
        httpFilterValues: [domains.zone],
      },
    })
  }

  // -------------------------------------------------------------------------
  // HTTP Frontend (port 80) — redirect all to HTTPS
  // -------------------------------------------------------------------------

  const httpFrontend = new scaleway.loadbalancers.Frontend('http-frontend', {
    lbId: lb.id,
    name: naming.resource('http'),
    backendId: backendBackend.id, // Required but never reached (ACL redirects all)
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
  // Exports
  // -------------------------------------------------------------------------

  _apiDomainUrl = pulumi.interpolate`https://${domains.api}`
  if (yjsEnabled) {
    _yjsDomainUrl = pulumi.interpolate`wss://${domains.yjs}`
  }
  if (aiEnabled) {
    _aiDomainUrl = pulumi.interpolate`https://${domains.ai}`
  }
}

export const apiDomainUrl = _apiDomainUrl
export const yjsDomainUrl = _yjsDomainUrl
export const aiDomainUrl = _aiDomainUrl
