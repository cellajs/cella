import type { IamAuth } from '../lib/scaleway/iam-client';
import type { MachinePolicy } from '../lib/scaleway/machine-policies';
import { OBSERVER_ORG_PERMISSION_SETS, OBSERVER_PROJECT_PERMISSION_SETS } from '../lib/scaleway/permissions';
import { type PolicyReach, policyReach, readPolicy } from '../lib/scaleway/policy-reach';
import { appPrincipalNames } from '../lib/scaleway/principals';
import { type PolicyRule, type ProvisionScopedKeyOptions, provisionScopedKey, type ScopedKeyResult } from '../lib/scaleway/scaleway-iam';

export interface SetupObserverAppOptions extends Omit<ProvisionScopedKeyOptions, 'mode'> {
  /** The app's own slug (`appSlug`): the observer application is one per app. */
  slug: string;
  /** Every project of the app, one per environment. The key's preferred project is `projectId`. */
  projectIds: readonly string[];
}

const POLICY_DESCRIPTION = "Observer policy: read-only sets in the app's projects + IAM read, from any address (auto-generated)";

/** The observer application's rules: read-only sets in the app's projects and IAM read in the organization, with no address condition. */
export function observerRules(opts: { projectIds: readonly string[]; organizationId: string }): PolicyRule[] {
  return [
    { permission_set_names: OBSERVER_PROJECT_PERMISSION_SETS, project_ids: [...opts.projectIds] },
    { permission_set_names: OBSERVER_ORG_PERMISSION_SETS, organization_id: opts.organizationId },
  ];
}

/** The observer's policy as Update identities compares and writes it, reaching `projectIds`. Its creation is the observer's own setup. */
export function observerPolicy(opts: { slug: string; organizationId: string; projectIds: readonly string[] }): MachinePolicy {
  const application = appPrincipalNames(opts.slug).observer;
  return {
    name: `${application}-policy`,
    applicationName: application,
    description: POLICY_DESCRIPTION,
    rules: observerRules({ projectIds: [...new Set(opts.projectIds)], organizationId: opts.organizationId }),
    tags: [],
  };
}

/**
 * Provision the `<app>-observer` application with a fresh key: the read-only key a person and their agents keep on the machine, in every
 * environment of the app. A run replaces the policy and every earlier key of the application. The caller is an Owner API key.
 */
export async function setupObserverApp(opts: SetupObserverAppOptions): Promise<ScopedKeyResult> {
  if (!opts.projectIds.includes(opts.projectId)) throw new Error(`setupObserverApp: project ${opts.projectId} is not among the app's projects.`);
  return provisionScopedKey(opts, {
    suffix: 'observer',
    appDescription: 'Observer principal: read-only, in every environment of the app, from any address',
    policyDescription: POLICY_DESCRIPTION,
    buildRules: ({ organizationId }) => observerRules({ projectIds: opts.projectIds, organizationId }),
  });
}

/** Where the app's observer policy reaches; undefined when the app has no observer. */
export async function observerReach(auth: IamAuth, organizationId: string, slug: string): Promise<PolicyReach | undefined> {
  const policy = await readPolicy(auth, organizationId, `${appPrincipalNames(slug).observer}-policy`);
  return policy ? policyReach(policy.rules, OBSERVER_PROJECT_PERMISSION_SETS) : undefined;
}

/**
 * The observer's policy as declared for an environment: the projects it reaches today and `projectId`. The reach reads from any rule that
 * holds one of the observer's project sets, so a policy that holds other sets or an address condition converges too. Undefined when the app
 * has no observer. Read with any key that reads IAM.
 */
export async function declaredObserverPolicy(
  auth: IamAuth,
  organizationId: string,
  slug: string,
  projectId: string,
): Promise<MachinePolicy | undefined> {
  const reach = await observerReach(auth, organizationId, slug);
  return reach && observerPolicy({ slug, organizationId, projectIds: [...reach.projectIds, projectId] });
}
