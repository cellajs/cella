import {
  fetchGrantedRules,
  type IamAuth,
  listApiKeys,
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
 * Whether an EXTRA permission set on the VM key is benign. A read-only set is drift worth reporting but not a deploy-blocker: the VM policy is bootstrap-owned
 * (vm-iam.ts `ignoreChanges: ['rules']`), so failing on it would only wedge deploys until a manual bootstrap Apply.
 * Any non-read-only extra set is an escalation on the VM key and stays fatal until an operator strips it.
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
   * Exact CEL condition every secret-granting rule must carry (REQ-9, built by serviceKeyCondition / bootKeyCondition).
   * IAM conditions only narrow an allow, so one unconditioned secret rule on this app un-scopes the conditioned one. That is a FAILURE here, not a warning.
   */
  requiredSecretCondition?: string;
  /** A registry principal with no deployed VM. It keeps its policy but must hold ZERO API keys: any key on it is an unmonitored credential, a FAILURE. */
  dormant?: boolean;
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
  /** Access keys found on a dormant principal; empty unless `dormant` was requested. */
  dormantKeys: string[];
}

/**
 * Collect the union of permission set names granted to an application across all its IAM policies and rules, then verify it EQUALS the required set:
 * missing sets break secret hydration, and extra sets are privilege drift beyond the minimal VM profile.
 * With `requiredSecretCondition`, every secret-granting rule must additionally carry EXACTLY that condition, compared as a string.
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

  // Only a dormant principal is listed: a live one legitimately holds the current and previous generation's keys.
  const dormantKeys = opts.dormant
    ? (await listApiKeys(auth, organizationId, applicationId)).map((key) => key.access_key)
    : [];

  // Fatal: missing sets break hydration, a non-read-only extra set is an escalation, an un-scoped secret rule leaks secrets, a key on a dormant principal is an unmonitored credential. Extra read-only sets only warn (see isBenignExtraSet).
  const ok =
    missing.length === 0 &&
    extraFatal.length === 0 &&
    unconditionedSecretRules.length === 0 &&
    dormantKeys.length === 0;
  if (missing.length > 0) log(`✗ VM grant INCOMPLETE, missing: ${missing.join(', ')}`);
  if (extraFatal.length > 0) log(`✗ VM grant TOO BROAD, extra write/broad grant(s): ${extraFatal.join(', ')}`);
  for (const entry of unconditionedSecretRules)
    log(`✗ VM secret rule NOT path-scoped (union semantics un-scope the conditioned rule): ${entry}`);
  if (dormantKeys.length > 0)
    log(
      `✗ dormant principal holds ${dormantKeys.length} API key(s): a registry service outside the deployed set must have none: ${dormantKeys.join(', ')}`,
    );
  if (extraBenign.length > 0)
    log(
      `⚠ VM application has extra read-only grant(s) (benign drift; reconcile via a bootstrap "Apply infra change"): ${extraBenign.join(', ')}`,
    );
  if (ok) {
    const conditionNote = opts.requiredSecretCondition ? ', secret rules path-conditioned' : '';
    const dormantNote = opts.dormant ? ', dormant principal holds no key' : '';
    log(`✓ VM grant verified: required permission sets present, no escalation${conditionNote}${dormantNote}`);
  }
  return { ok, granted: [...granted].sort(), missing, extra, unconditionedSecretRules, dormantKeys };
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
  const dormant = argv.includes('--dormant');
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
    dormant,
  });
  if (!result.ok) {
    // Only fatal problems reach here: missing sets, a write or broad escalation, or an un-scoped secret rule. Benign read-only extras warn without setting ok=false.
    const problems = [
      result.missing.length > 0 ? `missing required permission sets: ${result.missing.join(', ')}` : '',
      result.extra.filter((set) => !set.endsWith('ReadOnly')).length > 0
        ? `granted EXTRA write/broad permission sets beyond the minimal VM profile: ${result.extra.filter((set) => !set.endsWith('ReadOnly')).join(', ')}`
        : '',
      result.unconditionedSecretRules.length > 0
        ? `secret rules without the required path condition: ${result.unconditionedSecretRules.join('; ')}`
        : '',
      result.dormantKeys.length > 0 ? `dormant principal holds API key(s): ${result.dormantKeys.join(', ')}` : '',
    ].filter(Boolean);
    throw new Error(
      `VM application ${applicationId ?? applicationName} ${problems.join('; ')}. ` +
        'The Pulumi-managed policy (infra/resources/vm-iam.ts) defines the exact grant. A CI deploy never rewrites policy rules: after a registry change run `pnpm infra` -> Apply infra change (a privileged up reconciles them), remove any manually-attached policy, and delete keys on dormant principals.',
    );
  }
}

if (isMain(import.meta.url)) {
  main().catch((err) => {
    process.stderr.write(`${err instanceof Error ? err.message : String(err)}\n`);
    process.exit(1);
  });
}
