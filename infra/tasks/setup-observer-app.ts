import { IAM_BASE, type IamAuth } from '../lib/scaleway/iam-client';
import { ipCondition } from '../lib/scaleway/ip-lock';
import { OBSERVER_ORG_PERMISSION_SETS, OBSERVER_PROJECT_PERMISSION_SETS } from '../lib/scaleway/permissions';
import { extendPolicyReach, type PolicyReach, policyReach, readPolicy } from '../lib/scaleway/policy-reach';
import { type PolicyRule, type ProvisionScopedKeyOptions, provisionScopedKey, type ScopedKeyResult } from '../lib/scaleway/scaleway-iam';
import { scwSend } from '../lib/scaleway/scw-fetch';

export interface SetupObserverAppOptions extends Omit<ProvisionScopedKeyOptions, 'mode'> {
  /** The app's own slug (`appSlug`): the observer application is one per app. */
  slug: string;
  /** Every project of the app, one per environment. The key's preferred project is `projectId`. */
  projectIds: readonly string[];
  /** The addresses the key works from, as canonical IPv4 CIDRs: the operator's. Never empty. */
  cidrs: readonly string[];
}

/** The observer application's rules: read-only sets in the app's projects and IAM read in the organization, each under the same IP condition. */
export function observerRules(opts: { projectIds: readonly string[]; organizationId: string; cidrs: readonly string[] }): PolicyRule[] {
  const condition = ipCondition(opts.cidrs);
  return [
    { permission_set_names: OBSERVER_PROJECT_PERMISSION_SETS, project_ids: [...opts.projectIds], condition },
    { permission_set_names: OBSERVER_ORG_PERMISSION_SETS, organization_id: opts.organizationId, condition },
  ];
}

/**
 * Provision the `<app>-observer` application with a fresh key: the read-only key a person and their agents keep on the machine, in every
 * environment of the app. A run replaces the policy and every earlier key of the application. The caller is an Owner API key.
 */
export async function setupObserverApp(opts: SetupObserverAppOptions): Promise<ScopedKeyResult> {
  ipCondition(opts.cidrs);
  if (!opts.projectIds.includes(opts.projectId)) throw new Error(`setupObserverApp: project ${opts.projectId} is not among the app's projects.`);
  return provisionScopedKey(opts, {
    suffix: 'observer',
    appDescription: 'Observer principal: read-only, in every environment of the app, from the dedicated IP address only',
    policyDescription:
      "Observer policy: read-only sets in the app's projects + IAM read, every rule conditioned on the dedicated IP address (auto-generated)",
    buildRules: ({ organizationId }) => observerRules({ projectIds: opts.projectIds, organizationId, cidrs: opts.cidrs }),
  });
}

/** Where the app's observer policy reaches; undefined when the app has no observer. */
export async function observerReach(auth: IamAuth, organizationId: string, slug: string): Promise<PolicyReach | undefined> {
  const policy = await readPolicy(auth, organizationId, `${slug}-observer-policy`);
  return policy ? policyReach(policy.rules, OBSERVER_PROJECT_PERMISSION_SETS) : undefined;
}

/** Add projects to the reach of the app's observer in place, so its key keeps working. Needs IAM write: an Owner key. */
export function extendObserverReach(opts: {
  auth: IamAuth;
  organizationId: string;
  /** The app's own slug (`appSlug`). */
  slug: string;
  projectIds: readonly string[];
}): Promise<'extended' | 'unchanged' | 'absent'> {
  return extendPolicyReach({
    auth: opts.auth,
    organizationId: opts.organizationId,
    policyName: `${opts.slug}-observer-policy`,
    projectSets: OBSERVER_PROJECT_PERMISSION_SETS,
    projectIds: opts.projectIds,
    rules: ({ projectIds, cidrs }) => observerRules({ projectIds, organizationId: opts.organizationId, cidrs }),
  });
}

/**
 * Give the app's observer this address list in place, keeping its reach, so its key keeps working: the operator's new addresses take the
 * observer along. Needs IAM write: an Owner key. `absent` when the app has no observer; `unchanged` when it has this list already.
 */
export async function setObserverAddresses(opts: {
  auth: IamAuth;
  organizationId: string;
  /** The app's own slug (`appSlug`). */
  slug: string;
  cidrs: readonly string[];
}): Promise<'set' | 'unchanged' | 'absent'> {
  const policy = await readPolicy(opts.auth, opts.organizationId, `${opts.slug}-observer-policy`);
  if (!policy) return 'absent';
  const reach = policyReach(policy.rules, OBSERVER_PROJECT_PERMISSION_SETS);
  if (reach.cidrs.length === opts.cidrs.length && opts.cidrs.every((cidr) => reach.cidrs.includes(cidr))) return 'unchanged';
  const rules = observerRules({ projectIds: reach.projectIds, organizationId: opts.organizationId, cidrs: opts.cidrs });
  await scwSend(opts.auth, 'PUT', `${IAM_BASE}/rules`, { policy_id: policy.id, rules });
  return 'set';
}
