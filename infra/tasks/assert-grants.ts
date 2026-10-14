import { actionCommand } from '../lib/operator-actions';
import { fetchGrantedRules, type IamAuth, resolveApplicationIdByName, resolveOrganizationIdViaProject } from '../lib/scaleway/iam-client';
import { ruleConditions } from '../lib/scaleway/secret-paths';
import { type FetchLike, resolveFetch } from '../lib/utils/fetch-like';
import { runIfMain } from '../lib/utils/is-main';
import { getFlag } from './args';

/** Permission sets that decrypt or enumerate secret values/metadata. */
const SECRET_PERMISSION_SETS = new Set(['SecretManagerSecretAccess', 'SecretManagerReadOnly', 'SecretManagerFullAccess']);

/**
 * Whether an EXTRA permission set on the VM key is benign. A read-only set is drift worth reporting but not a deploy-blocker: the machine policy is
 * written at Owner moments only, so failing on it would only wedge deploys until one.
 * Any non-read-only extra set is an escalation on the VM key and stays fatal until an operator strips it.
 */
const isBenignExtraSet = (set: string): boolean => set.endsWith('ReadOnly');

export interface AssertGrantsOptions {
  secretKey: string;
  /** Either an explicit id, or a name to resolve via IAM list-applications. */
  applicationId?: string;
  applicationName?: string;
  projectId: string;
  /** Resolved from projectId when omitted. */
  organizationId?: string;
  /** Permission sets the VM must hold (the caller derives the per-principal set). */
  required: readonly string[];
  /**
   * Exact CEL condition the secret-granting rules must carry together (REQ-9, built by serviceKeyCondition / bootKeyCondition). A condition too
   * large for one rule is spread over several (`ruleConditions`): every secret-granting rule must carry one of those parts, and every part must be carried.
   * IAM conditions only narrow an allow, so one unconditioned secret rule on this app un-scopes the conditioned ones. That is a FAILURE here, not a warning.
   */
  requiredSecretCondition?: string;
  /** Every rule must be scoped to exactly this project: an organization-wide rule (a console edit's default) reaches every project, a FAILURE. */
  requiredProjectId?: string;
  /** Injected for tests; defaults to global fetch. */
  fetchImpl?: FetchLike;
  /** Injected for tests; defaults to console.info. */
  log?: (msg: string) => void;
}

export interface AssertGrantsResult {
  ok: boolean;
  granted: string[];
  missing: string[];
  /** Permission sets granted beyond the required set: privilege drift, fails the check. */
  extra: string[];
  /** Secret-grant rules whose condition deviates from the required one (union semantics: ONE unconditioned rule un-scopes everything). */
  unconditionedSecretRules: string[];
  /** Parts of the required condition that no secret-granting rule carries: the principal cannot read the secrets under those folders. */
  missingSecretConditions: string[];
  /** Rules whose scope is not exactly the required project; empty unless `requiredProjectId` was given. */
  misscopedRules: string[];
}

/**
 * Collect the union of permission set names granted to an application across all its IAM policies and rules, then verify it EQUALS the required set:
 * missing sets break secret hydration, and extra sets are privilege drift beyond the minimal VM profile.
 * With `requiredSecretCondition`, every secret-granting rule must additionally carry EXACTLY one part of that condition, compared as a string, and every part must be carried.
 */
export async function assertGrants(opts: AssertGrantsOptions): Promise<AssertGrantsResult> {
  const auth: IamAuth = { secretKey: opts.secretKey, fetchImpl: resolveFetch(opts.fetchImpl) };
  const log = opts.log ?? ((msg) => console.info(msg));
  const required = opts.required;
  const organizationId = opts.organizationId ?? (await resolveOrganizationIdViaProject(auth, opts.projectId));

  let applicationId = opts.applicationId;
  if (!applicationId && opts.applicationName) {
    applicationId = (await resolveApplicationIdByName(auth, organizationId, opts.applicationName)) ?? undefined;
    if (!applicationId) throw new Error(`IAM application '${opts.applicationName}' not found in organization ${organizationId}`);
  }
  if (!applicationId) throw new Error('assertGrants: provide applicationId or applicationName');

  const rules = await fetchGrantedRules(auth, organizationId, applicationId);
  const granted = new Set(rules.flatMap((rule) => rule.permissionSets));

  const requiredSet = new Set(required);
  const missing = required.filter((r) => !granted.has(r));
  const extra = [...granted].filter((g) => !requiredSet.has(g)).sort();
  const extraBenign = extra.filter(isBenignExtraSet);
  const extraFatal = extra.filter((set) => !isBenignExtraSet(set));

  const unconditionedSecretRules: string[] = [];
  const missingSecretConditions: string[] = [];
  if (opts.requiredSecretCondition) {
    const parts = ruleConditions(opts.requiredSecretCondition);
    const carried = new Set<string>();
    for (const rule of rules) {
      if (!rule.permissionSets.some((set) => SECRET_PERMISSION_SETS.has(set))) continue;
      if (parts.includes(rule.condition)) carried.add(rule.condition);
      else unconditionedSecretRules.push(`${rule.policyName} [${rule.permissionSets.join(', ')}] condition='${rule.condition || '(none)'}'`);
    }
    missingSecretConditions.push(...parts.filter((part) => !carried.has(part)));
  }

  const misscopedRules: string[] = [];
  if (opts.requiredProjectId) {
    for (const rule of rules) {
      const scope = rule.organizationId ? `organization ${rule.organizationId}` : `projects [${(rule.projectIds ?? []).join(', ')}]`;
      const projectScoped = !rule.organizationId && rule.projectIds?.length === 1 && rule.projectIds[0] === opts.requiredProjectId;
      if (!projectScoped) misscopedRules.push(`${rule.policyName} [${rule.permissionSets.join(', ')}] scope=${scope}`);
    }
  }

  // Fatal: missing sets break hydration, a non-read-only extra set is an escalation, an un-scoped secret rule leaks secrets, a missing part of the path condition breaks hydration too. Extra read-only sets only warn (see isBenignExtraSet).
  const ok =
    missing.length === 0 &&
    extraFatal.length === 0 &&
    unconditionedSecretRules.length === 0 &&
    missingSecretConditions.length === 0 &&
    misscopedRules.length === 0;
  if (missing.length > 0) log(`✗ VM grant INCOMPLETE, missing: ${missing.join(', ')}`);
  if (extraFatal.length > 0) log(`✗ VM grant TOO BROAD, extra write/broad grant(s): ${extraFatal.join(', ')}`);
  for (const entry of unconditionedSecretRules) log(`✗ VM secret rule NOT path-scoped (union semantics un-scope the conditioned rule): ${entry}`);
  for (const entry of missingSecretConditions) log(`✗ VM secret rule MISSING, no rule carries this part of the path condition: ${entry}`);
  for (const entry of misscopedRules) log(`✗ VM rule NOT scoped to the project (reaches every project of the organization): ${entry}`);
  if (extraBenign.length > 0)
    log(`⚠ VM application has extra read-only grant(s) (benign drift; reconcile with \`${actionCommand('identity')}\`): ${extraBenign.join(', ')}`);
  if (ok) {
    const conditionNote = opts.requiredSecretCondition ? ', secret rules path-conditioned' : '';
    const scopeNote = opts.requiredProjectId ? ', project-scoped' : '';
    log(`✓ grant verified: required permission sets present, no escalation${conditionNote}${scopeNote}`);
  }
  return { ok, granted: [...granted].sort(), missing, extra, unconditionedSecretRules, missingSecretConditions, misscopedRules };
}

// Standalone entry point.
export async function main(argv = process.argv.slice(2)): Promise<void> {
  const secretKey = process.env.SCW_SECRET_KEY;
  const applicationId = getFlag(argv, '--application-id') ?? process.env.VM_APPLICATION_ID;
  const applicationName = getFlag(argv, '--application-name') ?? process.env.VM_APPLICATION_NAME;
  const projectId = getFlag(argv, '--project-id') ?? process.env.SCW_DEFAULT_PROJECT_ID;
  const organizationId = getFlag(argv, '--organization-id') ?? process.env.SCW_DEFAULT_ORGANIZATION_ID;

  if (!secretKey || !(applicationId || applicationName) || !projectId) {
    throw new Error('Required: SCW_SECRET_KEY, --application-id or --application-name, --project-id');
  }

  const requiredSecretCondition = getFlag(argv, '--secret-condition') ?? undefined;
  // The deploy key holds an organization-scoped IAM read; machine identities pass --project-scope.
  const requiredProjectId = argv.includes('--project-scope') ? projectId : undefined;
  const requiredSetsCsv = getFlag(argv, '--required-sets');
  const required = (requiredSetsCsv ?? '')
    .split(',')
    .map((set) => set.trim())
    .filter(Boolean);
  if (required.length === 0) throw new Error('Required: --required-sets <csv of permission sets>');
  const result = await assertGrants({
    secretKey,
    applicationId,
    applicationName,
    projectId,
    organizationId,
    requiredSecretCondition,
    required,
    requiredProjectId,
  });
  if (!result.ok) {
    // Only fatal problems reach here: missing sets, a write or broad escalation, an un-scoped secret rule, or a part of the path condition no rule carries. Benign read-only extras warn without setting ok=false.
    const problems = [
      result.missing.length > 0 ? `missing required permission sets: ${result.missing.join(', ')}` : '',
      result.extra.filter((set) => !set.endsWith('ReadOnly')).length > 0
        ? `granted EXTRA write/broad permission sets beyond the minimal VM profile: ${result.extra.filter((set) => !set.endsWith('ReadOnly')).join(', ')}`
        : '',
      result.unconditionedSecretRules.length > 0
        ? `secret rules without the required path condition: ${result.unconditionedSecretRules.join('; ')}`
        : '',
      result.missingSecretConditions.length > 0 ? `no secret rule carries: ${result.missingSecretConditions.join('; ')}` : '',
      result.misscopedRules.length > 0 ? `rules not scoped to the project: ${result.misscopedRules.join('; ')}` : '',
    ].filter(Boolean);
    throw new Error(
      `VM application ${applicationId ?? applicationName} ${problems.join('; ')}. ` +
        `The machine policy (infra/lib/scaleway/machine-policies.ts) defines the exact grant, and a deploy never writes it: run \`${actionCommand('identity')}\` with your Owner API key, and remove any manually-attached policy.`,
    );
  }
}

runIfMain(import.meta.url, main);
