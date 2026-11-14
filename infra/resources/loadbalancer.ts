import * as pulumi from '@pulumi/pulumi';
import * as scaleway from '@pulumiverse/scaleway';
import type { ServiceName } from '../compose/compose';
import { engineConfig as appConfig } from '../config/engine-config';
import { agentHealthPath, agentPort, internalLbPort } from '../lib/machine-roles';
import { apexHostIssue, redirectedApexOrigin, routedHostIssue } from '../lib/naming';
import { enabledServices, type ServiceDefinition } from '../lib/services';
import { dnsZone, naming, region, serviceHost, serviceUrl, tags, zone } from '../pulumi-context';
import { CertReadyGate, DnsPropagationGate } from './dns-cert-gates';
import { privateNetworkId, privateNetworkSubnet } from './network';
import { poolServers } from './slots';

/**
 * A frontend whose ACLs are `Acl` resources of their own. The provider reads a frontend's live ACLs into its `acls` field, which this program
 * leaves empty, so a refreshing `up` would rewrite the frontend without them and delete them: a refreshing apply dropped the HTTPS redirect
 * and the private-network rule of the internal frontend on staging. The ACLs are owned by their own resources, never by the frontend.
 */
const frontendWithAclResources: pulumi.CustomResourceOptions = { ignoreChanges: ['acls'] };

/** Base names pinned to the shipped Pulumi URNs and Scaleway display names; renaming replaces the resources. */
const legacyBaseNames: Partial<Record<ServiceName, string>> = { backend: 'api', frontend: 'app' };
const baseName = (slug: ServiceName) => legacyBaseNames[slug] ?? slug;

/** Everything the rest of the program consumes from this module. */
interface LoadBalancerOutputs {
  /** Public URL per LB-exposed service slug. */
  serviceUrls: Record<string, pulumi.Output<string>>;
  lbId: pulumi.Output<string>;
  lbBackendIds: pulumi.Output<Record<string, string>>;
  /** The LB's private-network IPv4 address, without a CIDR suffix. */
  lbPrivateAddress: pulumi.Output<string>;
}

/** The shortest check the API takes: a server whose check fails left a measured pool 1.3 s later, with no failed request. */
const shortestCheck = { healthCheckDelay: '1s', healthCheckTimeout: '1s', healthCheckMaxRetries: 2, healthCheckTransientDelay: '0.5s' };

/**
 * A pool's health check. It asks the machine's agent, which answers 200 only while the service serves the release the machine was made for
 * and is not draining. A deploy moves traffic by health and never edits a pool.
 */
function healthCheck(service: ServiceDefinition) {
  return { healthCheckPort: agentPort(service.slug), healthCheckHttp: { uri: agentHealthPath(service.slug), code: 200 }, ...shortestCheck };
}

/** Provision the LB + DNS + certs + backends/frontends and return the outputs. */
function provisionLoadBalancer(): LoadBalancerOutputs {
  // A service is LB-exposed only when it is enabled and declares an `lbRoute`, so the LB never re-decides independently of compute.
  const lbServices = enabledServices(appConfig.services).filter((s) => s.lbRoute);
  const defaultService = lbServices.find((s) => s.lbRoute === 'default');
  if (!defaultService) {
    throw new Error("loadbalancer: no enabled service declares lbRoute 'default', the HTTPS frontend needs a fallback backend.");
  }

  // The default-route service owns the app host; the engine never names a service literal.
  const appHost = serviceHost(defaultService.slug);
  // Backstops for the refusals `deriveInfra` makes before any resource: one record and one certificate serve every route.
  const hostIssue = apexHostIssue(appHost, dnsZone) ?? routedHostIssue(appConfig);
  if (hostIssue) throw new Error(`loadbalancer: ${hostIssue}`);
  // Zone-apex resources belong to exactly one stack per zone, the one serving `www.<zone>`: a second stack's apex A record would round-robin production traffic to it.
  const managesApex = redirectedApexOrigin(appHost, dnsZone) !== undefined;
  const appBase = baseName(defaultService.slug);

  const lbIp = new scaleway.loadbalancers.Ip('lb-ip', { zone });

  const lb = new scaleway.loadbalancers.LoadBalancer('main-lb', {
    name: naming.resource('lb'),
    ipIds: [lbIp.id],
    type: 'LB-S',
    zone,
    tags,
    privateNetworks: [{ privateNetworkId }],
  });

  // A records must exist before the Let's Encrypt certificates: Scaleway validates a cert by resolving the FQDN to the LB IP at creation time.

  const lbPublicIp = lb.ipAddress;

  const appDns = new scaleway.domain.Record(`${appBase}-dns`, {
    dnsZone,
    name: appHost.replace(`.${dnsZone}`, ''),
    type: 'A',
    data: lbPublicIp,
    ttl: 300,
  });
  // Hold the cert request until the record answers on public resolvers, so ACME validation never races propagation.
  const appDnsGate = new DnsPropagationGate(`${appBase}-dns-gate`, { fqdn: appHost, expectedIp: lbPublicIp }, { dependsOn: [appDns] });

  // The apex points at the LB so the apex-to-www redirect ACL below can answer.
  let apexDns: scaleway.domain.Record | undefined;
  let apexDnsGate: DnsPropagationGate | undefined;
  if (managesApex) {
    apexDns = new scaleway.domain.Record('apex-dns', { dnsZone, name: '', type: 'A', data: lbPublicIp, ttl: 300 });
    apexDnsGate = new DnsPropagationGate('apex-dns-gate', { fqdn: dnsZone, expectedIp: lbPublicIp }, { dependsOn: [apexDns] });
  }

  // Wait for public DNS resolution before ACME, then for certificate readiness before attachment, so issuance failures report certificate-level detail.

  const appCert = new scaleway.loadbalancers.Certificate(
    `${appBase}-cert`,
    { lbId: lb.id, name: naming.resource(`${appBase}-cert`), letsencrypt: { commonName: appHost } },
    { dependsOn: [appDns, appDnsGate] },
  );
  const certGates = [new CertReadyGate(`${appBase}-cert-ready`, { certificateId: appCert.id }, { dependsOn: [appCert] })];

  let apexCert: scaleway.loadbalancers.Certificate | undefined;
  if (managesApex && apexDns && apexDnsGate) {
    apexCert = new scaleway.loadbalancers.Certificate(
      'apex-cert',
      { lbId: lb.id, name: naming.resource('apex-cert'), letsencrypt: { commonName: dnsZone } },
      { dependsOn: [apexDns, apexDnsGate] },
    );
    certGates.push(new CertReadyGate('apex-cert-ready', { certificateId: apexCert.id }, { dependsOn: [apexCert] }));
  }

  // Every pool lists its role's two reserved addresses for good, and the health check decides which serves. A drain either lets HTTP
  // requests finish or closes WebSockets so clients reconnect to the new machine.

  const backends = new Map<ServiceName, scaleway.loadbalancers.Backend>();
  for (const service of lbServices) {
    backends.set(
      service.slug,
      new scaleway.loadbalancers.Backend(`${service.slug}-lb-backend`, {
        lbId: lb.id,
        name: naming.resource(service.slug),
        forwardProtocol: 'http',
        forwardPort: service.healthPort,
        serverIps: poolServers(service.slug),
        onMarkedDownAction: service.drainPolicy === 'reconnect' ? 'shutdown_sessions' : 'none',
        ...healthCheck(service),
        // Long timeouts keep WebSocket connections open.
        ...(service.lbWebsockets ? { timeoutServer: '1h', timeoutTunnel: '1h' } : {}),
      }),
    );
  }

  const defaultBackend = backends.get(defaultService.slug)!;

  // A private, ACL-guarded frontend per `internalPort` service gives in-network consumers a stable address that follows every switch.
  // The LB keeps its DHCP-assigned private-network IP: recreating the attachment severs LB-to-machine traffic.
  // Resolved through the IPAM REST API because the provider's getIps invoke rejects these filters with a detail-less "invalid argument(s)".
  const lbPrivateIp = lb.id.apply(async (lbId) => {
    const bareLbId = lbId.split('/').at(-1) ?? lbId;
    const secretKey = process.env.SCW_SECRET_KEY;
    if (!secretKey) throw new Error('loadbalancer: SCW_SECRET_KEY is required to resolve the LB private-network IP from IPAM');
    const url = `https://api.scaleway.com/ipam/v1/regions/${region}/ips?resource_id=${bareLbId}&resource_type=lb_server&is_ipv6=false`;
    const res = await fetch(url, { headers: { 'X-Auth-Token': secretKey } });
    if (!res.ok) throw new Error(`loadbalancer: IPAM lookup for the LB private IP failed: ${res.status} ${await res.text()}`);
    const body = (await res.json()) as { ips?: Array<{ address?: string }> };
    const address = body.ips?.[0]?.address;
    if (!address) throw new Error('loadbalancer: could not resolve the LB private-network IP from IPAM (resource type lb_server).');
    return address.split('/')[0] ?? address;
  });

  const internalBackends = new Map<string, scaleway.loadbalancers.Backend>();
  const internalServices = enabledServices(appConfig.services).flatMap((s) =>
    s.internalPort === undefined ? [] : [{ service: s, internalPort: s.internalPort }],
  );
  for (const { service, internalPort } of internalServices) {
    // Its own pool over the same addresses, forwarding to the internal listener only and checked like the public one, with 1h timeouts and
    // session kill on mark-down so internal WebSocket consumers re-dial the new machine.
    const internalBackend = new scaleway.loadbalancers.Backend(`${service.slug}-internal-lb-backend`, {
      lbId: lb.id,
      name: naming.resource(`${service.slug}-internal`),
      forwardProtocol: 'http',
      forwardPort: internalPort,
      serverIps: poolServers(`${service.slug}-internal`),
      onMarkedDownAction: 'shutdown_sessions',
      ...healthCheck(service),
      timeoutServer: '1h',
      timeoutTunnel: '1h',
    });
    internalBackends.set(`${service.slug}-internal`, internalBackend);

    const internalFrontend = new scaleway.loadbalancers.Frontend(
      `${service.slug}-internal-frontend`,
      {
        lbId: lb.id,
        name: naming.resource(`${service.slug}-internal`),
        backendId: internalBackend.id,
        inboundPort: internalLbPort(internalPort),
      },
      frontendWithAclResources,
    );

    // The frontend also listens on the LB's public IP, so the ACL pair admits private-network sources and denies everything else.
    new scaleway.loadbalancers.Acl(`${service.slug}-internal-allow-pn`, {
      frontendId: internalFrontend.id,
      name: naming.resource(`${service.slug}-internal-allow`),
      index: 0,
      action: { type: 'allow' },
      match: { ipSubnets: [privateNetworkSubnet] },
    });
    new scaleway.loadbalancers.Acl(`${service.slug}-internal-deny-all`, {
      frontendId: internalFrontend.id,
      name: naming.resource(`${service.slug}-internal-deny`),
      index: 1,
      action: { type: 'deny' },
      match: { httpFilter: 'acl_http_filter_none' },
    });
  }

  const allCertIds: pulumi.Input<string>[] = [appCert.id];
  if (apexCert) allCertIds.push(apexCert.id);

  const httpsFrontend = new scaleway.loadbalancers.Frontend(
    'https-frontend',
    {
      lbId: lb.id,
      name: naming.resource('https'),
      backendId: defaultBackend.id, // Default backend (the lbRoute 'default' service)
      inboundPort: 443,
      certificateIds: allCertIds,
    },
    {
      ...frontendWithAclResources,
      // Attach only certs proven `ready`: a pending or errored cert fails its own gate first, with the ACME detail.
      dependsOn: certGates,
    },
  );

  // Same-origin path routes keep their prefix and otherwise fall through to the app backend. A Scaleway route matches one criterion, so prefixes are registry-declared and validated.
  for (const service of lbServices) {
    if (!service.pathPrefix) continue;
    new scaleway.loadbalancers.Route(`${baseName(service.slug)}-path-route`, {
      frontendId: httpsFrontend.id,
      backendId: backends.get(service.slug)!.id,
      matchPathBegin: service.pathPrefix,
    });
  }

  if (managesApex) {
    const apexRedirect = new scaleway.loadbalancers.Acl('apex-redirect-https', {
      frontendId: httpsFrontend.id,
      name: naming.resource('apex-redirect'),
      index: 1,
      action: {
        type: 'redirect',
        redirects: [
          {
            type: 'location',
            // Scaleway's `{{path}}` omits the leading slash, so it is written literally.
            target: `https://${appHost}/{{path}}?{{query}}`,
            code: 301,
          },
        ],
      },
      match: { httpFilter: 'http_header_match', httpFilterOption: 'host', httpFilterValues: [dnsZone] },
    });
    // The worker script passes to the app ahead of the redirect (ACLs run by index, a matching `allow` ends the chain): a
    // worker a visitor keeps from a deploy that served the apex answers their visits from its cache, and a browser refuses
    // a redirected worker script, so only a script the apex answers replaces it. This build's worker then leaves the host
    // (frontend/src/lib/sw.ts). The path is the build's `swDest` (frontend/vite.config.ts).
    new scaleway.loadbalancers.Acl(
      'apex-sw-allow',
      {
        frontendId: httpsFrontend.id,
        name: naming.resource('apex-sw-allow'),
        index: 0,
        action: { type: 'allow' },
        match: { httpFilter: 'path_begin', httpFilterValues: ['/sw.js'] },
      },
      // Made once the redirect holds index 1, so the frontend never carries two ACLs on one index.
      { dependsOn: [apexRedirect] },
    );
  }

  const httpFrontend = new scaleway.loadbalancers.Frontend(
    'http-frontend',
    {
      lbId: lb.id,
      name: naming.resource('http'),
      backendId: defaultBackend.id, // Required but never reached (ACL redirects all)
      inboundPort: 80,
    },
    frontendWithAclResources,
  );

  new scaleway.loadbalancers.Acl('http-to-https', {
    frontendId: httpFrontend.id,
    name: naming.resource('http-redirect'),
    index: 0,
    action: {
      type: 'redirect',
      redirects: [{ type: 'scheme', target: 'https', code: 301 }],
    },
    match: { httpFilter: 'acl_http_filter_none' },
  });

  const serviceUrls: Record<string, pulumi.Output<string>> = {};
  for (const service of lbServices) {
    // The full public URL; path-routed services carry their prefix.
    serviceUrls[service.slug] = pulumi.output(serviceUrl(service.slug));
  }

  return {
    serviceUrls,
    lbId: lb.id,
    lbPrivateAddress: lbPrivateIp,
    lbBackendIds: pulumi.output(
      Object.fromEntries([
        ...[...backends.entries()].map(([service, backend]) => [service, backend.id] as const),
        ...[...internalBackends.entries()].map(([key, backend]) => [key, backend.id] as const),
      ]),
    ),
  };
}

// Made by the setup's first apply, before any machine: its records and certificates are then in place for the first deploy, whose key
// writes no DNS and no pool.
const outputs = provisionLoadBalancer();

/** Public URL per LB-exposed service slug. */
export const serviceDomainUrls: Readonly<Record<string, pulumi.Output<string>>> = outputs.serviceUrls;
export const lbId = outputs.lbId;
export const lbBackendIds = outputs.lbBackendIds;
export const lbPrivateAddress = outputs.lbPrivateAddress;
