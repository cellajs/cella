import { IAM_BASE, type IamAuth } from './iam-client';
import { ipConditionCidrs } from './ip-lock';
import type { PolicyRule } from './scaleway-iam';
import { scwFetch, scwSend } from './scw-fetch';

/** A rule as IAM returns it. */
export interface LiveRule {
  permission_set_names?: readonly string[];
  project_ids?: readonly string[];
  condition?: string | null;
}

/** Where a policy reaches: the projects its `projectSets` rules name, and the addresses all of its rules agree on. */
export interface PolicyReach {
  projectIds: string[];
  /** Empty when the rules do not carry one and the same address list. */
  cidrs: string[];
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
  return { projectIds, cidrs: conditions.size === 1 ? ipConditionCidrs(only) : [] };
}

/** A policy of the organization by name, with its rules; undefined when there is none. */
export async function readPolicy(auth: IamAuth, organizationId: string, policyName: string): Promise<{ id: string; rules: LiveRule[] } | undefined> {
  const { policies = [] } = await scwFetch<{ policies?: Array<{ id: string; name: string }> }>(
    auth,
    'GET',
    `${IAM_BASE}/policies?organization_id=${organizationId}&policy_name=${encodeURIComponent(policyName)}&page_size=20`,
  );
  const policy = policies.find((candidate) => candidate.name === policyName);
  if (!policy) return undefined;
  const { rules = [] } = await scwFetch<{ rules?: LiveRule[] }>(auth, 'GET', `${IAM_BASE}/rules?policy_id=${policy.id}&page_size=100`);
  return { id: policy.id, rules };
}

/**
 * Add projects to the reach of an address-locked policy in place: its rules are rewritten with every project they already cover, the new ones,
 * and the same address condition, so the application's keys keep working and nothing else changes. Needs IAM write: an Owner key.
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
  if (current.cidrs.length === 0) throw new Error(`'${opts.policyName}' names no single address list on all its rules: set its key up again.`);
  if (opts.projectIds.every((id) => current.projectIds.includes(id))) return 'unchanged';
  const projectIds = [...new Set([...current.projectIds, ...opts.projectIds])];
  await scwSend(opts.auth, 'PUT', `${IAM_BASE}/rules`, { policy_id: policy.id, rules: await opts.rules({ projectIds, cidrs: current.cidrs }) });
  return 'extended';
}
