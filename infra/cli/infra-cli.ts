import { spawnSync } from 'node:child_process'
import { chmodSync, existsSync, readFileSync, statSync } from 'node:fs'
import { resolve } from 'node:path'
import { select } from '@inquirer/prompts'
import { resolveProjectId } from '../lib/scaleway/bootstrap-scw-env'
import { detectComputeDeferred, detectStackState, pickStackShort } from '../lib/stack/bootstrap-stack-state'
import { infraDir } from '../lib/utils/paths'
import { runApply } from './actions/apply'
import { runPreview } from './actions/preview'
import { runResetDatabase } from './actions/reset-database'
import { runExposeDatabase, runUnexposeDatabase } from './actions/db-exposure'
import { runSeedDatabase } from './actions/seed-db'
import { runRotatePassphrase } from './actions/rotate-passphrase'
import { runSecrets } from './actions/secrets'
import { runSetup } from './actions/setup'
import { runUnlock } from './actions/unlock'
import { autoAcceptDefaults, nonInteractive } from './shared'
import type { CliMode, InfraContext } from './shared'
import { failWithHint, pc, printHeader, warningMark } from '../lib/utils/cli-output'

// Load backend/.env before the root fallback so infra child tasks share the app's
// local config. Existing environment variables keep precedence over both files.
for (const envFile of [resolve(infraDir, '..', 'backend', '.env'), resolve(infraDir, '..', '.env')]) {
  if (existsSync(envFile)) process.loadEnvFile(envFile)
}

/** Parse a dotenv-style file into key/value pairs (no interpolation). */
function parseEnvFile(path: string): Record<string, string> {
  const out: Record<string, string> = {}
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    const match = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/)
    if (!match) continue
    out[match[1]!] = (match[2] ?? '').replace(/^['"]|['"]$/g, '')
  }
  return out
}

/**
 * The target mode. INFRA_MODE (or --mode) selects it explicitly, including a
 * fresh stack that has no Pulumi.<mode>.yaml yet; otherwise the first existing
 * stack file wins (production before staging), matching prior behavior. With
 * no stack file at all, an interactive fresh install asks, defaulting to
 * staging: validate the cheap disposable target first, promote to production
 * later by re-running with `--mode production`.
 * A mode-scoped env file `infra/.env.<mode>` OVERRIDES the ambient env: it
 * carries that mode's credentials/project so a staging run cannot silently
 * inherit production values from backend/.env.
 */
async function resolveMode(): Promise<'production' | 'staging'> {
  const flagIndex = process.argv.indexOf('--mode')
  const raw = (flagIndex >= 0 ? process.argv[flagIndex + 1] : undefined) ?? process.env.INFRA_MODE
  if (raw) {
    if (raw !== 'production' && raw !== 'staging') throw new Error(`INFRA_MODE must be 'production' or 'staging' (got '${raw}')`)
    return raw
  }
  const anyStackExists = (['production', 'staging'] as const).some((name) => existsSync(resolve(infraDir, `Pulumi.${name}.yaml`)))
  if (!anyStackExists && !autoAcceptDefaults()) {
    return select<'production' | 'staging'>({
      message: 'Fresh install. Which mode do you want to set up?',
      default: 'staging',
      choices: [
        { name: 'staging (recommended)', value: 'staging', description: 'Cheapest footprint, seedable, disposable. Validate the full pipeline here first.' },
        { name: 'production', value: 'production', description: 'The real thing. You can also promote later by re-running with --mode production.' },
      ],
    })
  }
  return pickStackShort((name) => existsSync(resolve(infraDir, `Pulumi.${name}.yaml`)))
}

async function loadContext(): Promise<InfraContext> {
  const environment = await resolveMode()
  const modeEnvPath = resolve(infraDir, `.env.${environment}`)
  if (existsSync(modeEnvPath)) {
    // These files hold a live secret key + Pulumi passphrase; group/other read
    // bits hand them to every local user, backup agent, and sync client.
    const mode = statSync(modeEnvPath).mode
    if ((mode & 0o077) !== 0) {
      chmodSync(modeEnvPath, 0o600)
      console.info(pc.dim(`Tightened ${modeEnvPath} to 600 (was ${(mode & 0o777).toString(8)}): it carries live credentials.`))
    }
    for (const [key, value] of Object.entries(parseEnvFile(modeEnvPath))) process.env[key] = value
    console.info(pc.dim(`Loaded ${modeEnvPath} (mode-scoped env, overrides ambient values)`))
  }
  const stackPath = resolve(infraDir, `Pulumi.${environment}.yaml`)
  const stackYaml = existsSync(stackPath) ? readFileSync(stackPath, 'utf8') : undefined
  const state = detectStackState({ yamlText: stackYaml })

  // Set the stack mode before loading the config, which reads APP_MODE during
  // module evaluation. The CLI-selected stack is authoritative for child tasks.
  process.env.APP_MODE = environment
  const { loadEngineConfig } = await import('../config/engine-config')
  const appConfig = await loadEngineConfig()

  // Project id scopes all Scaleway API calls, so resolve it once here from the
  // env files loaded above. A fresh install may not have one yet: the setup
  // wizard offers to pick or create the project with the bootstrap key and
  // writes SCW_PROJECT_ID to backend/.env itself. Every other state fails fast.
  const projectId = resolveProjectId()
  if (!projectId && state !== 'fresh') {
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
    projectId: projectId ?? '',
  }
}

printHeader('infra cli')

if (spawnSync('pulumi', ['version'], { stdio: 'ignore' }).status !== 0) {
  failWithHint('pulumi CLI not found', { command: 'brew install pulumi/tap/pulumi', description: 'the infra CLI needs Pulumi for every stack operation' })
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
  context.state === 'fresh' || nonInteractive()
    ? 'resume'
    : await select<CliMode>({
        message: 'Existing config detected. How would you like to proceed?',
        default: 'resume',
        // No wrap-around, and page the whole list so the full action count
        // stays visible at a glance.
        loop: false,
        pageSize: 12,
        choices: [
          { name: 'Status', value: 'status', description: 'Read-only health check: tooling, credentials, stack state, rollout, live service versions, and the next action to take. `--json` on the standalone `pnpm --filter infra status` for machines.' },
          { name: 'Resume', value: 'resume', description: 'Verify & sync config + GitHub secrets with the CI key; self-heals missing keys. Read-only on DB/VPC/PN — cannot change protected infra.' },
          { name: 'Rotate keys', value: 'rotate', description: 'Mint fresh CI deploy and VM reader keys. Use after editing the CI policy permission sets.' },
          { name: 'Rotate passphrase', value: 'rotate-passphrase', description: 'Re-encrypt stack state with a freshly generated Pulumi passphrase and sync it to GitHub. Needs the current passphrase; no bootstrap key.' },
          { name: 'Apply infra change', value: 'apply', description: 'Privileged converge: one-shot `pulumi up` with a bootstrap key for DB/VPC/PN changes the CI key cannot. No refresh (buckets are CI-scoped); offers to prune state entries whose live object is already gone.' },
          { name: 'Preview', value: 'preview', description: 'Read-only `pulumi preview`. Validates auth & shows drift; makes no changes.' },
          { name: 'Manage runtime secrets', value: 'secrets', description: 'List, set, rotate, or delete operator-managed runtime secrets in Scaleway Secret Manager.' },
          { name: 'Reset database', value: 'reset-database', description: 'DESTRUCTIVE: delete + recreate the app database empty (backup first, roles re-granted), then migrate/seed on the serial console. Pre-production, or with services quiesced.' },
          { name: 'Seed database', value: 'seed-db', description: 'Non-production only: temporarily expose the DB to your IP, run the backend seeds, close the endpoint again.' },
          { name: 'Expose database publicly', value: 'expose-db', description: 'Add a scoped, temporary public DB endpoint (ACL-restricted to your IP) for prototyping/debugging. Prints the admin connection string. Remember to close it.' },
          { name: 'Stop public DB exposure', value: 'unexpose-db', description: 'Remove the public DB endpoint and ACL, returning the database to private-only access.' },
          { name: 'Unlock', value: 'unlock', description: 'Clear a stale stack lock left by an interrupted apply/deploy. Use only when no run is actually in progress.' },
        ],
      })


if (mode === 'status') {
  const { runStatus } = await import('../tasks/status')
  await runStatus(context)
  process.exit(0)
}

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

if (mode === 'seed-db') {
  await runSeedDatabase(context)
  process.exit(0)
}

if (mode === 'expose-db') {
  await runExposeDatabase(context)
  process.exit(0)
}

if (mode === 'unexpose-db') {
  await runUnexposeDatabase(context)
  process.exit(0)
}

if (mode === 'unlock') {
  await runUnlock(context)
  process.exit(0)
}

await runSetup(context, mode)
