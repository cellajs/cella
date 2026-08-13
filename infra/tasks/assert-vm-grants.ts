import {
  fetchGrantedRules,
  type IamAuth,
  resolveApplicationIdByName,
  resolveOrganizationIdViaProject,
} from '../lib/scaleway/iam-client';
import { type FetchLike, resolveFetch } from '../lib/utils/fetch-like';
import { isMain } from '../lib/utils/is-main';
import { getFlag } from './args';

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
  projectId: string;
  /** Resolved from projectId when omitted. */
  organizationId?: string;
  /** Permission sets the VM must hold (the caller derives the per-principal set). */
  required: readonly string[];
  /**
   * Exact CEL condition every secret-granting rule must carry (REQ-9, built
   * by serviceKeyCondition / bootKeyCondition). IAM conditions only narrow an allow, so a
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

/**
 * Collect the union of permission set names granted to an application across all
 * its IAM policies and their rules, then verify it EQUALS the required set:
 * missing sets break secret hydration, extra sets are privilege drift beyond the
 * minimal VM profile (a write grant on this key widens every VM's blast radius).
 * With `requiredSecretCondition`, additionally verify every secret-granting rule
 * carries EXACTLY that condition (string equality against the shared builder).
 */
export async function assertVmGrants(opts: AssertVmGrantsOptions): Promise<AssertVmGrantsResult> {
  const auth: IamAuth = { secretKey: opts.secretKey, fetchImpl: resolveFetch(opts.fetchImpl) };
  const log = opts.log ?? ((msg) => console.info(msg));
  const required = opts.required;
  const organizationId = opts.organizationId ?? (await resolveOrganizationIdViaProject(auth, opts.projectId));

  let applicationId = opts.applicationId;
  if (!applicationId && opts.applicationName) {
    applicationId = (await resolveApplicationIdByName(auth, organizationId, opts.applicationName)) ?? undefined;
    if (!applicationId)
      throw new Error(`IAM application '${opts.applicationName}' not found in organization ${organizationId}`);
  }
  if (!applicationId) throw new Error('assertVmGrants: provide applicationId or applicationName');

  const rules = await fetchGrantedRules(auth, organizationId, applicationId);
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
  if (missing.length > 0) log(`✗ VM grant INCOMPLETE — missing: ${missing.join(', ')}`);
  if (extraFatal.length > 0) log(`✗ VM grant TOO BROAD — extra write/broad grant(s): ${extraFatal.join(', ')}`);
  for (const entry of unconditionedSecretRules)
    log(`✗ VM secret rule NOT path-scoped (union semantics un-scope the conditioned rule): ${entry}`);
  if (extraBenign.length > 0)
    log(
      `⚠ VM application has extra read-only grant(s) (benign drift; reconcile via a bootstrap "Apply infra change"): ${extraBenign.join(', ')}`,
    );
  if (ok) {
    const conditionNote = opts.requiredSecretCondition ? ', secret rules path-conditioned' : '';
    log(`✓ VM grant verified — required permission sets present, no escalation${conditionNote}`);
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

  const requiredSecretCondition = getFlag(argv, '--secret-condition') ?? undefined;
  const requiredSetsCsv = getFlag(argv, '--required-sets');
  const required = (requiredSetsCsv ?? '')
    .split(',')
    .map((set) => set.trim())
    .filter(Boolean);
  if (required.length === 0) throw new Error('Required: --required-sets <csv of permission sets>');
  const result = await assertVmGrants({
    secretKey,
    applicationId,
    applicationName,
    projectId,
    organizationId,
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
      `VM application ${applicationId ?? applicationName} ${problems.join('; ')}. ` +
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
