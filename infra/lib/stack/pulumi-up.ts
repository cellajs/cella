import { spawn, spawnSync } from 'node:child_process'
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

/** URNs whose DELETE failed because the live object is already gone (HTTP 404
 *  from the provider). Pruning such an entry from state is safe by construction:
 *  the delete's goal (resource gone) is already true, so `pulumi state delete`
 *  completes what the operation would have done. Matches the single-line
 *  diagnostic and the multierror form where the 404 detail is on the following
 *  bullet line; only `deleting` operations qualify (a 404 on update/read means
 *  drift on a resource that should exist, which is a different repair). Pure. */
export function parseOrphanedDeletes(output: string): string[] {
  const urns = new Set<string>()
  const lines = output.split('\n')
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? ''
    const next = lines[i + 1] ?? ''
    const m = line.match(/error: deleting (urn:pulumi:\S+): /)
    if (!m?.[1]) continue
    const notFound404 = /\b404\b[^\n]*not found/i
    if (notFound404.test(line) || (/^\s*\* /.test(next) && notFound404.test(next))) urns.add(m[1])
  }
  return [...urns]
}

/** `pulumi state delete --yes` each URN. Returns true when all succeeded; a
 *  refusal (e.g. a dependent still references the entry) is reported and the
 *  entry left in place. */
export function pruneOrphanedDeletes(urns: string[], stack: string, cwd: string, env: NodeJS.ProcessEnv): boolean {
  let ok = true
  for (const urn of urns) {
    const res = spawnSync('pulumi', ['state', 'delete', urn, '--stack', stack, '--yes'], { cwd, env, encoding: 'utf8' })
    if (res.status === 0) {
      console.info(`  pruned ${urn}`)
    } else {
      ok = false
      console.warn(`${warningMark} state delete refused for ${urn}: ${(res.stderr ?? '').trim().slice(0, 300)}`)
    }
  }
  return ok
}

export interface PulumiUpResult {
  code: number
  /** Combined stdout+stderr for post-mortem parsing (permission hints, orphaned deletes). */
  output: string
}

/** Runs `pulumi up --stack <s> --yes --non-interactive` in `cwd` with `env`.
 *  On non-zero exit, prints a permission hint when stderr indicates one. */
export async function runPulumiUpWithHint(stack: string, cwd: string, env: NodeJS.ProcessEnv): Promise<PulumiUpResult> {
  console.info(`\n→ pulumi up (base infra)\n  $ pulumi up --stack ${stack} --yes --non-interactive`)
  // stdout is teed, not inherited, so the Diagnostics section reaches
  // parseOrphanedDeletes; with --non-interactive pulumi already uses the plain
  // (non-TTY) display, so piping does not change what the operator sees.
  const child = spawn('pulumi', ['up', '--stack', stack, '--yes', '--non-interactive'], {
    cwd,
    env,
    stdio: ['inherit', 'pipe', 'pipe'],
  })
  let stdoutBuf = ''
  child.stdout?.on('data', (chunk: Buffer) => {
    stdoutBuf += chunk.toString()
    process.stdout.write(chunk)
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

  return { code: exitCode, output: `${stdoutBuf}\n${stderrBuf}` }
}
