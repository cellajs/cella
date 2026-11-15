import { sameRules } from '../lib/scaleway/declared-identities';
import { resolveDnsProjectIds } from '../lib/scaleway/dns-zone-project';
import { IAM_BASE, type IamAuth } from '../lib/scaleway/iam-client';
import { DNS_PERMISSION_SETS, OPERATOR_ORG_PERMISSION_SETS, OPERATOR_PROJECT_PERMISSION_SETS } from '../lib/scaleway/permissions';
import { type LivePolicy, type LiveRule, type PolicyReach, policyReach, readPolicy } from '../lib/scaleway/policy-reach';
import { type AppPrincipalNames, appPrincipalNames } from '../lib/scaleway/principals';
import { addApplicationToGroup, ensureApplication, ensureGroup, type PolicyRule } from '../lib/scaleway/scaleway-iam';
import { scwFetch, scwSend } from '../lib/scaleway/scw-fetch';
import { changeMark, checkMark, warningMark } from '../lib/utils/cli-output';

export interface SetupOperatorsOptions {
  callerSecretKey: string;
  organizationId: string;
  /** The project of the environment the action runs for, among `projectIds`. */
  projectId: string;
  /** The app's own slug (`appSlug`): the operators are one set per app. */
  slug: string;
  /** The projects the operators reach from now on, beside every project their policy reaches today. */
  projectIds: readonly string[];
  /** The stack's DNS zone: a zone served from a project outside the app's adds a DNS-only rule for that project. */
  dnsZone?: string;
  log?: (message: string) => void;
}

/** What the operators' policy needed: made, its rules replaced in place, or nothing. */
export type PolicyChange = 'created' | 'updated' | 'unchanged';

/** What Set up operators did; the application and the group log their own creation. */
export interface OperatorsResult {
  policy: PolicyChange;
  /** True when the application held a policy of its own, which was deleted: the group's grants to it as a member. */
  applicationPolicyDeleted: boolean;
  /** True when an address condition went with a rewrite or that deletion: a durable key made under it works from every address now. */
  conditionDropped: boolean;
}

/** The description the operators' policy carries, by which an old one is told from the declared one. */
export const OPERATOR_POLICY_DESCRIPTION = "Operator policy: all products of the app's projects + IAM read, no condition (auto-generated)";

/** Where an operator key made under the old address condition is revoked, for every notice that a rewrite dropped it. */
function durableKeyRevokeNotice(names: AppPrincipalNames): string {
  return `A key of '${names.operator}' made before this works from every address until it ends: revoke a durable one in the console (IAM → Applications → ${names.operator} → API keys).`;
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

/**
 * Write the operators group's policy: make it, or replace its rules and description in place so the keys it grants keep working. A policy
 * of that name bound to another principal is left alone and named: it is fixed in the console. Needs IAM write and read: an Owner key.
 */
async function writeOperatorsPolicy(
  auth: IamAuth,
  organizationId: string,
  policy: { name: string; groupId: string; rules: PolicyRule[] },
  live: LivePolicy | undefined,
): Promise<{ change: PolicyChange; conditionDropped: boolean }> {
  if (!live) {
    await scwFetch(auth, 'POST', `${IAM_BASE}/policies`, {
      name: policy.name,
      description: OPERATOR_POLICY_DESCRIPTION,
      organization_id: organizationId,
      group_id: policy.groupId,
      rules: policy.rules,
    });
    return { change: 'created', conditionDropped: false };
  }
  if (live.group_id !== policy.groupId)
    throw new Error(`'${policy.name}' grants to another principal than group ${policy.groupId}: fix it in the console.`);
  if (sameRules(live.rules, policy.rules) && live.description === OPERATOR_POLICY_DESCRIPTION)
    return { change: 'unchanged', conditionDropped: false };
  const conditionDropped = live.rules.some((rule) => Boolean(rule.condition));
  if (!sameRules(live.rules, policy.rules)) await scwSend(auth, 'PUT', `${IAM_BASE}/rules`, { policy_id: live.id, rules: policy.rules });
  if (live.description !== OPERATOR_POLICY_DESCRIPTION) {
    await scwSend(auth, 'PATCH', `${IAM_BASE}/policies/${live.id}`, { description: OPERATOR_POLICY_DESCRIPTION });
  }
  return { change: 'updated', conditionDropped };
}

/**
 * Set up the app's operators, at an Owner moment: the `<app>-operator` application as a member of the `<app>-operators` group, and one
 * policy, the group's, written in place when it exists, over `projectIds` and every project the operators reach today. The application
 * holds no policy of its own: one an earlier setup gave it is deleted once the group's grants to it. No key is made: a person makes a
 * one-day key of the application, or of their own user as a member of the group, in the console at each sitting. Runs on an Owner API
 * key, as the operators hold no IAM write.
 */
export async function setupOperators(opts: SetupOperatorsOptions): Promise<OperatorsResult> {
  if (!opts.projectIds.includes(opts.projectId)) throw new Error(`setupOperators: project ${opts.projectId} is not among the app's projects.`);
  const log = opts.log ?? ((message) => console.info(message));
  const auth = { secretKey: opts.callerSecretKey };
  const names = appPrincipalNames(opts.slug);
  const policyName = `${names.operators}-policy`;

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

  // Both are read once: for the projects the operators reach today, and for the writes below. A policy of either name that grants to
  // another principal adds no project.
  const live = await readPolicy(auth, opts.organizationId, policyName);
  const named = await readPolicy(auth, opts.organizationId, `${names.operator}-policy`);
  const ownPolicy = named?.application_id === application.id ? named : undefined;
  const reached = [live?.group_id === group.id ? live : undefined, ownPolicy].flatMap((policy) =>
    policy ? operatorPolicyReach(policy.rules).projectIds : [],
  );
  const projectIds = [...new Set([...opts.projectIds, ...reached])];
  const dnsProjectIds = await resolveDnsProjectIds(auth, opts.dnsZone ?? '', opts.projectId);
  const rules = operatorRules({ projectIds, organizationId: opts.organizationId, dnsProjectIds });

  const written = await writeOperatorsPolicy(auth, opts.organizationId, { name: policyName, groupId: group.id, rules }, live);
  if (written.change === 'created') log(`  ${changeMark} Created IAM policy: ${policyName}`);
  else if (written.change === 'updated') log(`  ${changeMark} Replaced the rules of ${policyName} in place; its keys keep working`);
  else log(`  ${checkMark} ${policyName} grants what the code declares`);
  if (await addApplicationToGroup(opts.callerSecretKey, group, application.id)) log(`  ${changeMark} '${names.operator}' joined ${names.operators}`);

  // Deleted last: by now the group's policy grants to the application, and a key of it keeps its rights in between.
  if (ownPolicy) {
    await scwSend(auth, 'DELETE', `${IAM_BASE}/policies/${ownPolicy.id}`);
    log(`  ${changeMark} Deleted ${names.operator}-policy: ${policyName} grants to '${names.operator}' as a member`);
  } else if (named) {
    log(`  ${warningMark} '${names.operator}-policy' grants to another principal than '${names.operator}': fix it in the console.`);
  }
  const conditionDropped = written.conditionDropped || Boolean(ownPolicy?.rules.some((rule) => rule.condition));
  if (conditionDropped) log(`  ${warningMark} ${durableKeyRevokeNotice(names)}`);
  return { policy: written.change, applicationPolicyDeleted: Boolean(ownPolicy), conditionDropped };
}

/** The projects the operators' policy gives every product in. */
export function operatorPolicyReach(rules: readonly LiveRule[]): PolicyReach {
  return policyReach(rules, OPERATOR_PROJECT_PERMISSION_SETS);
}
