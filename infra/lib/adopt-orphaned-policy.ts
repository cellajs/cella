/**
 * Adopt a pre-existing Scaleway IAM policy into Pulumi state.
 *
 * The VM reader grant is a Pulumi-managed `iam.Policy` (`resources/vm-iam.ts`),
 * but the original bootstrap created it out-of-band via the IAM REST API. After
 * that flow switched to `managePolicy: false`, the live policy was never in
 * Pulumi state — so every `pulumi up` tries to *create* it and deadlocks:
 *   - locally (bootstrap key): HTTP 409 "resource already exists"
 *   - in CI (read-only key):   "insufficient permissions: write policy"
 *
 * Neither caller can create it, and only a bootstrap key can write Pulumi state,
 * so the fix is a one-time `pulumi import`. This helper performs that import
 * automatically and idempotently from the "Apply infra change" flow: it is a
 * no-op once the policy is in state (or absent in Scaleway), so re-running is
 * safe.
 */
import { spawnSync } from 'node:child_process'
import { findPolicyIdByName } from './scaleway-iam'

/** Pulumi type token for `@pulumiverse/scaleway` IAM policies (`pulumi import`). */
const POLICY_TYPE = 'scaleway:iam/policy:Policy'

/**
 * Pure: does a `pulumi stack export` JSON already contain a resource of the
 * given Pulumi type whose URN ends in `::<name>`? A malformed/empty export
 * (e.g. an uninitialised stack) is treated as "not present".
 */
export function stackExportHasResource(stackExportJson: string, type: string, name: string): boolean {
  let parsed: { deployment?: { resources?: Array<{ urn?: string; type?: string }> } }
  try {
    parsed = JSON.parse(stackExportJson)
  } catch {
    return false
  }
  return (parsed.deployment?.resources ?? []).some(
    (r) => r.type === type && typeof r.urn === 'string' && r.urn.endsWith(`::${name}`),
  )
}

export type AdoptOutcome =
  | 'in-state' // already managed by Pulumi — nothing to do
  | 'imported' // existed in Scaleway, now adopted into state
  | 'absent' // not in Scaleway either — `pulumi up` will create it
  | 'unavailable' // could not query Scaleway IAM (skipped; up will report the real error)

export interface AdoptOrphanedPolicyOptions {
  /** Fully-qualified Pulumi stack, e.g. `organization/infra/production`. */
  stack: string
  /** Working directory containing the Pulumi program. */
  cwd: string
  /** Environment for the pulumi subprocesses (creds + passphrase). */
  env: NodeJS.ProcessEnv
  /** Pulumi logical resource name, e.g. `vm-reader-policy`. */
  pulumiName: string
  /** Live Scaleway policy name, e.g. `cella-vm-reader-policy`. */
  policyName: string
  /** Bootstrap secret key (IAM read; the env creds provide state write). */
  secretKey: string
  /** Organization the policy lives in. */
  organizationId: string
  /** Injected for tests; defaults to console.info. */
  log?: (msg: string) => void
}

/**
 * Import `policyName` into the stack as `pulumiName` when it exists in Scaleway
 * but not in Pulumi state. Idempotent and safe to call before every apply-mode
 * `pulumi up`.
 */
export async function adoptOrphanedPolicy(opts: AdoptOrphanedPolicyOptions): Promise<AdoptOutcome> {
  const log = opts.log ?? ((msg: string) => console.info(msg))

  // 1. Already in Pulumi state? Then `pulumi up` will reconcile it normally.
  const exported = spawnSync('pulumi', ['stack', 'export', '--stack', opts.stack], {
    cwd: opts.cwd,
    env: opts.env,
    encoding: 'utf8',
  })
  if (exported.status === 0 && stackExportHasResource(exported.stdout, POLICY_TYPE, opts.pulumiName)) {
    return 'in-state'
  }

  // 2. Does the policy already exist in Scaleway (the orphan we must adopt)?
  let policyId: string | undefined
  try {
    policyId = await findPolicyIdByName(opts.secretKey, opts.organizationId, opts.policyName)
  } catch (error) {
    log(`  (skipping policy adoption — could not query Scaleway IAM: ${(error as Error).message})`)
    return 'unavailable'
  }
  if (!policyId) return 'absent'

  // 3. Adopt it into state so the next `pulumi up` updates rather than creates.
  log(`\n→ Adopting existing IAM policy ${opts.policyName} (${policyId}) into Pulumi state before \`pulumi up\``)
  const imported = spawnSync(
    'pulumi',
    ['import', POLICY_TYPE, opts.pulumiName, policyId, '--stack', opts.stack, '--yes', '--non-interactive'],
    { cwd: opts.cwd, env: opts.env, stdio: 'inherit' },
  )
  if (imported.status !== 0) {
    throw new Error(`pulumi import of ${opts.pulumiName} (${policyId}) failed — adopt it manually then re-run.`)
  }
  return 'imported'
}
