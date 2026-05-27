/**
 * Load Balancer — TLS termination, host-header routing, and the public DNS records
 * for the API, Yjs, AI and apex hostnames.
 *
 * One LB-S sits on the main private network with a static public IPv4. HTTPS on 443
 * fans out to backend (4000), yjs (4002) and ai (4003) by Host header, each with its
 * own Let's Encrypt cert and health check. HTTP on 80 only carries redirect ACLs
 * (HTTP→HTTPS, plus apex→www so the apex stays canonical-free).
 *
 * Only provisioned when a real domain is configured AND deployCompute is true,
 * since without compute VMs the LB has no backends to route to.
 */
import * as pulumi from '@pulumi/pulumi'
import * as scaleway from '@pulumiverse/scaleway'
import { naming, zone, tags, domains, hasDomain, infra } from '../helpers'
import { privateNetworkId } from './network'
import { getInstanceIp } from './compute'

// ---------------------------------------------------------------------------
// Guard — skip if no domain or not deploying compute
// ---------------------------------------------------------------------------

let _apiDomainUrl: pulumi.Output<string> | undefined
let _yjsDomainUrl: pulumi.Output<string> | undefined
let _aiDomainUrl: pulumi.Output<string> | undefined

if (hasDomain && infra.deployCompute) {
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

  const apiDns = new scaleway.domain.Record('api-dns', {
    dnsZone: domains.zone,
    name: apiSubdomain,
    type: 'A',
    data: lbPublicIp,
    ttl: 300,
  })

  const yjsDns = new scaleway.domain.Record('yjs-dns', {
    dnsZone: domains.zone,
    name: yjsSubdomain,
    type: 'A',
    data: lbPublicIp,
    ttl: 300,
  })

  const aiDns = new scaleway.domain.Record('ai-dns', {
    dnsZone: domains.zone,
    name: aiSubdomain,
    type: 'A',
    data: lbPublicIp,
    ttl: 300,
  })

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

  const yjsCert = new scaleway.loadbalancers.Certificate('yjs-cert', {
    lbId: lb.id,
    name: naming.resource('yjs-cert'),
    letsencrypt: {
      commonName: domains.yjs,
    },
  }, { dependsOn: [yjsDns] })

  const aiCert = new scaleway.loadbalancers.Certificate('ai-cert', {
    lbId: lb.id,
    name: naming.resource('ai-cert'),
    letsencrypt: {
      commonName: domains.ai,
    },
  }, { dependsOn: [aiDns] })

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

  // -------------------------------------------------------------------------
  // LB Backends — each points to a VM's private IP
  // -------------------------------------------------------------------------

  const backendIp = getInstanceIp('backend')
  const yjsIp = getInstanceIp('yjs')
  const aiIp = getInstanceIp('ai')

  const backendBackend = new scaleway.loadbalancers.Backend('backend-lb-backend', {
    lbId: lb.id,
    name: naming.resource('backend'),
    forwardProtocol: 'http',
    forwardPort: 4000,
    serverIps: [backendIp],
    healthCheckHttp: { uri: '/health', code: 204 },
    healthCheckDelay: '3s',
    healthCheckTimeout: '2s',
    healthCheckMaxRetries: 2,
  })

  const yjsBackend = new scaleway.loadbalancers.Backend('yjs-lb-backend', {
    lbId: lb.id,
    name: naming.resource('yjs'),
    forwardProtocol: 'http',
    forwardPort: 4002,
    serverIps: [yjsIp],
    healthCheckHttp: { uri: '/health', code: 204 },
    healthCheckDelay: '3s',
    healthCheckTimeout: '2s',
    healthCheckMaxRetries: 2,
    // Long timeout for WebSocket connections
    timeoutServer: '1h',
    timeoutTunnel: '1h',
  })

  const aiBackend = new scaleway.loadbalancers.Backend('ai-lb-backend', {
    lbId: lb.id,
    name: naming.resource('ai'),
    forwardProtocol: 'http',
    forwardPort: 4003,
    serverIps: [aiIp],
    healthCheckHttp: { uri: '/health', code: 204 },
    healthCheckDelay: '3s',
    healthCheckTimeout: '2s',
    healthCheckMaxRetries: 2,
  })

  // -------------------------------------------------------------------------
  // HTTPS Frontend (port 443) — TLS termination + host-header routes
  // -------------------------------------------------------------------------

  const allCertIds = [apiCert.id, yjsCert.id, aiCert.id]
  if (apexCert) allCertIds.push(apexCert.id)

  const httpsFrontend = new scaleway.loadbalancers.Frontend('https-frontend', {
    lbId: lb.id,
    name: naming.resource('https'),
    backendId: backendBackend.id, // Default backend (api)
    inboundPort: 443,
    certificateIds: allCertIds,
  })

  // Host-header routes for yjs and ai (backend is the default)
  new scaleway.loadbalancers.Route('yjs-route', {
    frontendId: httpsFrontend.id,
    backendId: yjsBackend.id,
    matchHostHeader: domains.yjs,
  })

  new scaleway.loadbalancers.Route('ai-route', {
    frontendId: httpsFrontend.id,
    backendId: aiBackend.id,
    matchHostHeader: domains.ai,
  })

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
          target: `https://${domains.app}`,
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
  _yjsDomainUrl = pulumi.interpolate`wss://${domains.yjs}`
  _aiDomainUrl = pulumi.interpolate`https://${domains.ai}`
}

export const apiDomainUrl = _apiDomainUrl
export const yjsDomainUrl = _yjsDomainUrl
export const aiDomainUrl = _aiDomainUrl
