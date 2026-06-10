/**
 * Interactive bootstrap for the Pulumi/Scaleway infra. Safe to re-run.
 * Inspects the local Pulumi stack file to decide whether this is a fresh
 * fork or an existing setup, then offers a mode menu. Credentials live in
 * memory only — never written to disk. See infra/README.md.
 *
 * Usage: pnpm --filter infra bootstrap
 */
import { spawnSync } from 'node:child_process'
import { copyFileSync, existsSync, readFileSync, unlinkSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { confirm, select } from '@inquirer/prompts'
import pc from 'shared/cli-utils/colors'
import { printHeader } from 'shared/cli-utils/display'
import { checkMark, warningMark } from 'shared/console'
import { detectInterruptedApply, detectStackState, pickStackShort } from '../lib/bootstrap-stack-state.js'
import { runApplyMode } from './apply.js'
import { runBootstrapMode } from './resume.js'
import { runSecretsMode } from './secrets.js'
import type { BootstrapContext, Mode } from './shared.js'

const infraDir = resolve(dirname(fileURLToPath(import.meta.url)), '..')

function loadContext(): BootstrapContext {
  const stackShort = pickStackShort((name) => existsSync(resolve(infraDir, `Pulumi.${name}.yaml`)))
  const stackPath = resolve(infraDir, `Pulumi.${stackShort}.yaml`)
  const stackYaml = existsSync(stackPath) ? readFileSync(stackPath, 'utf8') : undefined
  const state = detectStackState({ yamlText: stackYaml })

  return {
    infraDir,
    stackShort,
    stackPath,
    stackYaml,
    state,
    hasCiKey: state === 'bootstrapped',
    applyBackupPath: resolve(infraDir, `Pulumi.${stackShort}.yaml.apply-backup`),
  }
}

printHeader('infra bootstrap')

if (spawnSync('pulumi', ['version'], { stdio: 'ignore' }).status !== 0) {
  console.error('✗ pulumi CLI not found. Install: brew install pulumi/tap/pulumi')
  process.exit(1)
}

const context = loadContext()

console.info(`State: ${context.state}${context.state === 'fresh' ? '' : ` (Pulumi.${context.stackShort}.yaml)`}\n`)

const interrupted = detectInterruptedApply({
  yamlText: context.stackYaml,
  backupExists: existsSync(context.applyBackupPath),
  backupPath: context.applyBackupPath,
})
if (interrupted) {
  console.warn(
    `${warningMark} ${pc.bold('Previous Apply infra change run was interrupted.')}\n` +
      `  Stack credentials in Pulumi.${context.stackShort}.yaml may still hold the (now-revoked) bootstrap key.\n` +
      `  Trace: ${interrupted.trace}\n`,
  )
  if (
    existsSync(context.applyBackupPath) &&
    (await confirm({ message: 'Restore the pre-apply stack config (CI key) from the backup now?', default: true }))
  ) {
    copyFileSync(context.applyBackupPath, context.stackPath)
    unlinkSync(context.applyBackupPath)
    console.info(`${checkMark} Stack config restored from backup. Re-run bootstrap to continue.`)
    process.exit(0)
  }
}

const mode: Mode =
  context.state === 'fresh'
    ? 'resume'
    : await select<Mode>({
        message: 'Existing config detected. How would you like to proceed?',
        default: 'resume',
        choices: [
          { name: 'Resume', value: 'resume', description: 'Idempotent re-run; refreshes config & GitHub secrets. Cannot apply changes to DB/VPC/PN (CI key is read-only there).' },
          { name: 'Rotate CI', value: 'rotate', description: 'Mint a fresh CI deploy key (existing one is deleted). Use after editing PROJECT_PERMISSION_SETS.' },
          { name: 'Apply infra change', value: 'apply', description: 'One-shot `pulumi up` with a bootstrap key for DB/VPC/PN changes; CI key is swapped out then restored.' },
          { name: 'Manage runtime secrets', value: 'secrets', description: 'List, set, rotate, or delete operator-managed runtime secrets in Scaleway Secret Manager.' },
          { name: 'Clean slate', value: 'clean', description: 'Print reset recipe and exit.' },
        ],
      })

if (mode === 'clean') {
  console.info(`\nSee infra/README.md (section "Clean slate") — start by: rm ${context.stackPath.replace(`${context.infraDir}/`, 'infra/')}`)
  process.exit(0)
}

if (mode === 'apply') {
  await runApplyMode(context)
  process.exit(0)
}

if (mode === 'secrets') {
  await runSecretsMode(context)
  process.exit(0)
}

await runBootstrapMode(context, mode)