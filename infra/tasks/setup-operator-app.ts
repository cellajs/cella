import { resolveDnsProjectIds } from '../lib/scaleway/dns-zone-project';
import type { IamAuth } from '../lib/scaleway/iam-client';
import { ipCondition } from '../lib/scaleway/ip-lock';
import { DNS_PERMISSION_SETS, OPERATOR_ORG_PERMISSION_SETS, OPERATOR_PROJECT_PERMISSION_SETS } from '../lib/scaleway/permissions';
import { extendPolicyReach, type LiveRule, type PolicyReach, policyReach } from '../lib/scaleway/policy-reach';
import { type PolicyRule, type ProvisionScopedKeyOptions, provisionScopedKey, type ScopedKeyResult } from '../lib/scaleway/scaleway-iam';

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

/** The projects an operator policy's rules give every product in, and the addresses all of its rules agree on (empty when they do not). */
export function operatorPolicyReach(rules: readonly LiveRule[]): PolicyReach {
  return policyReach(rules, OPERATOR_PROJECT_PERMISSION_SETS);
}

/**
 * Add projects to the reach of the app's operator in place, so the key the person stored keeps working and nothing else changes. Needs IAM
 * write: an Owner key. `absent` when the app has no operator policy yet; `unchanged` when it covers the projects already.
 */
export async function extendOperatorReach(opts: {
  auth: IamAuth;
  organizationId: string;
  /** The app's own slug (`appSlug`). */
  slug: string;
  projectIds: readonly string[];
  dnsZone?: string;
}): Promise<'extended' | 'unchanged' | 'absent'> {
  const [first] = opts.projectIds;
  return extendPolicyReach({
    auth: opts.auth,
    organizationId: opts.organizationId,
    policyName: `${opts.slug}-operator-policy`,
    projectSets: OPERATOR_PROJECT_PERMISSION_SETS,
    projectIds: opts.projectIds,
    rules: async ({ projectIds, cidrs }) => {
      const dnsProjectIds = first ? await resolveDnsProjectIds(opts.auth, opts.dnsZone ?? '', first) : [];
      return operatorRules({ projectIds, organizationId: opts.organizationId, dnsProjectIds, cidrs });
    },
  });
}
