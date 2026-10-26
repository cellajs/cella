import type { EngineConfig } from '../../config/engine-config';
import { principalServices } from '../services';
import { deployPolicy } from './deploy-policy';
import { type MachinePolicy, machinePolicies } from './machine-policies';
import { principalNames } from './principals';

/** What an Owner moment writes for one environment: the applications, and the policy of each. */
export interface DeclaredIdentities {
  applications: string[];
  policies: MachinePolicy[];
}

/** The machine identities' applications: one per registry service, the boot fetcher and the builder. */
export function machineApplications(slug: string, mode: string): string[] {
  const names = principalNames(slug, mode);
  return [...principalServices().map((svc) => names.vmService(svc.slug)), names.boot, names.builder];
}

/** Every identity an environment's code declares: the machine identities and the deploy key, with their policies. */
export function declaredIdentities(
  appConfig: Pick<EngineConfig, 'slug' | 'mode'>,
  ids: { projectId: string; organizationId: string },
): DeclaredIdentities {
  const { slug, mode } = appConfig;
  return {
    applications: [...machineApplications(slug, mode), principalNames(slug, mode).ciDeploy],
    policies: [...machinePolicies(appConfig, ids.projectId), deployPolicy({ slug, mode, ...ids })],
  };
}
