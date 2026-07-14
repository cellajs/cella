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
import { runSecrets } from './actions/secrets'
import { runSetup } from './actions/setup'
import { runUnlock } from './actions/unlock'
import type { CliMode, InfraContext } from './shared'

// Load infra-only repo envs (e.g. SCW_PROJECT_ID) so they reach the CLI and the
// child tasks it spawns. The canonical location is backend/.env (same file the
// backend loads and what backend/.env.example documents); the repo-root .env is
// a fallback for forks that keep one there. Real environment variables still win
// (loadEnvFile never overrides an already-set var), so CI's explicit SCW_* take
// precedence, and backend/.env wins over the root fallback by loading first.
for (const envFile of [resolve(infraDir, '..', 'backend', '.env'), resolve(infraDir, '..', '.env')]) {
  if (existsSync(envFile)) process.loadEnvFile(envFile)
}

async function loadContext(): Promise<InfraContext> {
  const environment = pickStackShort((name) => existsSync(resolve(infraDir, `Pulumi.${name}.yaml`)))
  const stackPath = resolve(infraDir, `Pulumi.${environment}.yaml`)
  const stackYaml = existsSync(stackPath) ? readFileSync(stackPath, 'utf8') : undefined
  const state = detectStackState({ yamlText: stackYaml })

  // Resolve appConfig once, keyed to this stack's environment. `shared` reads
  // APP_MODE at module-eval time, so it must be set before the first import.
  // The CLI is authoritative here (force-assign, don't defer to a stray shell
  // APP_MODE): this keeps context.appConfig, the spawned child tasks, and the
  // Pulumi program's stack/APP_MODE consistency guard all on this one mode.
  process.env.APP_MODE = environment
  const { appConfig } = await import('shared')

  // Project id is required for every mode (it scopes all Scaleway API calls), so
  // resolve it once here from the env files loaded above and fail fast if absent.
  const projectId = resolveProjectId()
  if (!projectId) {
    throw new Error('SCW_PROJECT_ID is not set — add it to backend/.env before running the infra CLI.')
  }

  // Operator application id: required like SCW_PROJECT_ID once bootstrapped:
  // granted full S3 on the CI-scoped buckets (storage.ts) so operator keys can
  // read/refresh them. On a fresh stack it doesn't exist yet; bootstrap creates
  // the app and writes the id into backend/.env, so only enforce it afterwards.
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
          { name: 'Apply infra change', value: 'apply', description: 'Privileged converge: one-shot `pulumi up` with a bootstrap key for DB/VPC/PN changes the CI key cannot. No refresh (buckets are CI-scoped).' },
          { name: 'Preview', value: 'preview', description: 'Read-only `pulumi preview`. Validates auth & shows drift; makes no changes.' },
          { name: 'Manage runtime secrets', value: 'secrets', description: 'List, set, rotate, or delete operator-managed runtime secrets in Scaleway Secret Manager.' },
          { name: 'Unlock', value: 'unlock', description: 'Clear a stale stack lock left by an interrupted apply/deploy. Use only when no run is actually in progress.' },
        ],
      })


if (mode === 'apply') {
  await runApply(context)
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

if (mode === 'unlock') {
  await runUnlock(context)
  process.exit(0)
}

await runSetup(context, mode)
