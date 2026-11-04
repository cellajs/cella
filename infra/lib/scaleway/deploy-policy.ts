import type { DeclaredPolicy } from './declared-identities';
import { DEPLOY_PROJECT_PERMISSION_SETS, DEPLOY_SECRET_METADATA_SETS, DEPLOY_SECRET_VALUE_SETS } from './permissions';
import { principalNames, principalTags } from './principals';
import type { PolicyRule } from './scaleway-iam';
import { runtimeFolderCondition } from './secret-paths';

/**
 * The deploy key's rules: machines and buckets in the project, secret metadata, and secret values in the runtime folder only.
 * No IAM, no DNS write (the records follow the load balancer's address, which an apply makes), no load balancer or address write, no
 * secret write, no registry, no console, no snapshot. It reads the environment's runtime secrets and composes them into each machine's env
 * file. Update identities writes these rules.
 */
export function deployRules(opts: { projectId: string }): PolicyRule[] {
  return [
    { permission_set_names: [...DEPLOY_PROJECT_PERMISSION_SETS, ...DEPLOY_SECRET_METADATA_SETS], project_ids: [opts.projectId] },
    { permission_set_names: [...DEPLOY_SECRET_VALUE_SETS], project_ids: [opts.projectId], condition: runtimeFolderCondition },
  ];
}

/** The deploy key's policy as Update identities writes it: the name the setup gave it, so its rules are replaced in place and the key stays. */
export function deployPolicy(opts: { slug: string; mode: string; projectId: string; organizationId: string }): DeclaredPolicy {
  const names = principalNames(opts.slug, opts.mode);
  return {
    name: `${names.ciDeploy}-policy`,
    applicationName: names.ciDeploy,
    description: 'Least-privilege policy for CI deployments (auto-generated)',
    rules: deployRules({ projectId: opts.projectId }),
    tags: principalTags(opts.slug, opts.mode),
  };
}
