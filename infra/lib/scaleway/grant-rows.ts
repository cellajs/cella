import type { EngineConfig } from '../../config/engine-config';
import { DEPLOY_PERMISSION_SETS } from './deploy-policy';
import { machinePolicies } from './machine-policies';
import { principalNames } from './principals';

/** One grant assertion: the exact permission sets and secret condition a principal must hold, and whether it must hold no key at all. */
export interface GrantRow {
  app: string;
  sets: string[];
  /** '' skips the secret-condition check (the CI app's rules are unconditioned by design). */
  condition: string;
}

/**
 * One assertion row per principal, read from the policies Update identities writes (`machinePolicies`), so the deploy's grant check and the
 * apply's self-check compare the live policies with what was declared, and the two cannot drift. A policy whose condition spans several rules
 * asserts it whole. The deploy key's rules carry two conditions (writes and values), so its row asserts the sets alone.
 */
export function buildGrantRows(appConfig: EngineConfig): GrantRow[] {
  const names = principalNames(appConfig.slug, appConfig.mode);
  return [
    ...machinePolicies(appConfig, '').map((policy) => ({
      app: policy.applicationName,
      sets: [...new Set(policy.rules.flatMap((rule) => rule.permission_set_names))],
      condition: policy.rules.flatMap((rule) => (rule.condition ? [rule.condition] : [])).join(' || '),
    })),
    { app: names.ciDeploy, sets: [...new Set(DEPLOY_PERMISSION_SETS)], condition: '' },
  ];
}
