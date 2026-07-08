import { spawn } from 'node:child_process'
import { pc } from 'shared/cli-utils/colors';
import { warningMark } from 'shared/utils/console'
import { isBootstrapOwned } from '../scaleway/permissions'

function waitForExitCode(child: ReturnType<typeof spawn>): Promise<number> {
  return new Promise((resolve) => child.once('close', (code) => resolve(code ?? 1)))
}

export type PermissionHint =
  | { kind: 'bootstrap-owned'; resource: string }
  | { kind: 'ci-grantable'; resource: string }
  | undefined

/** Scans pulumi-up stderr for a Scaleway "insufficient permissions: write <resource>"
 *  diagnostic and classifies the resource as bootstrap-owned vs CI-grantable.
 *  Returns undefined when no such error is present. Pure. */
export function classifyPermissionError(stderr: string): PermissionHint {
  const m = stderr.match(/insufficient permissions:\s*write\s+([\w_]+)/i)
  if (!m?.[1]) return undefined
  const resource = m[1]
  return isBootstrapOwned(resource)
    ? { kind: 'bootstrap-owned', resource }
    : { kind: 'ci-grantable', resource }
}

/** Runs `pulumi up --stack <s> --yes --non-interactive` in `cwd` with `env`.
 *  On non-zero exit, prints a permission hint when stderr indicates one. */
export async function runPulumiUpWithHint(stack: string, cwd: string, env: NodeJS.ProcessEnv): Promise<number> {
  console.info(`\n→ pulumi up (base infra)\n  $ pulumi up --stack ${stack} --yes --non-interactive`)
  const child = spawn('pulumi', ['up', '--stack', stack, '--yes', '--non-interactive'], {
    cwd,
    env,
    stdio: ['inherit', 'inherit', 'pipe'],
  })
  let stderrBuf = ''
  child.stderr?.on('data', (chunk: Buffer) => {
    stderrBuf += chunk.toString()
    process.stderr.write(chunk)
  })

  const exitCode = await waitForExitCode(child)
  if (exitCode !== 0) {
    const hint = classifyPermissionError(stderrBuf)
    if (hint) {
      console.error(`\n${warningMark} ${pc.bold('Permission hint:')} key lacks write on ${pc.cyan(hint.resource)}.`)
      if (hint.kind === 'bootstrap-owned')
        console.error(`  Looks bootstrap-owned. Re-run bootstrap and choose ${pc.italic('"Apply infra change"')} to apply with a bootstrap key.`)
      else
        console.error(
          `  Add the matching permission set to PROJECT_PERMISSION_SETS in lib/permissions.ts, then re-run bootstrap and choose ${pc.italic('"Rotate keys"')}.`,
        )
    }
  }

  return exitCode
}
