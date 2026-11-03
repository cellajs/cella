import { resolveDnsProjectIds } from '../lib/scaleway/dns-zone-project';
import { IAM_BASE, type IamAuth } from '../lib/scaleway/iam-client';
import { sameRules } from '../lib/scaleway/machine-policies';
import { DNS_PERMISSION_SETS, OPERATOR_ORG_PERMISSION_SETS, OPERATOR_PROJECT_PERMISSION_SETS } from '../lib/scaleway/permissions';
import { extendPolicyReach, type LiveRule, type PolicyReach, policyReach, readPolicy } from '../lib/scaleway/policy-reach';
import { appPrincipalNames } from '../lib/scaleway/principals';
import { ensureApplication, ensureGroup, type PolicyRule } from '../lib/scaleway/scaleway-iam';
import { scwFetch, scwSend } from '../lib/scaleway/scw-fetch';
import { changeMark, checkMark } from '../lib/utils/cli-output';

export interface SetupOperatorsOptions {
  callerSecretKey: string;
  organizationId: string;
  /** The project of the environment the action runs for, among `projectIds`. */
  projectId: string;
  /** The app's own slug (`appSlug`): the operators are one set per app. */
  slug: string;
  /** Every project of the app, one per environment, and the runner's. */
  projectIds: readonly string[];
  /** The stack's DNS zone: a zone served from a project outside the app's adds a DNS-only rule for that project. */
  dnsZone?: string;
  log?: (message: string) => void;
}

/** What one principal's policy needed: made, its rules replaced in place, or nothing. */
export type PolicyChange = 'created' | 'updated' | 'unchanged';

/** What Set up operators did to each policy; the application and the group log their own creation. */
export interface OperatorsResult {
  applicationPolicy: PolicyChange;
  groupPolicy: PolicyChange;
}

/**
 * The operators' rules: every product of the app's projects, DNS in the serving zone's project when that is none of them, and IAM read in
 * the organization. No rule carries a condition: a key is held to its day, not to an address.
 */
export function operatorRules(opts: { projectIds: readonly string[]; organizationId: string; dnsProjectIds: readonly string[] }): PolicyRule[] {
  const zoneProjects = opts.dnsProjectIds.filter((id) => !opts.projectIds.includes(id));
  return [
    { permission_set_names: OPERATOR_PROJECT_PERMISSION_SETS, project_ids: [...opts.projectIds] },
    ...(zoneProjects.length > 0 ? [{ permission_set_names: DNS_PERMISSION_SETS, project_ids: zoneProjects }] : []),
    { permission_set_names: OPERATOR_ORG_PERMISSION_SETS, organization_id: opts.organizationId },
  ];
}

/** The principal a policy binds: an application or a group. */
interface PolicyPrincipal {
  kind: 'application' | 'group';
  id: string;
}

/**
 * Write a principal's policy: make it, or replace its rules in place so the keys it grants keep working. A policy of that name bound to
 * another principal is left alone and named: it is fixed in the console. Needs IAM write and read: an Owner key.
 */
async function writePrincipalPolicy(
  auth: IamAuth,
  organizationId: string,
  policy: { name: string; principal: PolicyPrincipal; description: string; rules: PolicyRule[] },
): Promise<PolicyChange> {
  const { kind, id } = policy.principal;
  const live = await readPolicy(auth, organizationId, policy.name);
  if (!live) {
    await scwFetch(auth, 'POST', `${IAM_BASE}/policies`, {
      name: policy.name,
      description: policy.description,
      organization_id: organizationId,
      ...(kind === 'application' ? { application_id: id } : { group_id: id }),
      rules: policy.rules,
    });
    return 'created';
  }
  const bound = kind === 'application' ? live.application_id : live.group_id;
  if (bound !== id) throw new Error(`'${policy.name}' grants to another principal than ${kind} ${id}: fix it in the console.`);
  if (sameRules(live.rules, policy.rules)) return 'unchanged';
  await scwSend(auth, 'PUT', `${IAM_BASE}/rules`, { policy_id: live.id, rules: policy.rules });
  return 'updated';
}

/**
 * Set up the app's operators, at an Owner moment: the `<app>-operator` application, the `<app>-operators` group, and a policy for each with
 * the same rules, written in place when they exist. No key is made: a person makes a one-day key of the application, or of their own user
 * as a member of the group, in the console at each sitting. Runs on an Owner API key, as the operators hold no IAM write.
 */
export async function setupOperators(opts: SetupOperatorsOptions): Promise<OperatorsResult> {
  if (!opts.projectIds.includes(opts.projectId)) throw new Error(`setupOperators: project ${opts.projectId} is not among the app's projects.`);
  const log = opts.log ?? ((message) => console.info(message));
  const auth = { secretKey: opts.callerSecretKey };
  const names = appPrincipalNames(opts.slug);
  const dnsProjectIds = await resolveDnsProjectIds(auth, opts.dnsZone ?? '', opts.projectId);
  const rules = operatorRules({ projectIds: opts.projectIds, organizationId: opts.organizationId, dnsProjectIds });

  const application = await ensureApplication(
    { ...opts, log },
    {
      suffix: 'operator',
      description: 'Operator principal: privileged infra changes in every environment of the app, on a key that ends within a day',
    },
  );
  const group = await ensureGroup({
    callerSecretKey: opts.callerSecretKey,
    organizationId: opts.organizationId,
    name: names.operators,
    description: 'The operators: people whose own one-day keys run privileged infra changes in every environment of the app (managed by cella-infra)',
    log,
  });
  if (!group) throw new Error(`the group '${names.operators}' could be neither found nor made`);

  const description = "Operator policy: all products of the app's projects + IAM read, no condition (auto-generated)";
  const applicationPolicy = await writePrincipalPolicy(auth, opts.organizationId, {
    name: `${names.operator}-policy`,
    principal: { kind: 'application', id: application.id },
    description,
    rules,
  });
  const groupPolicy = await writePrincipalPolicy(auth, opts.organizationId, {
    name: `${names.operators}-policy`,
    principal: { kind: 'group', id: group.id },
    description,
    rules,
  });
  for (const [name, change] of [
    [`${names.operator}-policy`, applicationPolicy],
    [`${names.operators}-policy`, groupPolicy],
  ] as const) {
    if (change === 'created') log(`  ${changeMark} Created IAM policy: ${name}`);
    else if (change === 'updated') log(`  ${changeMark} Replaced the rules of ${name} in place; its keys keep working`);
    else log(`  ${checkMark} ${name} grants what the code declares`);
  }
  return { applicationPolicy, groupPolicy };
}

/** The projects an operator policy's rules give every product in. */
export function operatorPolicyReach(rules: readonly LiveRule[]): PolicyReach {
  return policyReach(rules, OPERATOR_PROJECT_PERMISSION_SETS);
}

/**
 * Add projects to the reach of the app's operators in place: the application's policy and, when the group has one, the group's. Needs IAM
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
  const names = appPrincipalNames(opts.slug);
  const [first] = opts.projectIds;
  const rules = async ({ projectIds }: PolicyReach) => {
    const dnsProjectIds = first ? await resolveDnsProjectIds(opts.auth, opts.dnsZone ?? '', first) : [];
    return operatorRules({ projectIds, organizationId: opts.organizationId, dnsProjectIds });
  };
  const reach = {
    auth: opts.auth,
    organizationId: opts.organizationId,
    projectSets: OPERATOR_PROJECT_PERMISSION_SETS,
    projectIds: opts.projectIds,
    rules,
  };
  const application = await extendPolicyReach({ ...reach, policyName: `${names.operator}-policy` });
  if (application === 'absent') return 'absent';
  await extendPolicyReach({ ...reach, policyName: `${names.operators}-policy` });
  return application;
}
