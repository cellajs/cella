import { spawnSync } from 'node:child_process'
import { stackExportHasResource } from './adopt-orphaned-policy'
import { operatorManagedRuntimeSecrets } from '../runtime-secrets'
import { createSecretManagerClient } from './scaleway-secret-manager'
import { errorMessage } from '../utils/errors'

/** Pulumi type token for `@pulumiverse/scaleway` secret containers (`pulumi import`). */
const SECRET_TYPE = 'scaleway:secrets/secret:Secret'

export type SecretAdoptOutcome =
  | 'in-state' // already managed by Pulumi; nothing to do
  | 'imported' // existed in Scaleway, now adopted into state
  | 'absent' // not in Scaleway either; `pulumi up` will create it
  | 'unavailable' // could not list Secret Manager containers (skipped; up will report the real error)

export interface AdoptOrphanedSecretsOptions {
  /** Fully-qualified Pulumi stack, e.g. `organization/infra/production`. */
  stack: string
  /** Working directory containing the Pulumi program. */
  cwd: string
  /** Environment for the pulumi subprocesses (creds + passphrase). */
  env: NodeJS.ProcessEnv
  /** Bootstrap secret key (Secret Manager read; the env creds provide state write). */
  secretKey: string
  /** Scaleway project the secrets live in. */
  projectId: string
  /** Scaleway region, e.g. `nl-ams`. */
  region: string
  /** Secret folder path, e.g. `/raak-production/`. */
  path: string
  /** Injected for tests; defaults to console.info. */
  log?: (msg: string) => void
}

export interface AdoptOrphanedSecretsResult {
  /** Per-secret outcome, keyed by Scaleway secret name. */
  outcomes: Record<string, SecretAdoptOutcome>
  /** Names of containers imported in this run. */
  imported: string[]
  /** True when the live secret list could not be queried (adoption skipped). */
  unavailable: boolean
}

/**
 * Import any operator secret container that exists in Scaleway but not in Pulumi
 * state, as `secret-<secretName>` (matching `resources/secrets.ts`). Idempotent
 * and safe to call before every apply-mode `pulumi up`.
 */
export async function adoptOrphanedSecrets(opts: AdoptOrphanedSecretsOptions): Promise<AdoptOrphanedSecretsResult> {
  const log = opts.log ?? ((msg: string) => console.info(msg))
  const result: AdoptOrphanedSecretsResult = { outcomes: {}, imported: [], unavailable: false }

  if (operatorManagedRuntimeSecrets.length === 0) return result

  // 1. Export state once: which operator containers are already managed? A
  //    malformed/empty export (e.g. an uninitialised stack) means "none in
  //    state", so every operator container becomes a candidate for adoption.
  const exported = spawnSync('pulumi', ['stack', 'export', '--stack', opts.stack], {
    cwd: opts.cwd,
    env: opts.env,
    encoding: 'utf8',
  })
  const stateJson = exported.status === 0 ? exported.stdout : ''

  const missing = operatorManagedRuntimeSecrets.filter((secret) => {
    const inState = stackExportHasResource(stateJson, SECRET_TYPE, `secret-${secret.secretName}`)
    if (inState) result.outcomes[secret.secretName] = 'in-state'
    return !inState
  })
  if (missing.length === 0) return result

  // 2. List live containers once (only when something is missing). A read
  //    failure is non-fatal; skip adoption and let `pulumi up` report the real
  //    error rather than masking it.
  let liveByName: Map<string, { id: string; region?: string }>
  try {
    const client = createSecretManagerClient({ secretKey: opts.secretKey, region: opts.region, projectId: opts.projectId })
    const secrets = await client.listSecrets(opts.path)
    liveByName = new Map(secrets.map((secret) => [secret.name, { id: secret.id, region: secret.region }]))
  } catch (error) {
    log(`  (skipping secret adoption — could not list Secret Manager containers: ${errorMessage(error)})`)
    result.unavailable = true
    for (const secret of missing) result.outcomes[secret.secretName] = 'unavailable'
    return result
  }

  // 3. Adopt each orphan (present in Scaleway, missing from state) so the next
  //    `pulumi up` updates rather than creates it.
  for (const secret of missing) {
    const live = liveByName.get(secret.secretName)
    if (!live) {
      result.outcomes[secret.secretName] = 'absent'
      continue
    }
    // Scaleway Secret `.id` form is `region/uuid`; the REST list returns the
    // bare uuid plus a separate region, so reassemble it for `pulumi import`.
    const importId = `${live.region ?? opts.region}/${live.id}`
    const pulumiName = `secret-${secret.secretName}`
    log(`\n→ Adopting existing operator secret ${secret.secretName} (${importId}) into Pulumi state before \`pulumi up\``)
    const imported = spawnSync(
      'pulumi',
      ['import', SECRET_TYPE, pulumiName, importId, '--stack', opts.stack, '--yes', '--non-interactive'],
      { cwd: opts.cwd, env: opts.env, stdio: 'inherit' },
    )
    if (imported.status !== 0) {
      throw new Error(`pulumi import of ${pulumiName} (${importId}) failed — adopt it manually then re-run.`)
    }
    result.outcomes[secret.secretName] = 'imported'
    result.imported.push(secret.secretName)
  }

  return result
}
