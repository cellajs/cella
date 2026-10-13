import { resolveDnsProjectIds } from '../lib/scaleway/dns-zone-project';
import { ipCondition } from '../lib/scaleway/ip-lock';
import { DNS_PERMISSION_SETS, OPERATOR_ORG_PERMISSION_SETS, OPERATOR_PROJECT_PERMISSION_SETS } from '../lib/scaleway/permissions';
import { type PolicyRule, type ProvisionScopedKeyOptions, provisionScopedKey, type ScopedKeyResult } from '../lib/scaleway/scaleway-iam';

export interface SetupOperatorAppOptions extends ProvisionScopedKeyOptions {
  /** Deploy mode; the operator application is always per-mode. */
  mode: string;
  /** The stack's DNS zone: a zone served from another project adds a DNS-only rule for that project. */
  dnsZone?: string;
  /** The addresses the key works from, as canonical IPv4 CIDRs. Never empty. */
  cidrs: readonly string[];
}

/**
 * The operator application's rules: every product of the app project, DNS in the serving zone's project when that is another one, and IAM
 * write in the organization. Each rule carries the same IP condition, as one rule without it would admit the key from every address.
 */
export function operatorRules(opts: {
  projectId: string;
  organizationId: string;
  dnsProjectIds: readonly string[];
  cidrs: readonly string[];
}): PolicyRule[] {
  const condition = ipCondition(opts.cidrs);
  const zoneProjects = opts.dnsProjectIds.filter((id) => id !== opts.projectId);
  return [
    { permission_set_names: OPERATOR_PROJECT_PERMISSION_SETS, project_ids: [opts.projectId], condition },
    ...(zoneProjects.length > 0 ? [{ permission_set_names: DNS_PERMISSION_SETS, project_ids: zoneProjects, condition }] : []),
    { permission_set_names: OPERATOR_ORG_PERMISSION_SETS, organization_id: opts.organizationId, condition },
  ];
}

/**
 * Provision the `<slug>-<mode>-operator` application with a fresh key: the principal a person runs privileged actions as. It holds what a
 * privileged `pulumi up` needs, and Scaleway accepts its key from the given addresses only, so a copy of the key is useless elsewhere.
 * A run replaces the policy and every earlier key of the application. The caller must not be the operator application itself: its policy is
 * deleted before the new one exists.
 * The key is returned once and stored nowhere: it belongs in the operator's password manager.
 */
export async function setupOperatorApp(opts: SetupOperatorAppOptions): Promise<ScopedKeyResult> {
  // Throws on an empty or malformed list before anything is created.
  ipCondition(opts.cidrs);
  const dnsProjectIds = await resolveDnsProjectIds({ secretKey: opts.callerSecretKey }, opts.dnsZone ?? '', opts.projectId);
  return provisionScopedKey(opts, {
    suffix: 'operator',
    appDescription: 'Human operator principal: privileged infra changes, from the dedicated IP address only',
    policyDescription:
      'Operator policy: all products of the app project + IAM write, every rule conditioned on the dedicated IP address (auto-generated)',
    buildRules: ({ projectId, organizationId }) => operatorRules({ projectId, organizationId, dnsProjectIds, cidrs: opts.cidrs }),
  });
}
