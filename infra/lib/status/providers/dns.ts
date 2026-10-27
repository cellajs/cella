import { promises as dnsPromises } from 'node:dns';
import { deriveInfra } from '../../naming';
import { scwFetch } from '../../scaleway/scw-fetch';
import { serviceEndpoints } from '../../services';
import { check, runSetup } from '../check';
import type { StatusProvider } from '../types';

/** DNS resolution of the app's browser-facing host, and the addresses of the project's load balancers. */
export interface DnsFacts {
  host: string;
  /** Resolved A records; empty array = NXDOMAIN; undefined = not checked. */
  resolvedIps?: string[];
  /** The project's load balancer addresses; undefined when they could not be read. */
  loadBalancerIps?: string[];
}

/** The load balancers' public addresses in the environment's zone, read with the session's key. */
async function loadBalancerIps(session: Parameters<NonNullable<StatusProvider<DnsFacts>['gather']>>[0]): Promise<string[] | undefined> {
  if (!session.scalewayKeyAvailable || !session.secretKey || !session.projectId) return undefined;
  try {
    const { zone } = deriveInfra(session.appConfig);
    const { lbs = [] } = await scwFetch<{ lbs?: Array<{ ip?: Array<{ ip_address?: string }> }> }>(
      { secretKey: session.secretKey },
      'GET',
      `https://api.scaleway.com/lb/v1/zones/${zone}/lbs?project_id=${session.projectId}&page_size=100`,
    );
    return lbs.flatMap((lb) => (lb.ip ?? []).flatMap((ip) => (ip.ip_address ? [ip.ip_address] : [])));
  } catch {
    return undefined;
  }
}

export const dnsProvider: StatusProvider<DnsFacts> = {
  domain: 'dns',
  async gather(session) {
    if (!session.hasDomain) return undefined;
    let host: string | undefined;
    try {
      const endpoints = serviceEndpoints(session.appConfig);
      host = (endpoints.find((e) => e.slug === 'frontend') ?? endpoints[0])?.host;
    } catch {
      return undefined;
    }
    if (!host) return undefined;
    const lbIps = await loadBalancerIps(session);
    try {
      return { host, resolvedIps: await dnsPromises.resolve4(host), loadBalancerIps: lbIps };
    } catch (err) {
      const code = (err as { code?: string }).code;
      if (code === 'ENOTFOUND' || code === 'NODATA') return { host, resolvedIps: [], loadBalancerIps: lbIps };
      return { host, loadBalancerIps: lbIps };
    }
  },
  evaluate(facts, session) {
    if (!session.hasDomain || !facts) return [];
    const dns = check('dns.zone', 'DNS');
    const { host, resolvedIps, loadBalancerIps: lbIps } = facts;
    if (resolvedIps === undefined) return [dns.unknown(`did not resolve ${host}`)];
    if (resolvedIps.length === 0) return [dns.warn(`${host} does not resolve (NXDOMAIN); certificate issuance and traffic need it`, runSetup)];
    // An address that is not the load balancer's sends the app's users elsewhere: a record left behind, or one someone changed.
    const elsewhere = lbIps?.length ? resolvedIps.filter((ip) => !lbIps.includes(ip)) : [];
    if (elsewhere.length > 0)
      return [dns.error(`${host} resolves to ${elsewhere.join(', ')}, which is not the load balancer (${lbIps?.join(', ')})`)];
    return [dns.ok(`${host} → ${resolvedIps.join(', ')}${lbIps?.length ? ', the load balancer' : ''}`)];
  },
};
