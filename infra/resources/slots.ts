import type * as pulumi from '@pulumi/pulumi';
import * as scaleway from '@pulumiverse/scaleway';
import { engineConfig as appConfig } from '../config/engine-config';
import { isRouted, type MachineRole, machineRoles, SLOTS, slotName } from '../lib/machine-roles';
import { mode, naming, region, tags } from '../pulumi-context';
import { privateNetworkId } from './network';

/** The environment's machine roles; a deploy makes and deletes their machines, the program only their addresses and groups. */
export const roles: readonly MachineRole[] = machineRoles(appConfig);

/**
 * Two reserved private addresses per routed role, tagged with their slot name: a deploy finds the idle one by that tag and attaches the new
 * machine's private NIC to it. They live as long as the environment, so every pool lists them for good.
 */
const reservations = new Map<string, scaleway.ipam.Ip[]>(
  roles.filter(isRouted).map((role) => [
    role.role,
    SLOTS.map(
      (slot) =>
        new scaleway.ipam.Ip(`slot-${role.role}-${slot}`, {
          sources: [{ privateNetworkId }],
          isIpv6: false,
          region,
          tags: [...tags, slotName(naming.slug, mode, role.role, slot)],
        }),
    ),
  ]),
);

/** A role's two addresses, slot a first, without the CIDR suffix the provider returns. */
function roleAddresses(role: string): pulumi.Output<string>[] {
  const ips = reservations.get(role);
  if (!ips) throw new Error(`slots: '${role}' is no routed machine role`);
  return ips.map((ip) => ip.address.apply((address) => address.split('/')[0] ?? address));
}

/** The role whose addresses a pool lists. */
function poolRole(poolKey: string): MachineRole {
  const role = roles.find((candidate) => candidate.pools.some((pool) => pool.key === poolKey));
  if (!role) throw new Error(`slots: no machine role carries the pool '${poolKey}'`);
  return role;
}

/** A pool's servers: its role's two addresses. */
export function poolServers(poolKey: string): pulumi.Output<string>[] {
  return roleAddresses(poolRole(poolKey).role);
}
