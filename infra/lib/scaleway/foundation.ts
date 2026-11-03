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
  const vpc = `https://api.scaleway.com/vpc/v2/regions/${region}`;
  const ipam = `https://api.scaleway.com/ipam/v1/regions/${region}`;
  const lbApi = `https://api.scaleway.com/lb/v1/zones/${zone}`;
  const instance = `https://api.scaleway.com/instance/v1/zones/${zone}`;
  const network = naming.resource('private-network');
  const { private_networks } = await scwFetch<{ private_networks: Array<{ id: string; name: string }> }>(
    auth,
    'GET',
    `${vpc}/private-networks?project_id=${projectId}&name=${encodeURIComponent(network)}`,
  );
  const privateNetworkId = only(private_networks, network, 'private network').id;
  const lbName = naming.resource('lb');
  const { lbs } = await scwFetch<{ lbs: Array<{ id: string; name: string }> }>(
    auth,
    'GET',
    `${lbApi}/lbs?project_id=${projectId}&name=${encodeURIComponent(lbName)}`,
  );
  const lbId = only(lbs, lbName, 'load balancer').id;
  const { backends: listed } = await scwFetch<{ backends: Array<{ id: string; name: string }> }>(
    auth,
    'GET',
    `${lbApi}/lbs/${lbId}/backends?per_page=100`,
  );
  const backends: Record<string, string> = {};
  for (const pool of opts.roles.flatMap((role) => role.pools)) backends[pool.key] = only(listed, naming.resource(pool.key), 'pool').id;
  const { ips: lbIps } = await scwFetch<{ ips: Array<{ address: string }> }>(
    auth,
    'GET',
    `${ipam}/ips?resource_id=${lbId}&resource_type=lb_server&is_ipv6=false`,
  );
  const lbAddress = lbIps[0]?.address;
  if (!lbAddress) throw new Error(`the load balancer ${lbName} has no private address yet; an apply attaches it`);
  const slots: Foundation['slots'] = {};
  for (const role of opts.roles.filter(isRouted)) {
    const bySlot: Partial<Record<Slot, { id: string; address: string }>> = {};
    for (const slot of SLOTS) {
      const tag = slotName(naming.slug, opts.mode, role.role, slot);
      const { ips } = await scwFetch<{ ips: Array<{ id: string; address: string }> }>(
        auth,
        'GET',
        `${ipam}/ips?project_id=${projectId}&tags=${encodeURIComponent(tag)}&is_ipv6=false`,
      );
      if (ips.length !== 1) throw new Error(`reserved address '${tag}': ${ips.length} found; an apply reserves it`);
      bySlot[slot] = { id: ips[0]?.id ?? '', address: withoutCidr(ips[0]?.address ?? '') };
    }
    slots[role.role] = bySlot as Record<Slot, { id: string; address: string }>;
  }
  const securityGroups: Record<string, string> = {};
  for (const role of opts.roles) {
    const name = naming.resource(`${role.role}-sg`);
    const { security_groups } = await scwFetch<{ security_groups: Array<{ id: string; name: string }> }>(
      auth,
      'GET',
      `${instance}/security_groups?project=${projectId}&name=${encodeURIComponent(name)}`,
    );
    securityGroups[role.role] = only(security_groups, name, 'security group').id;
  }
  return { privateNetworkId, lbId, lbPrivateAddress: withoutCidr(lbAddress), backends, slots, securityGroups };
}
