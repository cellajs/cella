import { promises as dnsPromises } from 'node:dns';
import { serviceEndpoints } from '../../services';
import { check, runSetup } from '../check';
import type { StatusProvider } from '../types';

/** DNS resolution of the app's browser-facing host. */
export interface DnsFacts {
  host: string;
  /** Resolved A records; empty array = NXDOMAIN; undefined = not checked. */
  resolvedIps?: string[];
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
    try {
      const ips = await dnsPromises.resolve4(host);
      return { host, resolvedIps: ips };
    } catch (err) {
      const code = (err as { code?: string }).code;
      if (code === 'ENOTFOUND' || code === 'NODATA') return { host, resolvedIps: [] };
      return { host };
    }
  },
  evaluate(facts, session) {
    if (!session.hasDomain || !facts) return [];
    const dns = check('dns.zone', 'DNS');
    const { host, resolvedIps } = facts;
    if (resolvedIps === undefined) return [dns.unknown(`did not resolve ${host}`)];
    if (resolvedIps.length === 0)
      return [dns.warn(`${host} does not resolve (NXDOMAIN); certificate issuance and traffic need it`, runSetup)];
    return [dns.ok(`${host} → ${resolvedIps.join(', ')}`)];
  },
};
