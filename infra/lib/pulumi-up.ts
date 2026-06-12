/**
 * `pulumi up` wrapper used by bootstrap. Streams stdout/stderr through, also
 * captures stderr so we can scan for Scaleway "insufficient permissions"
 * errors and print an actionable next-step hint without the user having to
 * read the raw provider trace.
 */
import { spawn } from 'node:child_process'
import pc from 'shared/cli-utils/colors'
import { warningMark } from 'shared/console'

async function waitForExitCode(child: ReturnType<typeof spawn>): Promise<number> {
  while (child.exitCode === null && child.signalCode === null) {
    await new Promise((resolve) => setTimeout(resolve, 50))
  }

  return child.exitCode ?? 1
}

/** Resources whose permission set is intentionally NOT granted to the CI key
 *  (see PROJECT_PERMISSION_SETS in setup-ci-key.ts). When permission is denied
 *  on one of these, the fix is to use Apply mode, not to widen CI.
 *
 *  `policy` covers the VM reader IAM policy (resources/vm-iam.ts): creating or
 *  updating an IAM policy needs IAM *write*, which the CI key must never hold
 *  (IAMManager/IAMPolicyManager are forbidden privilege-escalation vectors —
 *  see tasks/permission-sets.test.ts). So its first creation, like VPC/PN/RDB,
 *  must run via a local `pulumi up` with the bootstrap key; CI only refreshes
 *  it afterwards. */
const BOOTSTRAP_OWNED_RESOURCE = /private_network|^vpc|rdb|instance_db|domain_zone|policy/i

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
  return BOOTSTRAP_OWNED_RESOURCE.test(resource)
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
          `  Add the matching permission set to PROJECT_PERMISSION_SETS in tasks/setup-ci-key.ts, then re-run bootstrap and choose ${pc.italic('"Rotate CI"')}.`,
        )
    }
  }

  return exitCode
}
