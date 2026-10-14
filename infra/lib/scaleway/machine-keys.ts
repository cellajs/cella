import { principalServices } from '../services';
import { principalNames } from './principals';

/** One machine identity: a registry service, or the boot fetcher, and its IAM application. */
export interface MachinePrincipal {
  /** The service slug, or `boot`. */
  principal: string;
  application: string;
}

/** Every machine identity of an environment: one per registry service, wherever it runs, and the boot fetcher. */
export function machinePrincipals(slug: string, mode: string): MachinePrincipal[] {
  const names = principalNames(slug, mode);
  return [
    ...principalServices().map((svc) => ({ principal: svc.slug, application: names.vmService(svc.slug) })),
    { principal: 'boot', application: names.boot },
  ];
}

/** The Secret Manager container, in the deploy folder, that holds a principal's standing key. */
export function machineKeyName(principal: string): string {
  return `machine-key-${principal}`;
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
 * keys beside it (a key nobody hands over is a key nobody watches), `none` otherwise.
 */
export function machineKeyStep(principal: MachinePrincipal, stored: string | undefined, live: readonly string[]): MachineKeyStep {
  const extra = live.filter((accessKey) => accessKey !== stored);
  if (!stored || !live.includes(stored)) return { ...principal, change: 'make', extra };
  return { ...principal, change: extra.length > 0 ? 'prune' : 'none', extra };
}
