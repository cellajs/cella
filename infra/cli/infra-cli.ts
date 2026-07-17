import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { select } from '@inquirer/prompts'
import { pc } from 'shared/cli-utils/colors';
import { printHeader } from 'shared/cli-utils/display'
import { warningMark } from 'shared/utils/console'
import { resolveProjectId } from '../lib/scaleway/bootstrap-scw-env'
import { detectComputeDeferred, detectStackState, pickStackShort } from '../lib/stack/bootstrap-stack-state'
import { infraDir } from '../lib/utils/paths'
import { runApply } from './actions/apply'
import { runPreview } from './actions/preview'
import { runResetDatabase } from './actions/reset-database'
import { runRotatePassphrase } from './actions/rotate-passphrase'
import { runSecrets } from './actions/secrets'
import { runSetup } from './actions/setup'
import { runUnlock } from './actions/unlock'
import type { CliMode, InfraContext } from './shared'

// Load backend/.env before the root fallback so infra child tasks share the app's
// local config. Existing environment variables keep precedence over both files.
for (const envFile of [resolve(infraDir, '..', 'backend', '.env'), resolve(infraDir, '..', '.env')]) {
  if (existsSync(envFile)) process.loadEnvFile(envFile)
}

async function loadContext(): Promise<InfraContext> {
  const environment = pickStackShort((name) => existsSync(resolve(infraDir, `Pulumi.${name}.yaml`)))
  const stackPath = resolve(infraDir, `Pulumi.${environment}.yaml`)
  const stackYaml = existsSync(stackPath) ? readFileSync(stackPath, 'utf8') : undefined
  const state = detectStackState({ yamlText: stackYaml })

  // Set the stack mode before importing `shared`, which reads APP_MODE during
  // module evaluation. The CLI-selected stack is authoritative for child tasks.
  process.env.APP_MODE = environment
  const { appConfig } = await import('shared')

  // Project id is required for every mode (it scopes all Scaleway API calls), so
  // resolve it once here from the env files loaded above and fail fast if absent.
  const projectId = resolveProjectId()
  if (!projectId) {
    throw new Error('SCW_PROJECT_ID is not set — add it to backend/.env before running the infra CLI.')
  }

  // Bootstrap creates the operator application and writes its id to backend/.env.
  // Bootstrapped stacks require it for operator access to CI-scoped buckets.
  const operatorApplicationId = process.env.SCW_OPERATOR_APPLICATION_ID?.trim()
  if (!operatorApplicationId && state === 'bootstrapped') {
    throw new Error('SCW_OPERATOR_APPLICATION_ID is not set — add it to backend/.env before running the infra CLI.')
  }

  return {
    environment,
    stackPath,
    stackYaml,
    state,
    hasCiKey: state === 'bootstrapped',
    appConfig,
    projectId,
  }
}

printHeader('infra cli')

if (spawnSync('pulumi', ['version'], { stdio: 'ignore' }).status !== 0) {
  console.error('✗ pulumi CLI not found. Install: brew install pulumi/tap/pulumi')
  process.exit(1)
}

const context = await loadContext()

// Fail on an apex-hosted frontend before any prompt or provisioning step: the
// LB module cannot serve the app at the zone apex (deriveInfra throws the same
// error deep inside `pulumi up`, but by then half a deploy has run).
{
  const { frontendApexIssue } = await import('../lib/naming')
  const apexIssue = frontendApexIssue(context.appConfig)
  if (apexIssue) {
    console.error(`\u2717 ${apexIssue}`)
    process.exit(1)
  }
}

console.info(`State: ${context.state}${context.state === 'fresh' ? '' : ` (Pulumi.${context.environment}.yaml)`}\n`)

const deferredSince = detectComputeDeferred(context.stackYaml)
if (deferredSince) {
  console.warn(
    `${warningMark} ${pc.bold('Compute is currently deferred')} ${pc.dim(`(bootstrap:computeDeferred = ${deferredSince})`)}.\n` +
      `  A fresh provision sets this so VMs are not declared until images exist;\n` +
      `  it clears automatically on the next successful provisioning \`pulumi up\`.\n`,
  )
}

const mode: CliMode =
  context.state === 'fresh'
    ? 'resume'
    : await select<CliMode>({
        message: 'Existing config detected. How would you like to proceed?',
        default: 'resume',
        choices: [
          { name: 'Resume', value: 'resume', description: 'Verify & sync config + GitHub secrets with the CI key; self-heals missing keys. Read-only on DB/VPC/PN — cannot change protected infra.' },
          { name: 'Rotate keys', value: 'rotate', description: 'Mint fresh CI deploy and VM reader keys. Use after editing the CI policy permission sets.' },
          { name: 'Rotate passphrase', value: 'rotate-passphrase', description: 'Re-encrypt stack state with a freshly generated Pulumi passphrase and sync it to GitHub. Needs the current passphrase; no bootstrap key.' },
          { name: 'Apply infra change', value: 'apply', description: 'Privileged converge: one-shot `pulumi up` with a bootstrap key for DB/VPC/PN changes the CI key cannot. No refresh (buckets are CI-scoped); offers to prune state entries whose live object is already gone.' },
          { name: 'Preview', value: 'preview', description: 'Read-only `pulumi preview`. Validates auth & shows drift; makes no changes.' },
          { name: 'Manage runtime secrets', value: 'secrets', description: 'List, set, rotate, or delete operator-managed runtime secrets in Scaleway Secret Manager.' },
          { name: 'Reset database', value: 'reset-database', description: 'DESTRUCTIVE: delete + recreate the app database empty (backup first, roles re-granted), then migrate/seed on the serial console. Pre-production, or with services quiesced.' },
          { name: 'Unlock', value: 'unlock', description: 'Clear a stale stack lock left by an interrupted apply/deploy. Use only when no run is actually in progress.' },
        ],
      })


if (mode === 'apply') {
  await runApply(context)
  process.exit(0)
}

if (mode === 'rotate-passphrase') {
  await runRotatePassphrase(context)
  process.exit(0)
}

if (mode === 'preview') {
  await runPreview(context)
  process.exit(0)
}

if (mode === 'secrets') {
  await runSecrets(context)
  process.exit(0)
}

if (mode === 'reset-database') {
  await runResetDatabase(context)
  process.exit(0)
}

if (mode === 'unlock') {
  await runUnlock(context)
  process.exit(0)
}

await runSetup(context, mode)
