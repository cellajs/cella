import { spawnSync } from 'node:child_process'
import { confirm, input } from '@inquirer/prompts'
import { pc } from 'shared/cli-utils/colors';
import { crossMark, warningMark } from 'shared/utils/console'
import type { appConfig as AppConfig } from 'shared'
import type { Environment, StackState } from '../lib/stack/bootstrap-stack-state'
import { acquireLock, controlActor, lockKey, makeControlClient, releaseLock, stateBucket } from '../lib/stack/control-store'
import { errorMessage } from '../lib/utils/errors'
import { generatePassphrase, verifyStackPassphrase } from '../lib/stack/pulumi-passphrase'
import { maskedSecret } from './prompts/masked-secret'

type AppConfigType = typeof AppConfig

/** Infra CLI operation modes */
export type CliMode = 'resume' | 'rotate' | 'rotate-passphrase' | 'apply' | 'preview' | 'secrets' | 'reset-database' | 'expose-db' | 'unexpose-db' | 'unlock'

/**
 * Context for the infra CLI, including stack information and state. Passed to each service handler to provide necessary information about the current infra status and configuration.
 */
export interface InfraContext {
  environment: Environment
  stackPath: string
  stackYaml?: string
  state: StackState
  hasCiKey: boolean
  appConfig: typeof AppConfig
  projectId: string
}

/**
 * Options for running a step in the infra CLI, including command execution settings and retry behavior.
 */
export interface StepOptions {
  cwd?: string
  retry?: boolean
  env?: NodeJS.ProcessEnv
}

/**
 * Gets the first set environment variable from `envName` (a single name or an
 * ordered list of fallbacks), or prompts for it if none are set.
 */
export const envOr = async (envName: string | string[], prompt: () => Promise<string>) => {
  const names = Array.isArray(envName) ? envName : [envName]
  for (const name of names) {
    const value = process.env[name]
    if (value) return value
  }
  return prompt()
}

/**
 * Resolves and verifies the Pulumi passphrase against existing stack encryption metadata.
 * An invalid environment value falls back to repeated prompts; a new unencrypted stack accepts
 * the environment or one prompt without verification.
 */
export async function resolveVerifiedPassphrase(stackYaml?: string): Promise<string> {
  const canVerify = !!stackYaml && /^encryptionsalt:/m.test(stackYaml)
  if (!canVerify) return envOr('PULUMI_CONFIG_PASSPHRASE', () => maskedSecret({ message: 'Pulumi passphrase' }))

  const fromEnv = process.env.PULUMI_CONFIG_PASSPHRASE
  if (fromEnv && verifyStackPassphrase(stackYaml, fromEnv)) return fromEnv
  if (fromEnv) {
    console.warn(`${warningMark} ${pc.yellow('PULUMI_CONFIG_PASSPHRASE in your environment does not match this stack — prompting instead.')}`)
  }

  while (true) {
    const entered = await maskedSecret({ message: 'Pulumi passphrase' })
    if (verifyStackPassphrase(stackYaml, entered)) return entered
    console.warn(`${warningMark} Incorrect passphrase for this stack. Try again.`)
  }
}

/**
 * Show a newly established passphrase exactly once and block until the operator
 * confirms it is stored: it encrypts stack state, is unrecoverable if lost, and
 * cannot be read back from GitHub later (Actions secrets are write-only).
 */
export async function confirmPassphraseStored(passphrase: string, heading: string, note?: string): Promise<void> {
  console.info(`\n→ ${heading}`)
  console.info(`\n    ${pc.cyanBright(passphrase)}\n`)
  console.info(
    `  ${pc.bold('Store it in your password manager now.')} It cannot be recovered if lost,\n` +
      `  and once synced to GitHub it can never be viewed again (Actions secrets are write-only).` +
      (note ? `\n  ${pc.dim(note)}` : ''),
  )
  while (!(await confirm({ message: 'Passphrase stored in your password manager?', default: false }))) {
    console.warn(`${warningMark} Store it before continuing — this is the only time it is shown.`)
  }
}

/**
 * The bootstrap-time counterpart of `resolveVerifiedPassphrase`: when the stack
 * already encrypts something (or `PULUMI_CONFIG_PASSPHRASE` is set), defer to
 * the verify/prompt flow. A brand-new stack with nothing encrypted yet gets a
 * generated passphrase,
 * showing it once via `confirmPassphraseStored`. `generated` tells the caller
 * this is a newly established passphrase.
 */
export async function resolveOrCreatePassphrase(stackYaml?: string): Promise<{ passphrase: string; generated: boolean }> {
  const canVerify = !!stackYaml && /^encryptionsalt:/m.test(stackYaml)
  if (canVerify || process.env.PULUMI_CONFIG_PASSPHRASE) {
    return { passphrase: await resolveVerifiedPassphrase(stackYaml), generated: false }
  }

  const passphrase = generatePassphrase()
  await confirmPassphraseStored(
    passphrase,
    `Pulumi passphrase ${pc.dim('(encrypts stack secret state — generated for this new stack)')}`,
    'To supply your own instead, abort and re-run with PULUMI_CONFIG_PASSPHRASE set.',
  )
  return { passphrase, generated: true }
}

/** The "Pulumi stack name" prompt every action shares. */
export function promptStackName(context: InfraContext): Promise<string> {
  return input({ message: 'Pulumi stack name', default: `organization/infra/${context.environment}` })
}

/** A required free-text prompt (used for Scaleway access keys). */
export function promptRequiredInput(message: string): Promise<string> {
  return input({ message, validate: (value) => !!value.trim() || '(required)' })
}

/** S3-backend login URL for the app's Pulumi state bucket. */
export function pulumiLoginUrl(appConfig: AppConfigType): string {
  return `s3://${stateBucket(appConfig.slug)}?endpoint=s3.${appConfig.s3.region}.scw.cloud&region=${appConfig.s3.region}`
}

/** `pulumi login` (exits on failure) + `pulumi stack select` (best-effort: the
 *  caller may be about to init the stack) against the S3 state backend. */
export function pulumiLoginAndSelect(infraDir: string, env: NodeJS.ProcessEnv, appConfig: AppConfigType, targetStack: string): void {
  const login = spawnSync('pulumi', ['login', pulumiLoginUrl(appConfig)], { cwd: infraDir, env, stdio: 'inherit' })
  if (login.status !== 0) {
    console.error(`${crossMark} pulumi login failed (exit ${login.status}). Check the state-bucket credentials (AWS_* env).`)
    process.exit(login.status ?? 1)
  }
  spawnSync('pulumi', ['stack', 'select', targetStack], { cwd: infraDir, env, stdio: 'ignore' })
}

/** Handle to a held stack lock; `release` logs failures and never throws. */
export interface StackLockHandle {
  release: () => Promise<void>
}

/**
 * Acquire the S3 conditional-write stack lock (so a second operator or CI
 * cannot mutate the stack concurrently), or exit(1) with pointers to the
 * "Unlock" escape hatch when it is already held. A dead run's lock self-expires
 * after the TTL.
 */
export async function acquireStackLockOrExit(opts: {
  appConfig: AppConfigType
  accessKey: string
  secretKey: string
  stack: string
  operation: string
  ttlMs?: number
}): Promise<StackLockHandle> {
  const s3 = await makeControlClient(opts.appConfig.s3.region, opts.accessKey, opts.secretKey)
  const bucket = stateBucket(opts.appConfig.slug)
  const key = lockKey(opts.stack)
  const owner = controlActor()
  const lock = await acquireLock(s3, bucket, key, { owner, operation: opts.operation, ttlMs: opts.ttlMs ?? 30 * 60_000 })
  if (!lock.acquired) {
    console.error(
      `${warningMark} Stack ${opts.stack} is locked by ${pc.cyan(lock.held.owner)} (operation: ${lock.held.operation}, since ${lock.held.acquiredAt}).`,
    )
    console.error(`  If that run is dead, clear it with the CLI "Unlock" action or remove s3://${bucket}/${key}.`)
    process.exit(1)
  }
  return {
    release: () => releaseLock(s3, bucket, key, owner).catch((e) => console.warn(`${warningMark} failed to release stack lock: ${errorMessage(e)}`)),
  }
}

/**
 * Creates a step runner for executing commands with retry and error handling.
 */
export function createStepRunner(infraDir: string, defaultEnv: NodeJS.ProcessEnv) {
  const step = async (
    label: string,
    cmd: string,
    args: string[],
    run: (cmd: string, args: string[], opts: { cwd: string; env: NodeJS.ProcessEnv; stdio: 'inherit' }) => { status: number | null },
    opts: StepOptions = {},
  ): Promise<number> => {
    while (true) {
      console.info(`\n→ ${label}\n  $ ${cmd} ${args.join(' ')}`)
      const { status } = run(cmd, args, {
        cwd: opts.cwd ?? infraDir,
        env: opts.env ?? defaultEnv,
        stdio: 'inherit',
      })
      if (status === 0) return 0
      console.error(`\n${crossMark} ${label} failed (exit ${status}).`)
      if (!opts.retry || !(await confirm({ message: 'Retry?', default: true }))) {
        return status ?? 1
      }
    }
  }

  const must = async (
    label: string,
    cmd: string,
    args: string[],
    run: (cmd: string, args: string[], opts: { cwd: string; env: NodeJS.ProcessEnv; stdio: 'inherit' }) => { status: number | null },
    opts: StepOptions = {},
  ) => {
    const code = await step(label, cmd, args, run, opts)
    if (code !== 0) process.exit(code)
  }

  return { must }
}
