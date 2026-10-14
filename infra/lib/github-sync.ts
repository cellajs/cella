import { spawnSync } from 'node:child_process';
import type { Environment } from './stack/bootstrap-stack-state';
import { crossMark, warningMark } from './utils/cli-output';

/** Parses `git remote get-url origin` output into `owner/repo`. Accepts both
 *  https://github.com/owner/repo(.git) and git@github.com:owner/repo(.git)
 *  forms. Returns undefined for anything we can't recognise. Pure. */
export function parseGithubOriginRepo(originUrl: string): string | undefined {
  return originUrl.match(/github\.com[/:]([^/]+\/[^/.]+?)(?:\.git)?$/)?.[1];
}

export interface GithubSyncOptions {
  repoRoot: string;
  environment: Environment;
  /** Stack-scoped secrets to write. Skip the section by passing undefined. */
  ciKey?: { accessKey: string; secretKey: string; projectId: string; organizationId: string };
  /** The stack's Pulumi passphrase; written as `PULUMI_CONFIG_PASSPHRASE`. */
  passphrase?: string;
  /** Injected for testability. Returns the spawn exit status. `input`, when set,
   *  is fed to the child's stdin, which carries secret values so they never
   *  appear as argv elements. */
  run?: (cmd: string, args: string[], opts: { cwd: string; input?: string }) => number;
}

/** The `gh secret set` name/value pairs a sync would write. Pure. */
export function githubSecretEntries(opts: Pick<GithubSyncOptions, 'ciKey' | 'passphrase'>): Array<[name: string, value: string]> {
  const entries: Array<[string, string]> = [];
  if (opts.ciKey) {
    entries.push(
      ['SCW_ACCESS_KEY', opts.ciKey.accessKey],
      ['SCW_SECRET_KEY', opts.ciKey.secretKey],
      ['SCW_PROJECT_ID', opts.ciKey.projectId],
      ['SCW_ORGANIZATION_ID', opts.ciKey.organizationId],
    );
  }
  if (opts.passphrase) entries.push(['PULUMI_CONFIG_PASSPHRASE', opts.passphrase]);
  return entries;
}

/** The `gh secret set` arguments for one environment secret. They hold no value: it is fed on stdin. Pure. */
export function githubSecretSetArgs(name: string, environment: string, ownerRepo: string): string[] {
  return ['secret', 'set', name, '--env', environment, '--repo', ownerRepo];
}

const defaultRun = (cmd: string, args: string[], opts: { cwd: string; input?: string }): number =>
  spawnSync(cmd, args, {
    cwd: opts.cwd,
    // When a secret is supplied it goes in on stdin; otherwise inherit so the
    // command stays interactive/visible. `input` is never echoed.
    stdio: opts.input === undefined ? 'inherit' : ['pipe', 'inherit', 'inherit'],
    input: opts.input,
  }).status ?? 1;

/** Ensures the GitHub Environment exists, then writes CI secrets (if given).
 *  No-op (with warning) when gh isn't authenticated or origin isn't a GitHub
 *  remote; returns false in those skip cases so the caller can point the
 *  operator at the manual path. */
export async function syncGithubEnvironment(opts: GithubSyncOptions): Promise<boolean> {
  const run = opts.run ?? defaultRun;

  if (spawnSync('gh', ['auth', 'status'], { stdio: 'ignore' }).status !== 0) return false;

  const originUrl = spawnSync('git', ['remote', 'get-url', 'origin'], { cwd: opts.repoRoot, encoding: 'utf8' }).stdout?.trim() ?? '';
  const ownerRepo = parseGithubOriginRepo(originUrl);
  if (!ownerRepo) {
    console.warn(`  ${warningMark} Could not parse GitHub repo from \`git remote get-url origin\`; skipping GitHub sync.`);
    return false;
  }

  const step = (label: string, cmd: string, args: string[], input?: string): boolean => {
    console.info(`\n→ ${label}\n  $ ${cmd} ${args.join(' ')}`);
    const code = run(cmd, args, { cwd: opts.repoRoot, input });
    if (code !== 0) console.error(`${crossMark} ${label} failed (exit ${code})`);
    return code === 0;
  };

  step(`Ensure GitHub Environment "${opts.environment}"`, 'gh', [
    'api',
    '-X',
    'PUT',
    `repos/${ownerRepo}/environments/${opts.environment}`,
    '--silent',
  ]);

  const notWritten: string[] = [];
  for (const [name, value] of githubSecretEntries(opts)) {
    // The value goes in on stdin, which `gh secret set` reads when no `--body` is given. It is never an argv element, so it cannot leak
    // through `ps`, execve audit logs, or the echoed command above.
    const written = step(`gh secret set ${name} (env: ${opts.environment})`, 'gh', githubSecretSetArgs(name, opts.environment, ownerRepo), value);
    if (!written) notWritten.push(name);
  }
  if (notWritten.length > 0) {
    console.warn(
      `\n${warningMark} GitHub Environment "${opts.environment}" does not hold ${notWritten.join(', ')}: deploys from GitHub fail until they are written. Fix the cause above and run the action again.`,
    );
  }
  return true;
}
