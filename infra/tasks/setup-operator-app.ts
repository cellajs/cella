import { resolveDnsProjectIds } from '../lib/scaleway/dns-zone-project';
import { IAM_BASE, type IamAuth } from '../lib/scaleway/iam-client';
import { ipCondition, ipConditionCidrs } from '../lib/scaleway/ip-lock';
import { DNS_PERMISSION_SETS, OPERATOR_ORG_PERMISSION_SETS, OPERATOR_PROJECT_PERMISSION_SETS } from '../lib/scaleway/permissions';
import { type PolicyRule, type ProvisionScopedKeyOptions, provisionScopedKey, type ScopedKeyResult } from '../lib/scaleway/scaleway-iam';
import { scwFetch, scwSend } from '../lib/scaleway/scw-fetch';

export interface SetupOperatorAppOptions extends Omit<ProvisionScopedKeyOptions, 'mode'> {
  /** The app's own slug (`appSlug`): the operator application is one per app. */
  slug: string;
  /** Every project of the app, one per environment. The key's preferred project is `projectId`, the environment the action runs for. */
  projectIds: readonly string[];
  /** The stack's DNS zone: a zone served from a project outside the app's adds a DNS-only rule for that project. */
  dnsZone?: string;
  /** The addresses the key works from, as canonical IPv4 CIDRs. Never empty. */
  cidrs: readonly string[];
}

/**
 * The operator application's rules: every product of the app's projects, DNS in the serving zone's project when that is none of them, and
 * IAM read in the organization. Each rule carries the same IP condition, as one rule without it would admit the key from every address.
 */
export function operatorRules(opts: {
  projectIds: readonly string[];
  organizationId: string;
  dnsProjectIds: readonly string[];
  cidrs: readonly string[];
}): PolicyRule[] {
  const condition = ipCondition(opts.cidrs);
  const zoneProjects = opts.dnsProjectIds.filter((id) => !opts.projectIds.includes(id));
  return [
    { permission_set_names: OPERATOR_PROJECT_PERMISSION_SETS, project_ids: [...opts.projectIds], condition },
    ...(zoneProjects.length > 0 ? [{ permission_set_names: DNS_PERMISSION_SETS, project_ids: zoneProjects, condition }] : []),
    { permission_set_names: OPERATOR_ORG_PERMISSION_SETS, organization_id: opts.organizationId, condition },
  ];
}

/**
 * Provision the `<app>-operator` application with a fresh key: the principal a person runs privileged actions as, in every environment of
 * the app. It holds what a privileged `pulumi up` needs and no IAM write, and Scaleway accepts its key from the given addresses only, so a
 * copy of the key is useless elsewhere. A run replaces the policy and every earlier key of the application. The caller is an Owner API key.
 * The key is returned once and stored nowhere: it belongs in the operator's password manager.
 */
export async function setupOperatorApp(opts: SetupOperatorAppOptions): Promise<ScopedKeyResult> {
  // Throws on an empty or malformed list before anything is created.
  ipCondition(opts.cidrs);
  if (!opts.projectIds.includes(opts.projectId)) throw new Error(`setupOperatorApp: project ${opts.projectId} is not among the app's projects.`);
  const dnsProjectIds = await resolveDnsProjectIds({ secretKey: opts.callerSecretKey }, opts.dnsZone ?? '', opts.projectId);
  return provisionScopedKey(opts, {
    suffix: 'operator',
    appDescription: 'Human operator principal: privileged infra changes in every environment of the app, from the dedicated IP address only',
    policyDescription:
      "Operator policy: all products of the app's projects + IAM read, every rule conditioned on the dedicated IP address (auto-generated)",
    buildRules: ({ organizationId }) => operatorRules({ projectIds: opts.projectIds, organizationId, dnsProjectIds, cidrs: opts.cidrs }),
  });
}

interface LiveRule {
  permission_set_names?: readonly string[];
  project_ids?: readonly string[];
  condition?: string | null;
}

/** The projects an operator policy's rules give every product in, and the addresses all of its rules agree on (empty when they do not). */
export function operatorPolicyReach(rules: readonly LiveRule[]): { projectIds: string[]; cidrs: string[] } {
  const projectIds = [
    ...new Set(
      rules
        .filter((rule) => (rule.permission_set_names ?? []).some((set) => OPERATOR_PROJECT_PERMISSION_SETS.includes(set as never)))
        .flatMap((rule) => rule.project_ids ?? []),
    ),
  ];
  const conditions = new Set(rules.map((rule) => rule.condition ?? ''));
  const [only] = [...conditions];
  return { projectIds, cidrs: conditions.size === 1 ? ipConditionCidrs(only) : [] };
}

/**
 * Add projects to the reach of the app's operator in place: the policy's rules are rewritten with every project they already cover, the new
 * ones, and the same address condition, so the key the person stored keeps working and nothing else changes. Needs IAM write: an Owner key.
 * `absent` when the app has no operator policy yet; `unchanged` when it covers the projects already.
 */
export async function extendOperatorReach(opts: {
  auth: IamAuth;
  organizationId: string;
  /** The app's own slug (`appSlug`). */
  slug: string;
  projectIds: readonly string[];
  dnsZone?: string;
}): Promise<'extended' | 'unchanged' | 'absent'> {
  const policyName = `${opts.slug}-operator-policy`;
  const { policies = [] } = await scwFetch<{ policies?: Array<{ id: string; name: string }> }>(
    opts.auth,
    'GET',
    `${IAM_BASE}/policies?organization_id=${opts.organizationId}&policy_name=${encodeURIComponent(policyName)}&page_size=20`,
  );
  const policy = policies.find((candidate) => candidate.name === policyName);
  if (!policy) return 'absent';
  const { rules = [] } = await scwFetch<{ rules?: LiveRule[] }>(opts.auth, 'GET', `${IAM_BASE}/rules?policy_id=${policy.id}&page_size=100`);
  const current = operatorPolicyReach(rules);
  if (current.cidrs.length === 0) throw new Error(`'${policyName}' names no single address list on all its rules: set the operator key up again.`);
  if (opts.projectIds.every((id) => current.projectIds.includes(id))) return 'unchanged';
  const projectIds = [...new Set([...current.projectIds, ...opts.projectIds])];
  const [first] = opts.projectIds;
  const dnsProjectIds = first ? await resolveDnsProjectIds(opts.auth, opts.dnsZone ?? '', first) : [];
  await scwSend(opts.auth, 'PUT', `${IAM_BASE}/rules`, {
    policy_id: policy.id,
    rules: operatorRules({ projectIds, organizationId: opts.organizationId, dnsProjectIds, cidrs: current.cidrs }),
  });
  return 'extended';
}
