import { confirm } from '@inquirer/prompts'
import pc from 'shared/cli-utils/colors'
import { warningMark } from 'shared/console'
import type { appConfig as AppConfig } from 'shared'
import type { Environment, StackState } from '../lib/bootstrap-stack-state'
import { verifyStackPassphrase } from '../lib/pulumi-passphrase'
import { maskedSecret } from './prompts/masked-secret'

/** Infra CLI operation modes */
export type CliMode = 'resume' | 'rotate' | 'apply' | 'preview' | 'secrets' | 'bake'

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
 * Gets an environment variable, or prompts for it if not set.
 */
export const envOr = async (envName: string, prompt: () => Promise<string>) => process.env[envName] || (await prompt())

/**
 * Resolve the Pulumi passphrase, verified against the stack's `encryptionsalt`.
 *
 * A stale `PULUMI_CONFIG_PASSPHRASE` exported in the shell otherwise wins
 * silently and surfaces later as a confusing `incorrect passphrase` deep inside
 * `pulumi`. This checks the env value up front: if it decrypts the stack it is
 * used without a prompt; if it is set but wrong, we warn and prompt anyway;
 * and we keep prompting until a passphrase verifies. When the stack has no
 * `encryptionsalt` (a brand-new stack with nothing encrypted yet) there is
 * nothing to verify against, so we fall back to env-or-single-prompt.
 */
export async function resolveVerifiedPassphrase(stackYaml: string | undefined): Promise<string> {
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
      console.error(`\n✗ ${label} failed (exit ${status}).`)
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

  return { step, must }
}