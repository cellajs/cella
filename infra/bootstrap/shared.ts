import { createHash } from 'node:crypto'
import { confirm } from '@inquirer/prompts'
import { ORG_PERMISSION_SETS, PROJECT_PERMISSION_SETS } from '../tasks/setup-ci-key.js'

export type Mode = 'resume' | 'rotate' | 'apply' | 'clean' | 'secrets'

export interface BootstrapContext {
  infraDir: string
  stackShort: string
  stackPath: string
  stackYaml?: string
  state: 'fresh' | 'partial' | 'bootstrapped'
  hasCiKey: boolean
  applyBackupPath: string
}

export interface StepOptions {
  cwd?: string
  retry?: boolean
  env?: NodeJS.ProcessEnv
}

/** Short hash of the permission sets the CI policy should have. */
export const policyFingerprint = () =>
  createHash('sha1')
    .update(JSON.stringify([[...PROJECT_PERMISSION_SETS].sort(), [...ORG_PERMISSION_SETS].sort()]))
    .digest('hex')
    .slice(0, 12)

export const envOr = async (envName: string, prompt: () => Promise<string>) => process.env[envName] || (await prompt())

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