import { VM_PROJECT_PERMISSION_SETS } from '../lib/scaleway/permissions';
import { scwFetch } from '../lib/scaleway/scw-fetch';
import { type FetchLike, resolveFetch } from '../lib/utils/fetch-like';
import { isMain } from '../lib/utils/is-main';
import { getFlag } from './args';

const IAM_BASE = 'https://api.scaleway.com/iam/v1alpha1';
const ACCOUNT_BASE = 'https://api.scaleway.com/account/v3';

/** Permission sets that decrypt or enumerate secret values/metadata. */
const SECRET_PERMISSION_SETS = new Set([
  'SecretManagerSecretAccess',
  'SecretManagerReadOnly',
  'SecretManagerFullAccess',
]);

/**
 * Whether an EXTRA (unexpected) permission set on the VM key is benign. A
 * read-only set is drift worth surfacing but not a deploy-blocker. The VM
 * policy is bootstrap-owned (CI can't reconcile it; see vm-iam.ts
 * `ignoreChanges: ['rules']`), so failing on it would only wedge deploys until
 * a manual bootstrap Apply, without reducing any real risk. Any NON-read-only
 * extra set (a write/broad grant) is a genuine escalation on the VM key and
 * stays fatal: an operator must strip it (bootstrap Apply / remove a
 * manually-attached policy).
 */
const isBenignExtraSet = (set: string): boolean => set.endsWith('ReadOnly');

export interface AssertVmGrantsOptions {
  secretKey: string;
  /** Either an explicit id, or a name to resolve via IAM list-applications. */
  applicationId?: string;
  applicationName?: string;
  /** Legacy name tried when `applicationName` resolves to nothing (pre-migration stacks). */
  fallbackApplicationName?: string;
  projectId: string;
  /** Resolved from projectId when omitted. */
  organizationId?: string;
  /** Permission sets the VM must hold. Defaults to the canonical VM set. */
  required?: readonly string[];
  /**
   * Exact CEL condition every secret-granting rule must carry (REQ-9,
   * built by vmSecretCondition). IAM conditions only narrow an allow, so a
   * single unconditioned secret rule on this app silently un-scopes the
   * conditioned one. That is a FAILURE here, not a warning.
   */
  requiredSecretCondition?: string;
  /** Injected for tests; defaults to global fetch. */
  fetchImpl?: FetchLike;
  /** Injected for tests; defaults to console.info. */
  log?: (msg: string) => void;
}

export interface AssertVmGrantsResult {
  ok: boolean;
  granted: string[];
  missing: string[];
  /** Permission sets granted beyond the required set: privilege drift, fails the check. */
  extra: string[];
  /** Secret-grant rules whose condition deviates from the required one (union semantics: ONE unconditioned rule un-scopes everything). */
  unconditionedSecretRules: string[];
}

function scwGet<T>(fetchImpl: FetchLike, secretKey: string, url: string): Promise<T> {
  return scwFetch<T>({ secretKey, fetchImpl }, 'GET', url);
}

async function resolveOrgId(fetchImpl: FetchLike, secretKey: string, projectId: string): Promise<string> {
  const project = await scwGet<{ organization_id?: string }>(
    fetchImpl,
    secretKey,
    `${ACCOUNT_BASE}/projects/${projectId}`,
  );
  if (!project?.organization_id) {
    throw new Error(`Could not resolve organization_id from project ${projectId}. Pass --organization-id explicitly.`);
  }
  return project.organization_id;
}

/** Resolve an IAM application's id from its (unique) name. Returns null when not found. */
export async function resolveApplicationIdByName(
  fetchImpl: FetchLike,
  secretKey: string,
  organizationId: string,
  name: string,
): Promise<string | null> {
  const { applications = [] } = await scwGet<{ applications?: Array<{ id: string; name: string }> }>(
    fetchImpl,
    secretKey,
    `${IAM_BASE}/applications?name=${encodeURIComponent(name)}&organization_id=${organizationId}&page_size=20`,
  );
  return applications.find((app) => app.name === name)?.id ?? null;
}

interface IamPolicy {
  id: string;
  name: string;
  /** Principal bindings: a policy targets exactly one of application / user / group. */
  application_id?: string;
  user_id?: string;
  group_id?: string;
}

/**
 * Every policy in the organization, paging past `page_size`. The list endpoint's
 * `application_id` filter is unreliable (Scaleway returns all policies regardless),
 * so callers filter by principal client-side against the `application_id` /
 * `group_id` each list item carries.
 */
async function listOrganizationPolicies(
  fetchImpl: FetchLike,
  secretKey: string,
  organizationId: string,
): Promise<IamPolicy[]> {
  const pageSize = 100;
  const all: IamPolicy[] = [];
  for (let page = 1; page <= 100; page++) {
    const { policies = [], total_count = 0 } = await scwGet<{ policies?: IamPolicy[]; total_count?: number }>(
      fetchImpl,
      secretKey,
      `${IAM_BASE}/policies?organization_id=${organizationId}&page=${page}&page_size=${pageSize}`,
    );
    all.push(...policies);
    if (policies.length === 0 || all.length >= total_count) break;
  }
  return all;
}

/** Group ids the application belongs to; a group's policies grant the app too. */
async function fetchApplicationGroupIds(
  fetchImpl: FetchLike,
  secretKey: string,
  organizationId: string,
  applicationId: string,
): Promise<Set<string>> {
  const ids = new Set<string>();
  for (let page = 1; page <= 100; page++) {
    const { groups = [], total_count = 0 } = await scwGet<{
      groups?: Array<{ id: string; application_ids?: string[] }>;
      total_count?: number;
    }>(fetchImpl, secretKey, `${IAM_BASE}/groups?organization_id=${organizationId}&page=${page}&page_size=100`);
    for (const group of groups) if ((group.application_ids ?? []).includes(applicationId)) ids.add(group.id);
    if (groups.length === 0 || (page - 1) * 100 + groups.length >= total_count) break;
  }
  return ids;
}

/**
 * Union of permission set names actually granted to an application: the rules of
 * every policy whose principal is the application itself or a group it belongs to.
 * Policies bound to other principals (other applications, users, or unrelated
 * groups) are excluded, so a shared organization's policies do not leak in.
 */
export async function fetchGrantedPermissionSets(
  fetchImpl: FetchLike,
  secretKey: string,
  organizationId: string,
  applicationId: string,
): Promise<string[]> {
  const groupIds = await fetchApplicationGroupIds(fetchImpl, secretKey, organizationId, applicationId);
  const policies = await listOrganizationPolicies(fetchImpl, secretKey, organizationId);
  const bound = policies.filter(
    (policy) =>
      policy.application_id === applicationId || (policy.group_id !== undefined && groupIds.has(policy.group_id)),
  );
  const granted = new Set<string>();
  for (const policy of bound) {
    const { rules = [] } = await scwGet<{ rules?: Array<{ permission_set_names?: string[] }> }>(
      fetchImpl,
      secretKey,
      `${IAM_BASE}/rules?policy_id=${policy.id}&page_size=100`,
    );
    for (const rule of rules) {
      for (const name of rule.permission_set_names ?? []) granted.add(name);
    }
  }
  return [...granted];
}

/**
 * Sorted union of permission set names granted to an application resolved by
 * name. Returns null when the application does not exist. Convenience wrapper
 * (resolve org → resolve app id → collect sets) for callers that only have the
 * deterministic `<slug>-<suffix>` name (e.g. the CLI's CI-policy drift check).
 */
export async function fetchAppPermissionSetsByName(opts: {
  secretKey: string;
  projectId: string;
  applicationName: string;
  organizationId?: string;
  fetchImpl?: FetchLike;
}): Promise<string[] | null> {
  const fetchImpl = resolveFetch(opts.fetchImpl);
  const organizationId = opts.organizationId ?? (await resolveOrgId(fetchImpl, opts.secretKey, opts.projectId));
  const applicationId = await resolveApplicationIdByName(
    fetchImpl,
    opts.secretKey,
    organizationId,
    opts.applicationName,
  );
  if (!applicationId) return null;
  return (await fetchGrantedPermissionSets(fetchImpl, opts.secretKey, organizationId, applicationId)).sort();
}

/** Every rule (permission sets + condition) granted to an application across its policies. */
export async function fetchGrantedRules(
  fetchImpl: FetchLike,
  secretKey: string,
  organizationId: string,
  applicationId: string,
): Promise<Array<{ policyName: string; permissionSets: string[]; condition: string }>> {
  const groupIds = await fetchApplicationGroupIds(fetchImpl, secretKey, organizationId, applicationId);
  const policies = await listOrganizationPolicies(fetchImpl, secretKey, organizationId);
  const bound = policies.filter(
    (policy) =>
      policy.application_id === applicationId || (policy.group_id !== undefined && groupIds.has(policy.group_id)),
  );
  const collected: Array<{ policyName: string; permissionSets: string[]; condition: string }> = [];
  for (const policy of bound) {
    const { rules = [] } = await scwGet<{ rules?: Array<{ permission_set_names?: string[]; condition?: string }> }>(
      fetchImpl,
      secretKey,
      `${IAM_BASE}/rules?policy_id=${policy.id}&page_size=100`,
    );
    for (const rule of rules) {
      collected.push({
        policyName: policy.name,
        permissionSets: rule.permission_set_names ?? [],
        condition: rule.condition ?? '',
      });
    }
  }
  return collected;
}

/**
 * Collect the union of permission set names granted to an application across all
 * its IAM policies and their rules, then verify it EQUALS the required set:
 * missing sets break secret hydration, extra sets are privilege drift beyond the
 * minimal VM profile (a write grant on this key widens every VM's blast radius).
 * With `requiredSecretCondition`, additionally verify every secret-granting rule
 * carries EXACTLY that condition (string equality against the shared builder).
 */
export async function assertVmGrants(opts: AssertVmGrantsOptions): Promise<AssertVmGrantsResult> {
  const fetchImpl = resolveFetch(opts.fetchImpl);
  const log = opts.log ?? ((msg) => console.info(msg));
  const required = opts.required ?? VM_PROJECT_PERMISSION_SETS;
  const organizationId = opts.organizationId ?? (await resolveOrgId(fetchImpl, opts.secretKey, opts.projectId));

  let applicationId = opts.applicationId;
  if (!applicationId && opts.applicationName) {
    applicationId =
      (await resolveApplicationIdByName(fetchImpl, opts.secretKey, organizationId, opts.applicationName)) ?? undefined;
    // Per-mode names (`<slug>-<mode>-vm-reader`) are canonical; a pre-migration
    // stack still runs on the legacy `<slug>-vm-reader` app, so fall back by
    // stripping the mode segment to keep the deploy running.
    if (!applicationId && opts.fallbackApplicationName) {
      applicationId =
        (await resolveApplicationIdByName(fetchImpl, opts.secretKey, organizationId, opts.fallbackApplicationName)) ??
        undefined;
      if (applicationId)
        log(
          `~ IAM application '${opts.applicationName}' not found; verified legacy '${opts.fallbackApplicationName}' instead (run "Migrate IAM model")`,
        );
    }
    if (!applicationId)
      throw new Error(`IAM application '${opts.applicationName}' not found in organization ${organizationId}`);
  }
  if (!applicationId) throw new Error('assertVmGrants: provide applicationId or applicationName');

  const rules = await fetchGrantedRules(fetchImpl, opts.secretKey, organizationId, applicationId);
  const granted = new Set(rules.flatMap((rule) => rule.permissionSets));

  const requiredSet = new Set(required);
  const missing = required.filter((r) => !granted.has(r));
  const extra = [...granted].filter((g) => !requiredSet.has(g)).sort();
  const extraBenign = extra.filter(isBenignExtraSet);
  const extraFatal = extra.filter((set) => !isBenignExtraSet(set));

  const unconditionedSecretRules: string[] = [];
  if (opts.requiredSecretCondition) {
    for (const rule of rules) {
      if (!rule.permissionSets.some((set) => SECRET_PERMISSION_SETS.has(set))) continue;
      if (rule.condition !== opts.requiredSecretCondition) {
        unconditionedSecretRules.push(
          `${rule.policyName} [${rule.permissionSets.join(', ')}] condition='${rule.condition || '(none)'}'`,
        );
      }
    }
  }

  // Missing sets break hydration; a NON-read-only extra set is an escalation;
  // an un-scoped secret rule leaks secrets. All three are fatal. Extra
  // READ-ONLY sets are surfaced as a warning but do not block (see isBenignExtraSet).
  const ok = missing.length === 0 && extraFatal.length === 0 && unconditionedSecretRules.length === 0;
  if (missing.length > 0) log(`✗ VM reader grant INCOMPLETE — missing: ${missing.join(', ')}`);
  if (extraFatal.length > 0) log(`✗ VM reader grant TOO BROAD — extra write/broad grant(s): ${extraFatal.join(', ')}`);
  for (const entry of unconditionedSecretRules)
    log(`✗ VM secret rule NOT path-scoped (union semantics un-scope the conditioned rule): ${entry}`);
  if (extraBenign.length > 0)
    log(
      `⚠ VM reader has extra read-only grant(s) (benign drift; reconcile via a bootstrap "Apply infra change" / "Migrate IAM model"): ${extraBenign.join(', ')}`,
    );
  if (ok) {
    const conditionNote = opts.requiredSecretCondition ? ', secret rules path-conditioned' : '';
    log(`✓ VM reader grant verified — required permission sets present, no escalation${conditionNote}`);
  }
  return { ok, granted: [...granted].sort(), missing, extra, unconditionedSecretRules };
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

  const fallbackApplicationName = getFlag(argv, '--fallback-application-name') ?? undefined;
  const requiredSecretCondition = getFlag(argv, '--secret-condition') ?? undefined;
  const requiredSetsCsv = getFlag(argv, '--required-sets');
  const required = requiredSetsCsv
    ? requiredSetsCsv
        .split(',')
        .map((set) => set.trim())
        .filter(Boolean)
    : undefined;
  const result = await assertVmGrants({
    secretKey,
    applicationId,
    applicationName,
    projectId,
    organizationId,
    fallbackApplicationName,
    requiredSecretCondition,
    required,
  });
  if (!result.ok) {
    // Only fatal problems reach here (ok is false): missing sets, a write/broad
    // escalation, or an un-scoped secret rule. Benign read-only extras were
    // warned about but never set ok=false.
    const problems = [
      result.missing.length > 0 ? `missing required permission sets: ${result.missing.join(', ')}` : '',
      result.extra.filter((set) => !set.endsWith('ReadOnly')).length > 0
        ? `granted EXTRA write/broad permission sets beyond the minimal VM profile: ${result.extra.filter((set) => !set.endsWith('ReadOnly')).join(', ')}`
        : '',
      result.unconditionedSecretRules.length > 0
        ? `secret rules without the required path condition: ${result.unconditionedSecretRules.join('; ')}`
        : '',
    ].filter(Boolean);
    throw new Error(
      `VM reader application ${applicationId ?? applicationName} ${problems.join('; ')}. ` +
        'The Pulumi-managed policy (infra/resources/vm-iam.ts) defines the exact grant; check that `pulumi up` succeeded and remove any manually-attached policies.',
    );
  }
}

if (isMain(import.meta.url)) {
  main().catch((err) => {
    process.stderr.write(`${err instanceof Error ? err.message : String(err)}\n`);
    process.exit(1);
  });
}
