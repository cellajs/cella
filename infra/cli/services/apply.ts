import { spawnSync } from 'node:child_process'
import { copyFileSync, unlinkSync } from 'node:fs'
import { confirm, input, password } from '@inquirer/prompts'
import pc from 'shared/cli-utils/colors'
import { checkMark, warningMark } from 'shared/console'
import { extractProjectId } from '../../lib/bootstrap-stack-state'
import { scwConfigPathNone } from '../../lib/bootstrap-scw-env'
import { infraDir } from '../../lib/paths'
import { runPulumiUpWithHint } from '../../lib/pulumi-up'
import type { InfraContext } from '../shared'

/** One-shot `pulumi up` using a freshly-supplied bootstrap key, with the CI
 *  key swapped out of stack config and restored afterwards. For applying
 *  changes to bootstrap-owned resources (DB / VPC / private network) without
 *  permanently widening CI permissions. */
export async function runApply(context: InfraContext): Promise<void> {
  if (context.state !== 'bootstrapped') {
    console.error(`${warningMark} "Apply infra change" requires a fully bootstrapped stack (state=${context.state}). Run Resume first.`)
    process.exit(1)
  }
  console.info(pc.dim('\nApply infra change: swap CI key out for a bootstrap key, run pulumi up, restore CI key.\n'))

  const passphrase = process.env.PULUMI_CONFIG_PASSPHRASE || (await password({ message: 'Pulumi passphrase' }))

  const projectId = (context.stackYaml && extractProjectId(context.stackYaml)) || ''
  if (!projectId) {
    console.error(`${warningMark} scaleway:projectId not found in stack config.`)
    process.exit(1)
  }

  const bootAccess =
    process.env.SCW_BOOTSTRAP_ACCESS_KEY ||
    (await input({ message: 'Bootstrap access key (IAMManager + write on the resource you are changing)', validate: (v) => !!v.trim() || '(required)' }))
  const bootSecret = process.env.SCW_BOOTSTRAP_SECRET_KEY || (await password({ message: 'Bootstrap secret key' }))

  const targetStack = await input({ message: 'Pulumi stack name', default: `organization/infra/${context.environment}` })

  if (!(await confirm({ message: `Swap stack creds to bootstrap key and run \`pulumi up\` on ${targetStack}?`, default: true }))) {
    console.info('Aborted; no changes made.')
    return
  }

  console.warn(
    `${pc.yellow(pc.bold('\u26A0  Keep this run in the foreground.'))} ${pc.dim('If it is interrupted, re-run bootstrap — it will offer to restore the CI key from the backup snapshot.')}`,
  )

  const applyEnv: NodeJS.ProcessEnv = {
    ...process.env,
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

  copyFileSync(context.stackPath, context.applyBackupPath)
  let swapped = false
  try {
    const startedAt = new Date().toISOString()
    const marker = spawnSync('pulumi', ['config', 'set', 'bootstrap:applyInProgress', startedAt, '--stack', targetStack], {
      cwd: infraDir,
      env: applyEnv,
      stdio: 'inherit',
    })
    const access = spawnSync('pulumi', ['config', 'set', '--secret', 'scaleway:accessKey', bootAccess, '--stack', targetStack], {
      cwd: infraDir,
      env: applyEnv,
      stdio: 'inherit',
    })
    const secret = spawnSync('pulumi', ['config', 'set', '--secret', 'scaleway:secretKey', bootSecret, '--stack', targetStack], {
      cwd: infraDir,
      env: applyEnv,
      stdio: 'inherit',
    })
    if (marker.status !== 0 || access.status !== 0 || secret.status !== 0) throw new Error('Failed to swap stack credentials')
    swapped = true
    while (true) {
      const code = await runPulumiUpWithHint(targetStack, infraDir, applyEnv)
      if (code === 0) break
      if (!(await confirm({ message: 'Retry pulumi up?', default: false }))) break
    }
  } finally {
    if (swapped) {
      console.info('\n→ Restoring CI key in stack config')
      copyFileSync(context.applyBackupPath, context.stackPath)
      console.info(`${checkMark} CI key restored.`)
    }
    try {
      unlinkSync(context.applyBackupPath)
    } catch {}
  }

  console.info(`\n${pc.dim('Reminder:')} revoke the bootstrap key now (Scaleway console → IAM → API keys).`)
}