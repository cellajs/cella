/**
 * Interactive infra CLI for the Pulumi/Scaleway infra. Safe to re-run.
 * Inspects the local Pulumi stack file to decide whether this is a fresh
 * fork or an existing setup, then offers a mode menu. Credentials live in
 * memory only — never written to disk. See infra/README.md.
 *
 * Usage: pnpm --filter infra bootstrap
 */
import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { select } from '@inquirer/prompts'
import pc from 'shared/cli-utils/colors'
import { printHeader } from 'shared/cli-utils/display'
import { warningMark } from 'shared/console'
import { detectComputeDeferred, detectStackState, pickStackShort } from '../lib/bootstrap-stack-state'
import { infraDir } from '../lib/paths'
import { runApply } from './services/apply'
import { runPreview } from './services/preview'
import { runSecrets } from './services/secrets'
import { runSetup } from './services/setup'
import type { CliMode, InfraContext } from './shared'

// Load the repo-root .env so infra-only repo envs (e.g. SCW_PROJECT_ID) are
// available to the CLI and the child tasks it spawns. Mirrors backend/src/env.ts;
// real environment variables still take precedence (CI sets SCW_* explicitly).
const rootEnvFile = resolve(infraDir, '..', '.env')
if (existsSync(rootEnvFile)) process.loadEnvFile(rootEnvFile)

async function loadContext(): Promise<InfraContext> {
  const environment = pickStackShort((name) => existsSync(resolve(infraDir, `Pulumi.${name}.yaml`)))
  const stackPath = resolve(infraDir, `Pulumi.${environment}.yaml`)
  const stackYaml = existsSync(stackPath) ? readFileSync(stackPath, 'utf8') : undefined
  const state = detectStackState({ yamlText: stackYaml })

  // Resolve appConfig once, keyed to this stack's environment. `shared` reads
  // APP_MODE at module-eval time, so it must be set before the first import.
  // Setting it on process.env also propagates to spawned child tasks (which
  // inherit the env), keeping the whole run on a single, correct config.
  process.env.APP_MODE ??= environment
  const { appConfig } = await import('shared')

  return {
    environment,
    stackPath,
    stackYaml,
    state,
    hasCiKey: state === 'bootstrapped',
    appConfig,
  }
}

printHeader('infra cli')

if (spawnSync('pulumi', ['version'], { stdio: 'ignore' }).status !== 0) {
  console.error('✗ pulumi CLI not found. Install: brew install pulumi/tap/pulumi')
  process.exit(1)
}

const context = await loadContext()

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
          { name: 'Resume', value: 'resume', description: 'Idempotent re-run; refreshes config & GitHub secrets. Cannot apply changes to DB/VPC/PN (CI key is read-only there).' },
          { name: 'Rotate CI', value: 'rotate', description: 'Mint a fresh CI deploy key (existing one is deleted). Use after editing the CI policy permission sets.' },
          { name: 'Apply infra change', value: 'apply', description: 'One-shot `pulumi up` with a bootstrap key for DB/VPC/PN changes; provider auth is supplied via env.' },
          { name: 'Preview', value: 'preview', description: 'Read-only `pulumi preview` with a Scaleway key (via env). Validates auth & shows drift; makes no changes.' },
          { name: 'Manage runtime secrets', value: 'secrets', description: 'List, set, rotate, or delete operator-managed runtime secrets in Scaleway Secret Manager.' },
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

await runSetup(context, mode)