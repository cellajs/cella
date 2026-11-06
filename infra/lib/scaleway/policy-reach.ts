import { IAM_BASE, type IamAuth } from './iam-client';
import { scwFetch } from './scw-fetch';

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
