import { spawnSync } from 'node:child_process'
import { infraDir } from '../utils/paths'

/** Run `pulumi <args>` in the infra dir, returning trimmed stdout. `quiet`
 *  suppresses the echo (probe commands whose failure is an expected branch). */
export function runPulumi(args: string[], opts: { allowFailure?: boolean; env?: NodeJS.ProcessEnv; quiet?: boolean } = {}): string {
  const res = spawnSync('pulumi', args, {
    cwd: infraDir,
    env: opts.env ?? process.env,
    encoding: 'utf-8',
    stdio: ['inherit', 'pipe', 'pipe'],
  })
  if (!opts.quiet) {
    if (res.stdout) process.stdout.write(res.stdout)
    if (res.stderr) process.stderr.write(res.stderr)
  }
  if (res.status !== 0 && !opts.allowFailure) throw new Error(`pulumi ${args.join(' ')} failed with exit ${res.status}`)
  return res.stdout.trim()
}

/** Read a stack output as JSON. Throws when the output is missing. */
export function stackOutput<T>(stack: string, name: string): T {
  const raw = runPulumi(['stack', 'output', name, '--stack', stack, '--json'])
  return JSON.parse(raw) as T
}

/** Read a stack output's raw JSON text, or undefined when absent/empty. */
export function tryStackOutputRaw(stack: string, name: string): string | undefined {
  return runPulumi(['stack', 'output', name, '--stack', stack, '--json'], { allowFailure: true }).trim() || undefined
}
