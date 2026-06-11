import { spawnSync } from 'node:child_process'
import { copyFileSync, unlinkSync } from 'node:fs'
import { confirm, input, password } from '@inquirer/prompts'
import pc from 'shared/cli-utils/colors'
import { checkMark, warningMark } from 'shared/console'
import { extractProjectId } from '../../lib/bootstrap-stack-state'
import { scwConfigPathNone } from '../../lib/bootstrap-scw-env'
import { infraDir } from '../../lib/paths'
import { runPulumiUpWithHint } from '../../lib/pulumi-up'
import { type InfraContext, resolveVerifiedPassphrase } from '../shared'

/** One-shot `pulumi up` using a freshly-supplied bootstrap key passed via
 *  SCW_* env. For applying changes to bootstrap-owned resources (DB / VPC /
 *  private network) that the read-only CI key cannot make, without
 *  permanently widening CI permissions. */
export async function runApply(context: InfraContext): Promise<void> {
  if (context.state !== 'bootstrapped') {
    console.error(`${warningMark} "Apply infra change" requires a fully bootstrapped stack (state=${context.state}). Run Resume first.`)
    process.exit(1)
  }
  console.info(pc.dim('\nApply infra change: run pulumi up with a bootstrap key (supplied via env), then clear the apply marker.\n'))

  const passphrase = await resolveVerifiedPassphrase(context.stackYaml)

  const projectId =
    process.env.SCW_DEFAULT_PROJECT_ID || process.env.SCW_PROJECT_ID || (context.stackYaml && extractProjectId(context.stackYaml)) || ''
  if (!projectId) {
    console.error(
      `${warningMark} Scaleway project ID not found. Set SCW_DEFAULT_PROJECT_ID (or, for legacy stacks, scaleway:projectId in stack config).`,
    )
    process.exit(1)
  }

  const bootAccess =
    process.env.SCW_BOOTSTRAP_ACCESS_KEY ||
    (await input({ message: 'Scaleway bootstrap access key (needs IAMManager + write on the resource you are changing)', validate: (v) => !!v.trim() || '(required)' }))
  const bootSecret = process.env.SCW_BOOTSTRAP_SECRET_KEY || (await password({ message: 'Scaleway bootstrap secret key' }))

  const targetStack = await input({ message: 'Pulumi stack name', default: `organization/infra/${context.environment}` })

  if (!(await confirm({ message: `Swap stack creds to bootstrap key and run \`pulumi up\` on ${targetStack}?`, default: true }))) {
    console.info('Aborted; no changes made.')
    return
  }

  console.warn(
    `${pc.yellow(pc.bold('\u26A0  Keep this run in the foreground.'))} ${pc.dim('If it is interrupted, re-run bootstrap — it will offer to clear the apply marker from the backup snapshot.')}`,
  )

  const applyEnv: NodeJS.ProcessEnv = {
    ...process.env,
    SCW_ACCESS_KEY: bootAccess,
    SCW_SECRET_KEY: bootSecret,
    SCW_DEFAULT_PROJECT_ID: projectId,
    SCW_PROJECT_ID: projectId,
    AWS_ACCESS_KEY_ID: bootAccess,
    AWS_SECRET_ACCESS_KEY: bootSecret,
    PULUMI_CONFIG_PASSPHRASE: passphrase,
    SCW_CONFIG_PATH: scwConfigPathNone(infraDir),
    SCW_PROFILE: '',
  }

  const { appConfig } = context
  const loginUrl = `s3://${appConfig.slug}-pulumi-state?endpoint=s3.${appConfig.s3.region}.scw.cloud&region=${appConfig.s3.region}`
  spawnSync('pulumi', ['login', loginUrl], { cwd: infraDir, env: applyEnv, stdio: 'inherit' })
  spawnSync('pulumi', ['stack', 'select', targetStack], { cwd: infraDir, env: applyEnv, stdio: 'ignore' })

  // Back up the stack file before setting the apply marker so an interrupted
  // run is recoverable (infra-cli.ts offers to restore on the next launch).
  // The bootstrap key reaches `pulumi up` via SCW_* env (applyEnv above), not
  // stack config, so there is no credential to swap out or scrub afterwards —
  // the backup/restore now only brackets the transient applyInProgress marker.
  copyFileSync(context.stackPath, context.applyBackupPath)
  let markerSet = false
  try {
    const startedAt = new Date().toISOString()
    const marker = spawnSync('pulumi', ['config', 'set', 'bootstrap:applyInProgress', startedAt, '--stack', targetStack], {
      cwd: infraDir,
      env: applyEnv,
      stdio: 'inherit',
    })
    if (marker.status !== 0) throw new Error('Failed to set apply-in-progress marker')
    markerSet = true
    while (true) {
      const code = await runPulumiUpWithHint(targetStack, infraDir, applyEnv)
      if (code === 0) break
      if (!(await confirm({ message: 'Retry pulumi up?', default: false }))) break
    }
  } finally {
    if (markerSet) {
      console.info('\n→ Clearing apply-in-progress marker')
      copyFileSync(context.applyBackupPath, context.stackPath)
      console.info(`${checkMark} Marker cleared.`)
    }
    try {
      unlinkSync(context.applyBackupPath)
    } catch {}
  }

  console.info(`\n${pc.dim('Reminder:')} revoke the bootstrap key now (Scaleway console → IAM → API keys).`)
}