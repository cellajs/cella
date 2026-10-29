import type { EngineConfig } from '../../config/engine-config';
import { principalSecretCondition } from '../runtime-secrets';
import { principalServices } from '../services';
import {
  BACKEND_S3_PERMISSION_SETS,
  BOOT_PROJECT_PERMISSION_SETS,
  BUILDER_PROJECT_PERMISSION_SETS,
  SERVICE_SECRET_PERMISSION_SETS,
} from './permissions';
import { principalNames, principalTags } from './principals';
import type { PolicyRule } from './scaleway-iam';
import { BOOT_KEY_CONDITION, ruleConditions } from './secret-paths';

/** One machine policy as it must be: the identity it belongs to, and its rules. */
export interface MachinePolicy {
  name: string;
  /** The IAM application the policy grants to. */
  applicationName: string;
  description: string;
  rules: PolicyRule[];
  tags: string[];
}

/**
 * The machine policies of one environment: one per registry service, one for the boot fetcher, one for the builder. They are written at
 * Owner moments, never by the Pulumi program: the operator and the deploy key hold no IAM write. Principals and conditions follow the service
 * registry, not the enabled set, so a service toggle changes compute only. The deploy's grant check compares the live policies with the same
 * builders (lib/scaleway/grant-rows.ts).
 */
export function machinePolicies(appConfig: Pick<EngineConfig, 'slug' | 'mode'>, projectId: string): MachinePolicy[] {
  const { slug, mode } = appConfig;
  const names = principalNames(slug, mode);
  const tags = principalTags(slug, mode);
  const services = principalServices().map((svc) => ({
    name: `${slug}-vm-${svc.slug}-policy`,
    applicationName: names.vmService(svc.slug),
    description: `Path-conditioned secret read${svc.s3Access ? ' + S3 object access' : ''} for the ${svc.slug} service machines (written at Owner moments)`,
    rules: [
      // One rule per part of the condition: a condition too large for one rule is spread over several, which grant the same in sum.
      ...ruleConditions(principalSecretCondition(svc.slug)).map((condition) => ({
        permission_set_names: [...SERVICE_SECRET_PERMISSION_SETS],
        project_ids: [projectId],
        condition,
      })),
      ...(svc.s3Access ? [{ permission_set_names: [...BACKEND_S3_PERMISSION_SETS], project_ids: [projectId] }] : []),
    ],
    tags,
  }));
  const boot: MachinePolicy = {
    name: `${slug}-vm-boot-policy`,
    applicationName: names.boot,
    description: 'Registry pull + boot-diag write + handoff-only secret read for the boot fetcher (written at Owner moments)',
    rules: [
      { permission_set_names: [...BOOT_PROJECT_PERMISSION_SETS], project_ids: [projectId] },
      { permission_set_names: [...SERVICE_SECRET_PERMISSION_SETS], project_ids: [projectId], condition: BOOT_KEY_CONDITION },
    ],
    tags,
  };
  const builder: MachinePolicy = {
    name: `${slug}-builder-policy`,
    applicationName: names.builder,
    description: 'Registry push + frontend file writes for the builder machine (written at Owner moments)',
    rules: [{ permission_set_names: [...BUILDER_PROJECT_PERMISSION_SETS], project_ids: [projectId] }],
    tags,
  };
  return [...services, boot, builder];
}

/** A rule in a form two rules compare by: sets and projects in order, an absent condition as empty. */
function ruleKey(rule: {
  permission_set_names?: readonly string[];
  project_ids?: readonly string[];
  organization_id?: string | null;
  condition?: string | null;
}): string {
  return JSON.stringify([
    [...(rule.permission_set_names ?? [])].sort(),
    [...(rule.project_ids ?? [])].sort(),
    rule.organization_id ?? '',
    rule.condition ?? '',
  ]);
}

/** True when the live rules grant exactly what the wanted ones do, in any order. */
export function sameRules(live: readonly Parameters<typeof ruleKey>[0][], wanted: readonly PolicyRule[]): boolean {
  const a = live.map(ruleKey).sort();
  const b = wanted.map(ruleKey).sort();
  return a.length === b.length && a.every((key, index) => key === b[index]);
}
