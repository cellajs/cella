import type { ServiceName } from '../compose/compose';

/** One entry of the `computeGenerationMetadata` stack output: a live generation VM's recorded facts, read back as JSON by the deploy tasks. */
export interface GenerationMetadata {
  /** Service slug this generation belongs to. */
  service: ServiceName;
  /** Content-addressed generation id (lib/gen-id.ts). */
  genId: string;
  /** Image SHA baked into this generation. */
  sha: string;
  /** Pulumi resource name `vm-<svc>-<genId>`. */
  name: string;
  /** Scaleway instance server id. */
  serverId: string;
  /** This generation's own private-network IP. */
  privateIp: string;
  /** Private NIC id carrying the private-network IP. */
  privateNicId: string;
}
