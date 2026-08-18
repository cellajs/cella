import * as pulumi from '@pulumi/pulumi';
import * as scaleway from '@pulumiverse/scaleway';
import { engineConfig } from '../config/engine-config';

const appConfig = engineConfig();

import type { ServiceName } from '../compose/compose';
import { healthContract } from '../config/health.config';
import { sizing } from '../config/sizing';
import { enabledServices } from '../lib/services';
import { dnsZone, naming, region, serviceHost, serviceUrl, tags, zone } from '../pulumi-context';
import { serviceGenerationIps } from './compute';
import { CertReadyGate, DnsPropagationGate } from './dns-cert-gates';
import { internalLbPort, publishLbInternalAddress } from './lb-internal';
import { privateNetworkId, privateNetworkSubnet } from './network';

/** Base names pinned to the shipped Pulumi URNs and Scaleway display names; renaming replaces the resources. */
const legacyBaseNames: Partial<Record<ServiceName, string>> = { backend: 'api', frontend: 'app' };
const baseName = (slug: ServiceName) => legacyBaseNames[slug] ?? slug;

/** Everything the rest of the program consumes from this module. */
interface LoadBalancerOutputs {
  /** Public URL per LB-exposed service slug. */
  serviceUrls: Record<string, pulumi.Output<string>>;
  lbId: pulumi.Output<string | undefined>;
  lbBackendIds: pulumi.Output<Record<string, string>>;
}

/** Provision the LB + DNS + certs + backends/frontends and return the outputs. */
function provisionLoadBalancer(): LoadBalancerOutputs {
  // A service is LB-exposed only when it is enabled and declares an `lbRoute`, so the LB never re-decides independently of compute.
  const lbServices = enabledServices(appConfig.services).filter((s) => s.lbRoute);
  const defaultService = lbServices.find((s) => s.lbRoute === 'default');
  if (!defaultService) {
    throw new Error(
      "loadbalancer: no enabled service declares lbRoute 'default', the HTTPS frontend needs a fallback backend.",
    );
  }

  // The default-route service owns the app host; the engine never names a service literal.
  const appHost = serviceHost(defaultService.slug);
  // Zone-apex resources belong to exactly one stack per zone, the one serving `www.<zone>`: a second stack's apex A record would round-robin production traffic to it.
  const managesApex = appHost === `www.${dnsZone}`;

  // DNS and certificates are per unique hostname, not per service; the first service claims the resource name so shared same-origin hosts keep their URNs.

  interface PublicHost {
    host: string;
    /** Resource base name of the first service carrying this host. */
    base: string;
  }

  const hostEntries = new Map<string, PublicHost>();
  for (const service of [defaultService, ...lbServices.filter((s) => s !== defaultService)]) {
    const host = serviceHost(service.slug);
    if (!hostEntries.has(host)) hostEntries.set(host, { host, base: baseName(service.slug) });
  }
  const publicHosts = [...hostEntries.values()];

  const lbIp = new scaleway.loadbalancers.Ip('lb-ip', {
    zone,
  });

  const lb = new scaleway.loadbalancers.LoadBalancer('main-lb', {
    name: naming.resource('lb'),
    ipIds: [lbIp.id],
    type: 'LB-S',
    zone,
    tags,
    privateNetworks: [
      {
        privateNetworkId,
      },
    ],
  });

  // A records must exist before the Let's Encrypt certificates: Scaleway validates a cert by resolving the FQDN to the LB IP at creation time.

  const lbPublicIp = lb.ipAddress;

  const dnsRecords = new Map<string, scaleway.domain.Record>();
  const dnsGates = new Map<string, DnsPropagationGate>();
  for (const { host, base } of publicHosts) {
    // A host that is the zone apex gets no own record, cert, or route; the apex handling below covers it.
    if (host === dnsZone) continue;
    const record = new scaleway.domain.Record(`${base}-dns`, {
      dnsZone,
      name: host.replace(`.${dnsZone}`, ''),
      type: 'A',
      data: lbPublicIp,
      ttl: 300,
    });
    dnsRecords.set(host, record);
    // Hold the cert request until the record answers on public resolvers, so ACME validation never races propagation.
    dnsGates.set(
      host,
      new DnsPropagationGate(
        `${base}-dns-gate`,
        {
          fqdn: host,
          expectedIp: lbPublicIp,
        },
        { dependsOn: [record] },
      ),
    );
  }

  // The apex points at the LB so the apex-to-www redirect ACL below can answer.
  let apexDns: scaleway.domain.Record | undefined;
  let apexDnsGate: DnsPropagationGate | undefined;
  if (managesApex) {
    apexDns = new scaleway.domain.Record('apex-dns', {
      dnsZone,
      name: '',
      type: 'A',
      data: lbPublicIp,
      ttl: 300,
    });
    apexDnsGate = new DnsPropagationGate(
      'apex-dns-gate',
      {
        fqdn: dnsZone,
        expectedIp: lbPublicIp,
      },
      { dependsOn: [apexDns] },
    );
  }

  // Wait for public DNS resolution before ACME, then for certificate readiness before attachment, so issuance failures report certificate-level detail.

  const certs = new Map<string, scaleway.loadbalancers.Certificate>();
  const certGates: CertReadyGate[] = [];
  for (const { host, base } of publicHosts) {
    const dns = dnsRecords.get(host);
    if (!dns) continue; // apex-hosted: covered by the apex cert below
    const cert = new scaleway.loadbalancers.Certificate(
      `${base}-cert`,
      {
        lbId: lb.id,
        name: naming.resource(`${base}-cert`),
        letsencrypt: {
          commonName: host,
        },
      },
      { dependsOn: [dns, dnsGates.get(host)!] },
    );
    certs.set(host, cert);
    certGates.push(new CertReadyGate(`${base}-cert-ready`, { certificateId: cert.id }, { dependsOn: [cert] }));
  }

  let apexCert: scaleway.loadbalancers.Certificate | undefined;
  if (managesApex && apexDns && apexDnsGate) {
    apexCert = new scaleway.loadbalancers.Certificate(
      'apex-cert',
      {
        lbId: lb.id,
        name: naming.resource('apex-cert'),
        letsencrypt: {
          commonName: dnsZone,
        },
      },
      { dependsOn: [apexDns, apexDnsGate] },
    );
    certGates.push(new CertReadyGate('apex-cert-ready', { certificateId: apexCert.id }, { dependsOn: [apexCert] }));
  }

  // Pulumi seeds backend IPs, then cutover owns expand, health, and contract changes. Drain policy either preserves HTTP requests or closes WebSockets so clients reconnect to the new generation.

  const backends = new Map<ServiceName, scaleway.loadbalancers.Backend>();
  for (const service of lbServices) {
    // healthExpectStatus is per service: API services answer 204, the SPA proxy 200.
    backends.set(
      service.slug,
      new scaleway.loadbalancers.Backend(
        `${service.slug}-lb-backend`,
        {
          lbId: lb.id,
          name: naming.resource(service.slug),
          forwardProtocol: 'http',
          forwardPort: service.healthPort,
          serverIps: serviceGenerationIps(service.slug),
          onMarkedDownAction: service.drainPolicy === 'reconnect' ? 'shutdown_sessions' : 'none',
          healthCheckHttp: { uri: healthContract.path, code: service.healthExpectStatus },
          healthCheckDelay: '3s',
          healthCheckTimeout: '2s',
          healthCheckMaxRetries: 2,
          // Long timeouts keep WebSocket connections open.
          ...(service.lbWebsockets ? { timeoutServer: '1h', timeoutTunnel: '1h' } : {}),
        },
        {
          ignoreChanges: ['serverIps'],
        },
      ),
    );
  }

  const defaultBackend = backends.get(defaultService.slug)!;

  // A private, ACL-guarded frontend per `internalRoute` service gives in-network consumers a stable address that follows every cutover.
  // The LB keeps its DHCP-assigned private-network IP: recreating the attachment severs LB-to-VM traffic.
  // Resolved through the IPAM REST API because the provider's getIps invoke rejects these filters with a detail-less "invalid argument(s)".
  const lbPrivateIp = lb.id.apply(async (lbId) => {
    const bareLbId = lbId.split('/').at(-1) ?? lbId;
    const secretKey = process.env.SCW_SECRET_KEY;
    if (!secretKey)
      throw new Error('loadbalancer: SCW_SECRET_KEY is required to resolve the LB private-network IP from IPAM');
    const url = `https://api.scaleway.com/ipam/v1/regions/${region}/ips?resource_id=${bareLbId}&resource_type=lb_server&is_ipv6=false`;
    const res = await fetch(url, { headers: { 'X-Auth-Token': secretKey } });
    if (!res.ok)
      throw new Error(`loadbalancer: IPAM lookup for the LB private IP failed: ${res.status} ${await res.text()}`);
    const body = (await res.json()) as { ips?: Array<{ address?: string }> };
    const address = body.ips?.[0]?.address;
    if (!address)
      throw new Error('loadbalancer: could not resolve the LB private-network IP from IPAM (resource type lb_server).');
    return address;
  });
  publishLbInternalAddress(lbPrivateIp);

  const internalBackends = new Map<string, scaleway.loadbalancers.Backend>();
  const internalServices = enabledServices(appConfig.services).filter((s) => s.internalRoute);
  for (const service of internalServices) {
    // Its own pool over the same generation IPs, with 1h timeouts and session kill on mark-down so internal WebSocket consumers re-dial the new generation.
    const internalBackend = new scaleway.loadbalancers.Backend(
      `${service.slug}-internal-lb-backend`,
      {
        lbId: lb.id,
        name: naming.resource(`${service.slug}-internal`),
        forwardProtocol: 'http',
        forwardPort: service.healthPort,
        serverIps: serviceGenerationIps(service.slug),
        onMarkedDownAction: 'shutdown_sessions',
        healthCheckHttp: { uri: healthContract.path, code: service.healthExpectStatus },
        healthCheckDelay: '3s',
        healthCheckTimeout: '2s',
        healthCheckMaxRetries: 2,
        timeoutServer: '1h',
        timeoutTunnel: '1h',
      },
      {
        ignoreChanges: ['serverIps'],
      },
    );
    internalBackends.set(`${service.slug}-internal`, internalBackend);

    const internalFrontend = new scaleway.loadbalancers.Frontend(`${service.slug}-internal-frontend`, {
      lbId: lb.id,
      name: naming.resource(`${service.slug}-internal`),
      backendId: internalBackend.id,
      inboundPort: internalLbPort(service.healthPort),
    });

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

  const allCertIds: pulumi.Input<string>[] = [...certs.values()].map((cert) => cert.id);
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
      // Attach only certs proven `ready`: a pending or errored cert fails its own gate first, with the ACME detail.
      dependsOn: certGates,
    },
  );

  // Host-header routes for every host-routed service with a DNS record.
  for (const service of lbServices) {
    if (service.lbRoute !== 'host' || !dnsRecords.has(serviceHost(service.slug))) continue;
    new scaleway.loadbalancers.Route(`${baseName(service.slug)}-route`, {
      frontendId: httpsFrontend.id,
      backendId: backends.get(service.slug)!.id,
      matchHostHeader: serviceHost(service.slug),
    });
  }

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
    new scaleway.loadbalancers.Acl('apex-redirect-https', {
      frontendId: httpsFrontend.id,
      name: naming.resource('apex-redirect'),
      index: 0,
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
      match: {
        httpFilter: 'http_header_match',
        httpFilterOption: 'host',
        httpFilterValues: [dnsZone],
      },
    });
  }

  const httpFrontend = new scaleway.loadbalancers.Frontend('http-frontend', {
    lbId: lb.id,
    name: naming.resource('http'),
    backendId: defaultBackend.id, // Required but never reached (ACL redirects all)
    inboundPort: 80,
  });

  new scaleway.loadbalancers.Acl('http-to-https', {
    frontendId: httpFrontend.id,
    name: naming.resource('http-redirect'),
    index: 0,
    action: {
      type: 'redirect',
      redirects: [
        {
          type: 'scheme',
          target: 'https',
          code: 301,
        },
      ],
    },
    match: {
      httpFilter: 'acl_http_filter_none',
    },
  });

  const serviceUrls: Record<string, pulumi.Output<string>> = {};
  for (const service of lbServices) {
    // The full public URL; path-routed services carry their prefix.
    serviceUrls[service.slug] = pulumi.output(serviceUrl(service.slug));
  }

  return {
    serviceUrls,
    lbId: lb.id,
    lbBackendIds: pulumi.output(
      Object.fromEntries([
        ...[...backends.entries()].map(([service, backend]) => [service, backend.id] as const),
        ...[...internalBackends.entries()].map(([key, backend]) => [key, backend.id] as const),
      ]),
    ),
  };
}

// Skipped while compute is deferred on a fresh bootstrap: without VMs the LB has no backends to route to.
const outputs: LoadBalancerOutputs = sizing.computeEnabled
  ? provisionLoadBalancer()
  : { serviceUrls: {}, lbId: pulumi.output(undefined), lbBackendIds: pulumi.output({} as Record<string, string>) };

/** Public URL per LB-exposed service slug; empty when no domain/compute. */
export const serviceDomainUrls: Readonly<Record<string, pulumi.Output<string>>> = outputs.serviceUrls;
export const lbId = outputs.lbId;
export const lbBackendIds = outputs.lbBackendIds;
