import { isRouted, type MachineRole, SLOTS, type Slot, slotName } from '../machine-roles';
import type { InfraDerivations } from '../naming';
import { type ScwAuth, scwFetch } from './scw-fetch';

/** What a deploy attaches machines to, as the last apply made it: found by name and tag with read-only sets, never written. */
export interface Foundation {
  privateNetworkId: string;
  lbId: string;
  /** The load balancer's private address, which `@{<slug>.internalHost}` bindings name. */
  lbPrivateAddress: string;
  /** Pool id by pool key (`<service>` or `<service>-internal`). */
  backends: Record<string, string>;
  /** Each routed role's reserved address per slot: the IPAM id a NIC takes, and the address its pools list. */
  slots: Record<string, Record<Slot, { id: string; address: string }>>;
  /** Each role's security group id. */
  securityGroups: Record<string, string>;
}

const withoutCidr = (address: string): string => address.split('/')[0] ?? address;

/** The one entry of a listing whose name is `name`, or a refusal saying an apply makes it. */
function only<T extends { name: string }>(items: readonly T[], name: string, what: string): T {
  const found = items.filter((item) => item.name === name);
  if (found.length !== 1) throw new Error(`${what} '${name}': ${found.length === 0 ? 'none' : `${found.length}`} found; an apply makes it`);
  return found[0] as T;
}

/** The environment's load balancer and its pools, each with the servers it lists; undefined before the first apply made it. */
async function readLoadBalancer(
  auth: ScwAuth,
  opts: { zone: string; projectId: string; naming: InfraDerivations['naming'] },
): Promise<{ id: string; backends: Array<{ id: string; name: string; pool: string[] }> } | undefined> {
  const lbApi = `https://api.scaleway.com/lb/v1/zones/${opts.zone}`;
  const name = opts.naming.resource('lb');
  const { lbs } = await scwFetch<{ lbs: Array<{ id: string; name: string }> }>(
    auth,
    'GET',
    `${lbApi}/lbs?project_id=${opts.projectId}&name=${encodeURIComponent(name)}`,
  );
  const found = lbs.filter((lb) => lb.name === name);
  if (found.length > 1) throw new Error(`load balancer '${name}': ${found.length} found`);
  const lb = found[0];
  if (!lb) return undefined;
  const { backends } = await scwFetch<{ backends: Array<{ id: string; name: string; pool?: string[] }> }>(
    auth,
    'GET',
    `${lbApi}/lbs/${lb.id}/backends?per_page=100`,
  );
  return { id: lb.id, backends: backends.map((backend) => ({ id: backend.id, name: backend.name, pool: backend.pool ?? [] })) };
}

/**
 * Each routed role's reserved addresses by slot, found by their slot tags: the IPAM id a NIC takes, and the address its pools list,
 * without the CIDR suffix IPAM returns. A slot the apply has not reserved yet is absent.
 * @throws when a tag names more than one address
 */
export async function readSlotAddresses(
  auth: ScwAuth,
  opts: { region: string; projectId: string; naming: InfraDerivations['naming']; mode: string; roles: readonly MachineRole[] },
): Promise<Record<string, Partial<Record<Slot, { id: string; address: string }>>>> {
  const slots: Record<string, Partial<Record<Slot, { id: string; address: string }>>> = {};
  for (const role of opts.roles.filter(isRouted)) {
    const bySlot: Partial<Record<Slot, { id: string; address: string }>> = {};
    for (const slot of SLOTS) {
      const tag = slotName(opts.naming.slug, opts.mode, role.role, slot);
      const { ips } = await scwFetch<{ ips: Array<{ id: string; address: string }> }>(
        auth,
        'GET',
        `https://api.scaleway.com/ipam/v1/regions/${opts.region}/ips?project_id=${opts.projectId}&tags=${encodeURIComponent(tag)}&is_ipv6=false`,
      );
      if (ips.length > 1) throw new Error(`reserved address '${tag}': ${ips.length} found`);
      const [ip] = ips;
      if (ip) bySlot[slot] = { id: ip.id, address: withoutCidr(ip.address) };
    }
    slots[role.role] = bySlot;
  }
  return slots;
}

/**
 * Read the foundation a deploy needs: the private network, the load balancer with its pools and private address, each routed role's two
 * reserved addresses by their slot tags, and each role's security group.
 * @throws when something the apply makes is missing or ambiguous: the engine changed and an apply is owed
 */
export async function readFoundation(
  auth: ScwAuth,
  opts: { region: string; zone: string; projectId: string; naming: InfraDerivations['naming']; mode: string; roles: readonly MachineRole[] },
): Promise<Foundation> {
  const { region, zone, projectId, naming } = opts;
  const network = naming.resource('private-network');
  const { private_networks } = await scwFetch<{ private_networks: Array<{ id: string; name: string }> }>(
    auth,
    'GET',
    `https://api.scaleway.com/vpc/v2/regions/${region}/private-networks?project_id=${projectId}&name=${encodeURIComponent(network)}`,
  );
  const privateNetworkId = only(private_networks, network, 'private network').id;
  const lb = await readLoadBalancer(auth, { zone, projectId, naming });
  if (!lb) throw new Error(`load balancer '${naming.resource('lb')}': none found; an apply makes it`);
  const backends: Record<string, string> = {};
  for (const pool of opts.roles.flatMap((role) => role.pools)) backends[pool.key] = only(lb.backends, naming.resource(pool.key), 'pool').id;
  const { ips: lbIps } = await scwFetch<{ ips: Array<{ address: string }> }>(
    auth,
    'GET',
    `https://api.scaleway.com/ipam/v1/regions/${region}/ips?resource_id=${lb.id}&resource_type=lb_server&is_ipv6=false`,
  );
  const lbAddress = lbIps[0]?.address;
  if (!lbAddress) throw new Error(`the load balancer ${naming.resource('lb')} has no private address yet; an apply attaches it`);
  const reserved = await readSlotAddresses(auth, opts);
  const slots: Foundation['slots'] = {};
  for (const [role, bySlot] of Object.entries(reserved)) {
    const { a, b } = bySlot;
    if (!a || !b) throw new Error(`reserved address '${slotName(naming.slug, opts.mode, role, a ? 'b' : 'a')}': none found; an apply reserves it`);
    slots[role] = { a, b };
  }
  const securityGroups: Record<string, string> = {};
  for (const role of opts.roles) {
    const name = naming.resource(`${role.role}-sg`);
    const { security_groups } = await scwFetch<{ security_groups: Array<{ id: string; name: string }> }>(
      auth,
      'GET',
      `https://api.scaleway.com/instance/v1/zones/${zone}/security_groups?project=${projectId}&name=${encodeURIComponent(name)}`,
    );
    securityGroups[role.role] = only(security_groups, name, 'security group').id;
  }
  return { privateNetworkId, lbId: lb.id, lbPrivateAddress: withoutCidr(lbAddress), backends, slots, securityGroups };
}
