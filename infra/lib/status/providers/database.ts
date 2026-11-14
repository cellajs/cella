import { endpointAddress, publicEndpoints } from '../../db-public-endpoint';
import { deriveInfra } from '../../naming';
import { createRdbClient } from '../../scaleway/scaleway-rdb';
import { check, manageDbEndpoint, probed } from '../check';
import type { ProbeSession, StatusProvider } from '../types';

/** The managed PostgreSQL instance's live public endpoints. `allowed` is read only when an endpoint is open or exposure is on. */
export interface DbEndpointFacts {
  instance: string;
  found: boolean;
  /** `host:port` of each public (load-balancer) endpoint. */
  endpoints: string[];
  /** The address each ACL rule admits. */
  allowed?: string[];
}

/** The check applies to a bootstrapped stack, whose managed PostgreSQL instance the exposure toggle opens. */
const applies = (session: ProbeSession): boolean => session.stackState === 'bootstrapped';

/** Public-endpoint check of the managed database: a live endpoint with exposure off warns, as does an open one, with its ACL rule count. */
export const databaseProvider: StatusProvider<DbEndpointFacts> = {
  domain: 'db',
  async gather(session) {
    if (!applies(session) || !session.scalewayKeyAvailable || !session.secretKey) return undefined;
    const { naming, region } = deriveInfra(session.appConfig);
    const client = createRdbClient({ secretKey: session.secretKey, region });
    const name = naming.resource('postgres');
    const found = await client.findInstance(name);
    if (!found) return { instance: name, found: false, endpoints: [] };
    const endpoints = publicEndpoints(await client.getInstance(found.id)).map(endpointAddress);
    const allowed = endpoints.length > 0 || session.dbExposureConfigured ? (await client.listAclRules(found.id)).map((rule) => rule.ip) : undefined;
    return { instance: name, found: true, endpoints, allowed };
  },
  evaluate(facts, session) {
    if (!applies(session)) return [];
    const endpoint = check('db.publicEndpoint', 'Database', 'scaleway');
    return [
      probed(endpoint, session.scalewayKeyAvailable, facts, 'could not read the database instance', (live) => {
        if (!live.found) return endpoint.unknown(`no database instance named ${live.instance}`);
        const open = live.endpoints.join(', ');
        const rules = `${live.allowed?.length ?? '?'} ACL rule(s)`;
        const to = live.allowed?.length ? `open to ${live.allowed.join(', ')}` : undefined;
        if (!session.dbExposureConfigured) {
          return open
            ? endpoint.warn(`${open} is open although exposure is off (${rules})`, manageDbEndpoint)
            : { ...endpoint.ok('private only'), headline: 'private, no public endpoint' };
        }
        return open
          ? { ...endpoint.warn(`open at ${open} with ${rules}; close it when done`, manageDbEndpoint), ...(to ? { headline: to } : {}) }
          : endpoint.warn(`exposure is on, but the instance has no public endpoint (${rules})`, manageDbEndpoint);
      }),
    ];
  },
};
