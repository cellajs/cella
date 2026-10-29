import type { MachinePolicy } from './machine-policies';
import { DEPLOY_ORG_PERMISSION_SETS, DEPLOY_PROJECT_PERMISSION_SETS, DEPLOY_SECRET_METADATA_SETS, DEPLOY_SECRET_VALUE_SETS } from './permissions';
import { principalNames, principalTags } from './principals';
import type { PolicyRule } from './scaleway-iam';
import { DEPLOY_FOLDER } from './secret-paths';

/** Every permission set the deploy key holds, for the deploy's own grant check. */
export const DEPLOY_PERMISSION_SETS = [
  ...DEPLOY_PROJECT_PERMISSION_SETS,
  ...DEPLOY_SECRET_METADATA_SETS,
  ...DEPLOY_SECRET_VALUE_SETS,
  ...DEPLOY_ORG_PERMISSION_SETS,
] as const;

/**
 * The deploy key's rules (plan §3.1): machines, buckets, the registry and secret metadata in the project; secret values in the deploy folder
 * only; IAM read. No IAM write, no DNS write (the records follow the load balancer's address, which an apply makes), no secret write, no
 * console, no snapshot. It writes each machine's key into its cloud-init, so it reaches the environment's runtime secrets through the machines
 * it makes. Update identities writes these rules, and a deploy whose policy differs stops blocked.
 */
export function deployRules(opts: { projectId: string; organizationId: string }): PolicyRule[] {
  return [
    { permission_set_names: [...DEPLOY_PROJECT_PERMISSION_SETS, ...DEPLOY_SECRET_METADATA_SETS], project_ids: [opts.projectId] },
    { permission_set_names: [...DEPLOY_SECRET_VALUE_SETS], project_ids: [opts.projectId], condition: `resource.name.startsWith("${DEPLOY_FOLDER}")` },
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
