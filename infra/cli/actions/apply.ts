import { spawnSync } from 'node:child_process'
import { confirm, input } from '@inquirer/prompts'
import pc from 'shared/cli-utils/colors'
import { warningMark } from 'shared/console'
import { adoptOrphanedPolicy } from '../../lib/adopt-orphaned-policy'
import { adoptOrphanedSecrets } from '../../lib/adopt-orphaned-secrets'
import { buildProviderEnv } from '../../lib/bootstrap-scw-env'
import { acquireLock, controlActor, lockKey, makeControlClient, releaseLock, stateBucket } from '../../lib/control-store'
import { infraDir } from '../../lib/paths'
import { maskedSecret } from '../prompts/masked-secret'
import { runPulumiUpWithHint } from '../../lib/pulumi-up'
import { resolveOrganizationId } from '../../lib/scaleway-iam'
import { deriveInfra } from '../../lib/naming'
import { envOr, type InfraContext, resolveVerifiedPassphrase } from '../shared'

/** One-shot `pulumi up` using a freshly-supplied bootstrap key passed via
 *  SCW_* env. For applying changes to bootstrap-owned resources (DB / VPC /
 *  private network) that the read-only CI key cannot make, without
 *  permanently widening CI permissions. Runs against an already-bootstrapped
 *  stack with live compute, so it must NOT defer compute (no computeDeferred
 *  marker) — that is reserved for the fresh-provision flow in setup.ts. */
export async function runApply(context: InfraContext): Promise<void> {
  if (context.state !== 'bootstrapped') {
    console.error(`${warningMark} "Apply infra change" requires a fully bootstrapped stack (state=${context.state}). Run Resume first.`)
    process.exit(1)
  }
  console.info(pc.dim('\nApply infra change: run pulumi up with a bootstrap key (supplied via env).\n'))

  const passphrase = await resolveVerifiedPassphrase(context.stackYaml)

  const { projectId } = context

  const bootAccess = await envOr('SCW_BOOTSTRAP_ACCESS_KEY', () =>
    input({ message: 'Scaleway bootstrap access key', validate: (v) => !!v.trim() || '(required)' }),
  )
  const bootSecret = await envOr('SCW_BOOTSTRAP_SECRET_KEY', () => maskedSecret({ message: 'Scaleway bootstrap secret key' }))

  const targetStack = await input({ message: 'Pulumi stack name', default: `organization/infra/${context.environment}` })

  if (!(await confirm({ message: `Swap stack creds to bootstrap key and run \`pulumi up\` on ${targetStack}?`, default: true }))) {
    console.info('Aborted; no changes made.')
    return
  }

  console.warn(
    `${pc.yellow(pc.bold('\u26A0  Keep this run in the foreground.'))} ${pc.dim('If it is interrupted, re-run "Apply infra change" to converge — `pulumi up` is idempotent.')}`,
  )

  const applyEnv = buildProviderEnv(infraDir, { accessKey: bootAccess, secretKey: bootSecret, projectId, passphrase })

  const { appConfig } = context
  const loginUrl = `s3://${appConfig.slug}-pulumi-state?endpoint=s3.${appConfig.s3.region}.scw.cloud&region=${appConfig.s3.region}`
  spawnSync('pulumi', ['login', loginUrl], { cwd: infraDir, env: applyEnv, stdio: 'inherit' })
  spawnSync('pulumi', ['stack', 'select', targetStack], { cwd: infraDir, env: applyEnv, stdio: 'ignore' })

  // Acquire the stack lock so a second operator (or CI) cannot mutate this stack
  // concurrently. Built on the control object's S3 bucket using the bootstrap
  // key just supplied. Released at every exit point below; a dead run's lock
  // self-expires after the TTL, or is cleared via the CLI "Unlock" action.
  const lockS3 = await makeControlClient(appConfig.s3.region, bootAccess, bootSecret)
  const lockBucket = stateBucket(appConfig.slug)
  const lockObjectKey = lockKey(targetStack)
  const lockOwner = controlActor()
  const releaseStackLock = () =>
    releaseLock(lockS3, lockBucket, lockObjectKey, lockOwner).catch((e) => console.warn(`${warningMark} failed to release stack lock: ${(e as Error).message}`))
  const lock = await acquireLock(lockS3, lockBucket, lockObjectKey, { owner: lockOwner, operation: 'apply', ttlMs: 30 * 60_000 })
  if (!lock.acquired) {
    console.error(`${warningMark} Stack ${targetStack} is locked by ${pc.cyan(lock.held.owner)} (operation: ${lock.held.operation}, since ${lock.held.acquiredAt}).`)
    console.error(`  If that run is dead, clear it with the CLI "Unlock" action or remove s3://${lockBucket}/${lockObjectKey}.`)
    process.exit(1)
  }

  // Resolve the organization id from the project so (a) it is set explicitly in
  // the env for the IAM policy create/update inside `pulumi up` (matching CI),
  // and (b) we can look up an existing IAM policy to adopt below. Non-fatal: if
  // it cannot be resolved the program still derives it from the project at
  // runtime, and policy adoption is skipped.
  let organizationId: string | undefined
  try {
    organizationId = await resolveOrganizationId(bootSecret, projectId)
    applyEnv.SCW_DEFAULT_ORGANIZATION_ID = organizationId
  } catch (error) {
    console.warn(`${warningMark} Could not resolve organization id (${(error as Error).message}); continuing without it.`)
  }

  // The VM reader IAM policy is Pulumi-managed but the original bootstrap created
  // it out-of-band, so it can be missing from Pulumi state — which makes
  // `pulumi up` try to create it and fail (409 locally / no IAM write in CI).
  // Adopt the pre-existing policy into state first; idempotent once imported.
  if (organizationId) {
    try {
      const policyName = deriveInfra(appConfig).naming.resource('vm-reader-policy')
      await adoptOrphanedPolicy({
        stack: targetStack,
        cwd: infraDir,
        env: applyEnv,
        pulumiName: 'vm-reader-policy',
        policyName,
        secretKey: bootSecret,
        organizationId,
      })
    } catch (error) {
      console.warn(`${warningMark} ${(error as Error).message}`)
    }
  }

  // Operator-managed Secret Manager containers can exist in Scaleway but be
  // missing from Pulumi state (e.g. after a state rebuild/restore), which makes
  // `pulumi up` try to create them and fail with "cannot have same secret name
  // in same path". Adopt any such orphans into state first; idempotent once
  // imported. Supersedes the manual OPERATOR_SECRET_IMPORTS env hook.
  try {
    await adoptOrphanedSecrets({
      stack: targetStack,
      cwd: infraDir,
      env: applyEnv,
      secretKey: bootSecret,
      projectId,
      region: appConfig.s3.region,
      path: `/${appConfig.slug}-${context.environment}/`,
    })
  } catch (error) {
    console.warn(`${warningMark} ${(error as Error).message}`)
  }

  // Reconcile gen/sha into the local Pulumi config from live state before
  // `pulumi up`, so a stale committed Pulumi.<stack>.yaml can't converge compute
  // back to an old generation (destroying newer live VMs). CI does this in the
  // deploy workflow; the operator apply path must too. Best-effort by design —
  // it skips cleanly when there is no compute output yet — but a hard failure
  // (bad creds/passphrase) aborts rather than risk applying against stale config.
  console.info(pc.dim('\n→ Reconciling rollout config from live state (sync-rollout-config)…'))
  const sync = spawnSync('pnpm', ['--filter', 'infra', 'sync-rollout-config', '--stack', targetStack], { cwd: infraDir, env: applyEnv, stdio: 'inherit' })
  if (sync.status !== 0) {
    await releaseStackLock()
    console.error(`${warningMark} sync-rollout-config failed (exit ${sync.status}). Aborting to avoid applying against stale gen/sha.`)
    process.exit(sync.status ?? 1)
  }

  // No compute-deferred marker and no stack-file backup here: the stack is
  // already bootstrapped with live compute, the bootstrap key reaches
  // `pulumi up` via SCW_* env (applyEnv) rather than stack config, and
  // `pulumi up` is idempotent — an interrupted run is recovered simply by
  // re-running it. Deferring compute (as the fresh-provision flow does) would
  // tear down the running VMs/LB on an established stack.
  while (true) {
    const code = await runPulumiUpWithHint(targetStack, infraDir, applyEnv)
    if (code === 0) break
    if (!(await confirm({ message: 'Retry pulumi up?', default: false }))) break
  }

  await releaseStackLock()
  console.info(`\n${pc.dim('Reminder:')} revoke the bootstrap key now (Scaleway console → IAM → API keys).`)
}