import { deployRules } from '../lib/scaleway/deploy-policy';
import { type ProvisionScopedKeyOptions, provisionScopedKey, type ScopedKeyResult } from '../lib/scaleway/scaleway-iam';

export interface SetupCiKeyOptions extends ProvisionScopedKeyOptions {
  /** Deploy mode; per-mode CI apps keep staging/production keys independent. */
  mode: string;
}
export type CiKeyResult = ScopedKeyResult;

/** Create the scoped CI application, least-privilege policy, and fresh key. */
export async function setupCiKey(opts: SetupCiKeyOptions): Promise<CiKeyResult> {
  return provisionScopedKey(opts, {
    suffix: 'ci-deploy',
    appDescription: "The deploy key: the environment's main job deploys with it",
    policyDescription: 'Least-privilege policy for deploys (auto-generated)',
    // The rights of plan §3.1 (lib/scaleway/deploy-policy.ts), which Update identities also writes in place.
    buildRules: ({ projectId, organizationId }) => deployRules({ slug: opts.slug, mode: opts.mode, projectId, organizationId }),
  });
}
