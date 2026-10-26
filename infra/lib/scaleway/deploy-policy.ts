import { principalServices } from '../services';
import type { MachinePolicy } from './machine-policies';
import {
  DEPLOY_ORG_PERMISSION_SETS,
  DEPLOY_PROJECT_PERMISSION_SETS,
  DEPLOY_SECRET_METADATA_SETS,
  DEPLOY_SECRET_VALUE_SETS,
  DEPLOY_SECRET_WRITE_SETS,
} from './permissions';
import { principalNames, principalTags } from './principals';
import type { PolicyRule } from './scaleway-iam';
import { deployFolderPath, handoffFolderPath, ruleConditions, serviceKeyCondition } from './secret-paths';

/** Every permission set the deploy key holds, for the deploy's own grant check. */
export const DEPLOY_PERMISSION_SETS = [
  ...DEPLOY_PROJECT_PERMISSION_SETS,
  ...DEPLOY_SECRET_METADATA_SETS,
  ...DEPLOY_SECRET_WRITE_SETS,
  ...DEPLOY_SECRET_VALUE_SETS,
  ...DEPLOY_ORG_PERMISSION_SETS,
] as const;

const startsWith = (path: string) => `resource.name.startsWith("${path}")`;

/** Rules carrying `sets` under a condition, spread over as many rules as the condition needs (`ruleConditions`). */
const conditioned = (sets: readonly string[], projectId: string, terms: readonly string[]): PolicyRule[] =>
  ruleConditions(terms.join(' || ')).map((condition) => ({ permission_set_names: [...sets], project_ids: [projectId], condition }));

/**
 * The deploy key's rules (plan §3.1): machines, buckets, the registry and secret metadata in the project; secret writes in the runtime folders
 * and the hand-over folder; secret values in the deploy folder only; IAM read. No IAM write, no DNS write (the records follow the load balancer's
 * address, which an apply makes), no value of an app's secret, no console, no snapshot. The setup's CI key and Update identities write these rules, and the deploy's grant check reads their sets.
 */
export function deployRules(opts: { slug: string; mode: string; projectId: string; organizationId: string }): PolicyRule[] {
  const runtime = principalServices().map((svc) => serviceKeyCondition(opts.slug, opts.mode, svc.slug));
  const handoff = startsWith(handoffFolderPath(opts.slug, opts.mode));
  const deploy = startsWith(deployFolderPath(opts.slug, opts.mode));
  return [
    { permission_set_names: [...DEPLOY_PROJECT_PERMISSION_SETS, ...DEPLOY_SECRET_METADATA_SETS], project_ids: [opts.projectId] },
    ...conditioned(DEPLOY_SECRET_WRITE_SETS, opts.projectId, [...runtime, handoff]),
    ...conditioned(DEPLOY_SECRET_VALUE_SETS, opts.projectId, [deploy]),
    { permission_set_names: [...DEPLOY_ORG_PERMISSION_SETS], organization_id: opts.organizationId },
  ];
}

/** The deploy key's policy as Update identities writes it: the name the setup gave it, so its rules are replaced in place and the key stays. */
export function deployPolicy(opts: { slug: string; mode: string; projectId: string; organizationId: string }): MachinePolicy {
  const names = principalNames(opts.slug, opts.mode);
  return {
    name: `${names.ciDeploy}-policy`,
    applicationName: names.ciDeploy,
    description: 'Least-privilege policy for CI deployments (auto-generated)',
    rules: deployRules(opts),
    tags: principalTags(opts.slug, opts.mode),
  };
}
