import { spawnSync } from 'node:child_process'
import { confirm } from '@inquirer/prompts'
import { adoptOrphanedPolicy } from '../../lib/scaleway/adopt-orphaned-policy'
import { adoptOrphanedSecrets } from '../../lib/scaleway/adopt-orphaned-secrets'
import { buildProviderEnv } from '../../lib/scaleway/bootstrap-scw-env'
import { errorMessage } from '../../lib/utils/errors'
import { infraDir } from '../../lib/utils/paths'
import { maskedSecret } from '../prompts/masked-secret'
import { parseOrphanedDeletes, pruneOrphanedDeletes, runPulumiUpWithHint } from '../../lib/stack/pulumi-up'
import { resolveOrganizationId } from '../../lib/scaleway/scaleway-iam'
import { deriveInfra } from '../../lib/naming'
import { acquireStackLockOrExit, envOr, type InfraContext, promptRequiredInput, promptStackName, pulumiLoginAndSelect, resolveVerifiedPassphrase } from '../shared'
import { pc, warningMark } from '../../lib/utils/cli-output'

/** One-shot `pulumi up` using a freshly-supplied bootstrap key passed via
 *  SCW_* env. For applying changes to bootstrap-owned resources (DB / VPC /
 *  private network) that the read-only CI key cannot make, without
 *  permanently widening CI permissions. Runs against an already-bootstrapped
 *  stack with live compute, so it must NOT defer compute (no computeDeferred
 *  marker), which is reserved for the fresh-provision flow in setup.ts. */
export async function runApply(context: InfraContext): Promise<void> {
  if (context.state !== 'bootstrapped') {
    console.error(`${warningMark} "Apply infra change" requires a fully bootstrapped stack (state=${context.state}). Run Resume first.`)
    process.exit(1)
  }
  console.info(pc.dim('\nApply infra change: run pulumi up with a bootstrap key (supplied via env).\n'))

  const passphrase = await resolveVerifiedPassphrase(context.stackYaml)

  const { projectId } = context

  const bootAccess = await envOr('SCW_BOOTSTRAP_ACCESS_KEY', () => promptRequiredInput('Scaleway bootstrap access key'))
  const bootSecret = await envOr('SCW_BOOTSTRAP_SECRET_KEY', () => maskedSecret({ message: 'Scaleway bootstrap secret key' }))

  const targetStack = await promptStackName(context)

  if (!(await confirm({ message: `Swap stack creds to bootstrap key and run \`pulumi up\` on ${targetStack}?`, default: true }))) {
    console.info('Aborted; no changes made.')
    return
  }

  console.warn(
    `${pc.yellow(pc.bold('\u26A0  Keep this run in the foreground.'))} ${pc.dim('If it is interrupted, re-run "Apply infra change" to converge.')}`,
  )

  const applyEnv = buildProviderEnv(infraDir, { accessKey: bootAccess, secretKey: bootSecret, projectId, passphrase })

  const { appConfig } = context
  pulumiLoginAndSelect(infraDir, applyEnv, appConfig, targetStack)

  // Lock the stack through the control bucket to exclude concurrent operators and CI.
  // Exit paths release it; abandoned locks expire or can be cleared with "Unlock".
  const stackLock = await acquireStackLockOrExit({ appConfig, accessKey: bootAccess, secretKey: bootSecret, stack: targetStack, operation: 'apply' })

  // Resolve the organization ID for Pulumi's IAM environment and orphan-policy adoption.
  // Failure is non-fatal because the program can derive it at runtime.
  let organizationId: string | undefined
  try {
    organizationId = await resolveOrganizationId(bootSecret, projectId)
    applyEnv.SCW_DEFAULT_ORGANIZATION_ID = organizationId
  } catch (error) {
    console.warn(`${warningMark} Could not resolve organization id (${errorMessage(error)}); continuing without it.`)
  }

  // Adopt a bootstrap-created VM reader policy that exists outside Pulumi state.
  // This prevents a duplicate-create conflict and is idempotent after import.
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
      console.warn(`${warningMark} ${errorMessage(error)}`)
    }
  }

  // Adopt operator-secret containers missing from restored Pulumi state before `up`.
  // This prevents duplicate-name failures during Pulumi reconciliation.
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
    console.warn(`${warningMark} ${errorMessage(error)}`)
  }

  // Reconcile generation and SHA from live state so stale local config cannot replace newer VMs.
  // Missing compute output is harmless; credential or passphrase failures abort the apply.
  console.info(pc.dim('\n→ Reconciling rollout config from live state (sync-rollout-config)…'))
  const sync = spawnSync('pnpm', ['--filter', 'infra', 'sync-rollout-config', '--stack', targetStack], { cwd: infraDir, env: applyEnv, stdio: 'inherit' })
  if (sync.status !== 0) {
    await stackLock.release()
    console.error(`${warningMark} sync-rollout-config failed (exit ${sync.status}). Aborting to avoid applying against stale gen/sha.`)
    process.exit(sync.status ?? 1)
  }

  // Established stacks apply compute directly and recover from interruption by rerunning `up`.
  // Fresh-provision deferral here would tear down the existing VMs and load balancer.
  while (true) {
    const { code, output } = await runPulumiUpWithHint(targetStack, infraDir, applyEnv)
    if (code === 0) break

    // A delete 404 leaves only stale Pulumi state, so offer to prune it and reconverge.
    const orphans = parseOrphanedDeletes(output)
    if (orphans.length > 0) {
      console.warn(`\n${warningMark} ${orphans.length} resource(s) failed to delete because the live object no longer exists:`)
      for (const urn of orphans) console.warn(`  ${pc.dim('-')} ${urn}`)
      if (await confirm({ message: `Prune ${orphans.length === 1 ? 'this stale entry' : 'these stale entries'} from state and retry pulumi up?`, default: true })) {
        pruneOrphanedDeletes(orphans, targetStack, infraDir, applyEnv)
        continue
      }
    }

    if (!(await confirm({ message: 'Retry pulumi up?', default: false }))) break
  }

  await stackLock.release()
  console.info(`\n${pc.dim('Reminder:')} revoke the bootstrap key now (Scaleway console → IAM → API keys).`)
}
