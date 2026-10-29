import { actionCommand } from '../operator-actions';
import { principalServices } from '../services';
import { principalNames } from './principals';
import type { SecretManagerSecret } from './scaleway-secret-manager';
import { DEPLOY_FOLDER } from './secret-paths';

/** One machine identity: a registry service or the builder, and its IAM application. */
export interface MachinePrincipal {
  /** The service slug, or `builder`. */
  principal: string;
  application: string;
}

/** Every machine identity of an environment: one per registry service, wherever it runs, and the builder. */
export function machinePrincipals(slug: string, mode: string): MachinePrincipal[] {
  const names = principalNames(slug, mode);
  return [
    ...principalServices().map((svc) => ({ principal: svc.slug, application: names.vmService(svc.slug) })),
    { principal: 'builder', application: names.builder },
  ];
}

/** The Secret Manager container, in the deploy folder, that holds a principal's standing key. */
export function machineKeyName(principal: string): string {
  return `machine-key-${principal}`;
}

/** Each running service's standing key, by service: what a deploy writes into the cloud-init of the machines it makes. */
export type GenerationKeys = Record<string, { accessKey: string; secretKey: string }>;

/** A principal's standing key, read from the deploy folder with a key that reads its values: the deploy key's or the operator's. */
export async function readStandingKey(
  secrets: { listSecretsUnder(root: string): Promise<SecretManagerSecret[]>; accessLatestValue(secretId: string): Promise<string> },
  principal: string,
): Promise<{ accessKey: string; secretKey: string }> {
  const container = (await secrets.listSecretsUnder(DEPLOY_FOLDER)).find(
    (secret) => secret.name === machineKeyName(principal) && (secret.version_count ?? 0) > 0,
  );
  if (!container) throw new Error(`no standing key for ${principal} in the deploy folder: \`${actionCommand('identity')}\` makes it`);
  return JSON.parse(await secrets.accessLatestValue(container.id)) as { accessKey: string; secretKey: string };
}

/**
 * The container's description: it names the access key, which is no secret, so the identity plan can compare it with the application's
 * live keys from metadata alone, on the observer key.
 */
export function machineKeyDescription(application: string, accessKey: string): string {
  return `Standing key of ${application}: ${accessKey}`;
}

/** The access key a container's description names; undefined for any other description. */
export function standingAccessKey(description: string | null | undefined): string | undefined {
  return description?.match(/: (SCW[A-Z0-9]+)$/)?.[1];
}

/** What a principal's standing key needs: nothing, a new key, or the removal of keys beside it. */
export type MachineKeyChange = 'none' | 'make' | 'prune';

export interface MachineKeyStep extends MachinePrincipal {
  change: MachineKeyChange;
  /** Live keys of the application other than its standing key. */
  extra: string[];
}

/**
 * The step of one principal: `make` when no standing key is stored or the stored one is no longer live, `prune` when the application holds
 * keys beside it (a key no deploy gives a machine is a key nobody watches), `none` otherwise.
 */
export function machineKeyStep(principal: MachinePrincipal, stored: string | undefined, live: readonly string[]): MachineKeyStep {
  const extra = live.filter((accessKey) => accessKey !== stored);
  if (!stored || !live.includes(stored)) return { ...principal, change: 'make', extra };
  return { ...principal, change: extra.length > 0 ? 'prune' : 'none', extra };
}
