import * as pulumi from '@pulumi/pulumi';

/**
 * Deferred hand-off of the LB's private-network address, which compute.ts bakes into consumer VM env before loadbalancer.ts (which imports compute's generation state) publishes it.
 * The promise settles only when the LB is provisioned; nothing awaits it unless an `internalPort` consumer is deployed.
 */
let publishAddress: ((address: pulumi.Output<string>) => void) | undefined;
const pendingAddress = new Promise<pulumi.Output<string>>((resolve) => {
  publishAddress = resolve;
});

/** The LB's stable private-network IPv4 address (no CIDR suffix). */
export const lbInternalAddress: pulumi.Output<string> = pulumi
  .output(pendingAddress)
  .apply((address) => address.split('/')[0] ?? address);

/** Publish the LB private address; called exactly once by loadbalancer.ts. */
export function publishLbInternalAddress(address: pulumi.Output<string>): void {
  publishAddress?.(address);
}

/** Inbound port of a service's internal LB frontend: its internal listener's port shifted into a 10xxx range so it cannot collide with the public 80/443 frontends or another service's port. */
export function internalLbPort(internalPort: number): number {
  const port = 10000 + internalPort;
  if (port > 65535) throw new Error(`internal LB port ${port} exceeds the valid range (internal port ${internalPort})`);
  return port;
}
