import type * as pulumi from '@pulumi/pulumi';
import * as scaleway from '@pulumiverse/scaleway';
import { agentPort } from '../lib/machine-roles';
import { naming, tags, zone, zones } from '../pulumi-context';
import { lbPrivateAddress } from './loadbalancer';
import { roles } from './slots';

/** A group that drops every inbound packet and lets the machine reach out. */
function group(
  logicalName: string,
  displayName: string,
  groupZone: string,
  inboundRules: pulumi.Input<scaleway.types.input.instance.SecurityGroupInboundRule[]> = [],
) {
  return new scaleway.instance.SecurityGroup(logicalName, {
    name: displayName,
    inboundDefaultPolicy: 'drop',
    outboundDefaultPolicy: 'accept',
    inboundRules,
    zone: groupZone,
    tags,
  });
}

// The builder's group, closed: no machine takes a login, and the serial console shows its output. A group is zonal, and the builder is made
// in another zone of the region when its type is out of stock in this one (tasks/build-release.ts).
group('compute-sg', naming.resource('compute-sg'), zone);
for (const other of zones.filter((candidate) => candidate !== zone)) group(`compute-sg-${other}`, naming.resource('compute-sg'), other);

/**
 * One group per role, which the deploy makes the role's machines in: it admits the load balancer's private address to each port a pool
 * forwards to and to the agent port its health check asks, and nothing else. A role no pool lists admits nothing.
 */
for (const role of roles) {
  const ports = [...new Set(role.pools.flatMap((pool) => [pool.port, agentPort(pool.service)]))].sort((a, b) => a - b);
  group(
    `machine-sg-${role.role}`,
    naming.resource(`${role.role}-sg`),
    zone,
    lbPrivateAddress.apply((address) => ports.map((port) => ({ action: 'accept', protocol: 'TCP', port, ipRange: `${address}/32` }))),
  );
}
