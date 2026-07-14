import { spawnSync } from 'node:child_process'
import type { Environment } from './stack/bootstrap-stack-state'
import { crossMark, warningMark } from 'shared/utils/console'

/** Parses `git remote get-url origin` output into `owner/repo`. Accepts both
 *  https://github.com/owner/repo(.git) and git@github.com:owner/repo(.git)
 *  forms. Returns undefined for anything we can't recognise. Pure. */
export function parseGithubOriginRepo(originUrl: string): string | undefined {
  return originUrl.match(/github\.com[/:]([^/]+\/[^/.]+?)(?:\.git)?$/)?.[1]
}

export interface GithubSyncOptions {
  repoRoot: string
  environment: Environment
  /** Stack-scoped secrets to write. Skip the section by passing undefined. */
  ciKey?: {
    accessKey: string
    secretKey: string
    projectId: string
    organizationId: string
  }
  /** The stack's Pulumi passphrase; written as `PULUMI_CONFIG_PASSPHRASE`. */
  passphrase?: string
  /** Injected for testability. Returns the spawn exit status. */
  run?: (cmd: string, args: string[], opts: { cwd: string }) => number
}

/** The `gh secret set` name/value pairs a sync would write. Pure. */
export function githubSecretEntries(opts: Pick<GithubSyncOptions, 'ciKey' | 'passphrase'>): Array<[name: string, value: string]> {
  const entries: Array<[string, string]> = []
  if (opts.ciKey) {
    entries.push(
      ['SCW_ACCESS_KEY', opts.ciKey.accessKey],
      ['SCW_SECRET_KEY', opts.ciKey.secretKey],
      ['SCW_PROJECT_ID', opts.ciKey.projectId],
      ['SCW_ORGANIZATION_ID', opts.ciKey.organizationId],
    )
  }
  if (opts.passphrase) entries.push(['PULUMI_CONFIG_PASSPHRASE', opts.passphrase])
  return entries
}

const defaultRun = (cmd: string, args: string[], opts: { cwd: string }): number =>
  spawnSync(cmd, args, { cwd: opts.cwd, stdio: 'inherit' }).status ?? 1

/** Ensures the GitHub Environment exists, then writes CI secrets (if given).
 *  No-op (with warning) when gh isn't authenticated or origin isn't a GitHub
 *  remote; returns false in those skip cases so the caller can point the
 *  operator at the manual path. */
export async function syncGithubEnvironment(opts: GithubSyncOptions): Promise<boolean> {
  const run = opts.run ?? defaultRun

  if (spawnSync('gh', ['auth', 'status'], { stdio: 'ignore' }).status !== 0) return false

  const originUrl =
    spawnSync('git', ['remote', 'get-url', 'origin'], { cwd: opts.repoRoot, encoding: 'utf8' }).stdout?.trim() ?? ''
  const ownerRepo = parseGithubOriginRepo(originUrl)
  if (!ownerRepo) {
    console.warn(`  ${warningMark} Could not parse GitHub repo from \`git remote get-url origin\`; skipping GitHub sync.`)
    return false
  }

  const step = (label: string, cmd: string, args: string[]) => {
    // Redact the secret value (`--body <value>`) from the echoed command so it
    // does not land in terminal scrollback.
    const shown = args.map((arg, i) => (args[i - 1] === '--body' ? '<redacted>' : arg))
    console.info(`\n→ ${label}\n  $ ${cmd} ${shown.join(' ')}`)
    const code = run(cmd, args, { cwd: opts.repoRoot })
    if (code !== 0) console.error(`${crossMark} ${label} failed (exit ${code})`)
  }

  step(`Ensure GitHub Environment "${opts.environment}"`, 'gh', ['api', '-X', 'PUT', `repos/${ownerRepo}/environments/${opts.environment}`, '--silent'])

  for (const [name, value] of githubSecretEntries(opts)) {
    step(`gh secret set ${name} (env: ${opts.environment})`, 'gh', ['secret', 'set', name, '--env', opts.environment, '--repo', ownerRepo, '--body', value])
  }
  return true
}
