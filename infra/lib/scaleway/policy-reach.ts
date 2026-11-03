import { IAM_BASE, type IamAuth } from './iam-client';
import type { PolicyRule } from './scaleway-iam';
import { scwFetch, scwSend } from './scw-fetch';

/** A rule as IAM returns it. */
export interface LiveRule {
  permission_set_names?: readonly string[];
  project_ids?: readonly string[];
  condition?: string | null;
}

/** Where a policy reaches: the projects its `projectSets` rules name, and the condition all of its rules agree on. */
export interface PolicyReach {
  projectIds: string[];
  /** Undefined when the rules carry no condition, or not one and the same. */
  condition?: string;
}

/** The reach of a policy's rules, read from the rules that hold one of `projectSets`. */
export function policyReach(rules: readonly LiveRule[], projectSets: readonly string[]): PolicyReach {
  const projectIds = [
    ...new Set(
      rules.filter((rule) => (rule.permission_set_names ?? []).some((set) => projectSets.includes(set))).flatMap((rule) => rule.project_ids ?? []),
    ),
  ];
  const conditions = new Set(rules.map((rule) => rule.condition ?? ''));
  const [only] = [...conditions];
  return { projectIds, ...(conditions.size === 1 && only ? { condition: only } : {}) };
}

/** A policy as IAM lists it: bound to exactly one of an application, a group or a user. */
export interface LivePolicy {
  id: string;
  description?: string;
  rules: LiveRule[];
  application_id?: string;
  group_id?: string;
  user_id?: string;
}

/** A policy of the organization by name, with its rules; undefined when there is none. */
export async function readPolicy(auth: IamAuth, organizationId: string, policyName: string): Promise<LivePolicy | undefined> {
  const { policies = [] } = await scwFetch<{ policies?: Array<Omit<LivePolicy, 'rules'> & { name: string }> }>(
    auth,
    'GET',
    `${IAM_BASE}/policies?organization_id=${organizationId}&policy_name=${encodeURIComponent(policyName)}&page_size=20`,
  );
  const policy = policies.find((candidate) => candidate.name === policyName);
  if (!policy) return undefined;
  const { rules = [] } = await scwFetch<{ rules?: LiveRule[] }>(auth, 'GET', `${IAM_BASE}/rules?policy_id=${policy.id}&page_size=100`);
  const { name: _name, ...rest } = policy;
  return { ...rest, rules };
}

/**
 * Add projects to the reach of a policy in place: its rules are rewritten with every project they already cover, the new ones, and the
 * condition they share, so the keys it grants keep working and nothing else changes. Needs IAM write: an Owner key.
 * `absent` when the organization has no such policy; `unchanged` when it covers the projects already.
 */
export async function extendPolicyReach(opts: {
  auth: IamAuth;
  organizationId: string;
  policyName: string;
  /** The sets whose rules name the projects. */
  projectSets: readonly string[];
  projectIds: readonly string[];
  /** The policy's rules for a reach. */
  rules: (reach: PolicyReach) => PolicyRule[] | Promise<PolicyRule[]>;
}): Promise<'extended' | 'unchanged' | 'absent'> {
  const policy = await readPolicy(opts.auth, opts.organizationId, opts.policyName);
  if (!policy) return 'absent';
  const current = policyReach(policy.rules, opts.projectSets);
  if (opts.projectIds.every((id) => current.projectIds.includes(id))) return 'unchanged';
  const projectIds = [...new Set([...current.projectIds, ...opts.projectIds])];
  await scwSend(opts.auth, 'PUT', `${IAM_BASE}/rules`, { policy_id: policy.id, rules: await opts.rules({ ...current, projectIds }) });
  return 'extended';
}
