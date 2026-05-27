/**
 * GitHub sync for bootstrap: writes CI deploy creds + config-derived Actions
 * variables into the GitHub Environment matching the Pulumi stack. Scoped to
 * an Environment so credentials are only injected into jobs that opt in via
 * `environment:` in their workflow.
 */
import { spawnSync } from 'node:child_process'
import { warningMark } from 'shared/console'

/** Parses `git remote get-url origin` output into `owner/repo`. Accepts both
 *  https://github.com/owner/repo(.git) and git@github.com:owner/repo(.git)
 *  forms. Returns undefined for anything we can't recognise. Pure. */
export function parseGithubOriginRepo(originUrl: string): string | undefined {
  return originUrl.match(/github\.com[/:]([^/]+\/[^/.]+?)(?:\.git)?$/)?.[1]
}

export interface GithubSyncOptions {
  repoRoot: string
  stackShort: string
  /** Stack-scoped secrets to write. Skip the section by passing undefined. */
  ciKey?: {
    accessKey: string
    secretKey: string
    projectId: string
    organizationId: string
  }
  /** Non-secret Actions Variables (name → value). */
  variables: ReadonlyArray<readonly [name: string, value: string]>
  /** Injected for testability. Returns the spawn exit status. */
  run?: (cmd: string, args: string[], opts: { cwd: string }) => number
}

const defaultRun = (cmd: string, args: string[], opts: { cwd: string }): number =>
  spawnSync(cmd, args, { cwd: opts.cwd, stdio: 'inherit' }).status ?? 1

/** Ensures the GitHub Environment exists, then writes CI secrets (if given)
 *  and the supplied non-secret variables. No-op (with warning) when gh isn't
 *  authenticated or origin isn't a GitHub remote. */
export async function syncGithubEnvironment(opts: GithubSyncOptions): Promise<void> {
  const run = opts.run ?? defaultRun

  if (spawnSync('gh', ['auth', 'status'], { stdio: 'ignore' }).status !== 0) return

  const originUrl =
    spawnSync('git', ['remote', 'get-url', 'origin'], { cwd: opts.repoRoot, encoding: 'utf8' }).stdout?.trim() ?? ''
  const ownerRepo = parseGithubOriginRepo(originUrl)
  if (!ownerRepo) {
    console.warn(`  ${warningMark} Could not parse GitHub repo from \`git remote get-url origin\`; skipping GitHub sync.`)
    return
  }

  const step = (label: string, args: string[]) => {
    console.info(`\n→ ${label}\n  $ ${args.join(' ')}`)
    const code = run(args[0]!, args.slice(1), { cwd: opts.repoRoot })
    if (code !== 0) console.error(`✗ ${label} failed (exit ${code})`)
  }

  step(
    `Ensure GitHub Environment "${opts.stackShort}"`,
    ['gh', 'api', '-X', 'PUT', `repos/${ownerRepo}/environments/${opts.stackShort}`, '--silent'],
  )

  if (opts.ciKey) {
    const { accessKey, secretKey, projectId, organizationId } = opts.ciKey
    for (const [name, value] of [
      ['SCW_ACCESS_KEY', accessKey],
      ['SCW_SECRET_KEY', secretKey],
      ['SCW_PROJECT_ID', projectId],
      ['SCW_ORGANIZATION_ID', organizationId],
    ] as const) {
      step(
        `gh secret set ${name} (env: ${opts.stackShort})`,
        ['gh', 'secret', 'set', name, '--env', opts.stackShort, '--repo', ownerRepo, '--body', value],
      )
    }
  }

  for (const [name, value] of opts.variables) {
    step(
      `gh variable set ${name} (env: ${opts.stackShort})`,
      ['gh', 'variable', 'set', name, '--env', opts.stackShort, '--repo', ownerRepo, '--body', value],
    )
  }
}
