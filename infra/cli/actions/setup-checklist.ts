import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { repositoryUrl } from '../../lib/deploy/repository-key';
import { defaultRule, ENVIRONMENTS_FILE, parseEnvironmentsFile } from '../../lib/deploy/target';
import { actionLabel } from '../../lib/operator-actions';
import { runtimeSecrets } from '../../lib/runtime-secrets';
import { resolveOperatorIdentity } from '../../lib/scaleway/operator-identity';
import { createSecretManagerClient } from '../../lib/scaleway/scaleway-secret-manager';
import { RUNTIME_FOLDER } from '../../lib/scaleway/secret-paths';
import { detectComputeDeferred, detectStackState, type StackState } from '../../lib/stack/bootstrap-stack-state';
import { checkMark, pc } from '../../lib/utils/cli-output';
import { infraDir } from '../../lib/utils/paths';
import { installedPulumiVersion } from '../../lib/utils/pulumi-version';
import { rememberedOperatorKey } from '../session';
import type { InfraContext } from '../shared';

/** The repository root, where git and the root `package.json` are read. */
export const repoRoot = join(infraDir, '..');

const RELEASE_TAG = /^\d+\.\d+\.\d+$/;

/** What the launch checklist ticks, read from this checkout, this machine and, with an operator key, the account. */
export interface ChecklistFacts {
  /** The installed Pulumi CLI's version; undefined when it is missing. */
  pulumi?: string;
  dockerBuildx: boolean;
  /** The https URL the root `package.json` names; undefined when it names none. */
  repository?: string;
  /** Empty when the app config sets no domain. */
  domain: string;
  hasCiKey: boolean;
  stackState: StackState;
  /** The first provisioning started and has not finished: the stack file still carries its marker. */
  firstProvisioning: boolean;
  stackFile: 'untracked' | 'modified' | 'committed' | 'pushed' | 'missing';
  /** The newest release tag in this checkout. */
  releaseTag?: string;
  /** The target the environments file gives this environment, such as `branch:main`; undefined without a line. */
  environmentsTarget?: string;
  /** Undefined when not read: no operator key in the session, or Secret Manager did not answer. */
  adminEmailSet?: boolean;
  mode: string;
}

export interface ChecklistRow {
  title: string;
  /** Undefined when the fact is not known, or cannot be yet. */
  done: boolean | undefined;
  detail: string;
  /** The first row not done: where the setup is. */
  now?: boolean;
}

function toolsDetail(facts: ChecklistFacts): string {
  const pulumi = facts.pulumi ? `pulumi ${facts.pulumi.split('.').slice(0, 2).join('.')}` : 'pulumi missing';
  return `${pulumi} · ${facts.dockerBuildx ? 'docker buildx' : 'docker buildx missing'}`;
}

function firstReleaseRow(facts: ChecklistFacts): ChecklistRow {
  if (defaultRule(facts.mode)?.kind === 'releases') {
    return {
      title: 'First release',
      done: Boolean(facts.releaseTag),
      detail: facts.releaseTag ? `${facts.releaseTag} published` : 'merge the release PR',
    };
  }
  const target = facts.environmentsTarget;
  return {
    title: 'First release',
    done: Boolean(target),
    detail: target ? `deploys ${target}` : `add '${facts.mode} branch:main' to ${ENVIRONMENTS_FILE}`,
  };
}

function firstAdminDetail(done: boolean | undefined): string {
  if (done) return 'admin email set: request a magic link with it';
  if (done === false) return `set the admin email in "${actionLabel('secrets')}"`;
  return 'the email the first account signs in with';
}

/** The checklist's rows from its facts, the first row not done marked `now`. Pure, so every rule is tested on a table. */
export function checklistRows(facts: ChecklistFacts): ChecklistRow[] {
  const created = facts.stackState === 'bootstrapped' && !facts.firstProvisioning;
  const adminDone = created ? facts.adminEmailSet : undefined;
  const rows: ChecklistRow[] = [
    { title: 'Tools', done: Boolean(facts.pulumi) && facts.dockerBuildx, detail: toolsDetail(facts) },
    {
      title: 'Repository',
      done: Boolean(facts.repository),
      detail: facts.repository?.replace(/^https:\/\//, '').replace(/\.git$/, '') ?? "set 'repository' in the root package.json",
    },
    { title: 'Domain', done: facts.domain !== '', detail: facts.domain || 'no domain in the app config' },
    { title: 'Sign in', done: facts.hasCiKey, detail: facts.hasCiKey ? 'deploy keys made' : 'account owner, once, for setup' },
    { title: 'Create', done: created, detail: 'database, network, load balancer' },
    {
      title: 'Connect',
      done: facts.stackFile === 'pushed',
      detail: facts.stackFile === 'pushed' ? `infra/Pulumi.${facts.mode}.yaml pushed` : 'commit and push the stack file',
    },
    firstReleaseRow(facts),
    { title: 'First admin', done: adminDone, detail: firstAdminDetail(adminDone) },
  ];
  const now = rows.find((row) => row.done === false);
  if (now) now.now = true;
  return rows;
}

const NOW = '← now';

/** The checklist as printed lines: a heading with the app, the environment and the count, then a row per step. */
export function formatChecklist(rows: ChecklistRow[], opts: { appSlug: string; mode: string }): string[] {
  const detailWidth = Math.max(...rows.map((row) => row.detail.length));
  const rowWidth = 20 + detailWidth + 3 + NOW.length;
  const where = `${opts.appSlug} · ${opts.mode}`;
  const count = `${rows.filter((row) => row.done === true).length} of ${rows.length} done`;
  const gap = ' '.repeat(Math.max(2, rowWidth - 20 - where.length - count.length));
  const lines = [`  ${pc.bold('Launch checklist')}  ${pc.dim(where)}${gap}${count}`, ''];
  for (const row of rows) {
    const mark = row.done ? checkMark : row.now ? pc.cyan('●') : pc.dim('○');
    const detail = row.done || row.now ? row.detail : pc.dim(row.detail);
    const now = row.now ? `${' '.repeat(detailWidth - row.detail.length + 3)}${pc.cyan(NOW)}` : '';
    lines.push(`  ${mark} ${row.title.padEnd(15)} ${detail}${now}`);
  }
  return lines;
}

/** A git command's output in the repository, trimmed; undefined when git fails. */
export function gitOutput(args: string[]): string | undefined {
  const result = spawnSync('git', args, { cwd: repoRoot, encoding: 'utf8' });
  return result.status === 0 ? result.stdout.trim() : undefined;
}

/** Where a file stands in git: untracked, changed, committed, or committed and on the upstream (a branch with none counts as committed). */
export function gitFileState(file: string): ChecklistFacts['stackFile'] {
  if (!existsSync(join(repoRoot, file))) return 'missing';
  const status = spawnSync('git', ['status', '--porcelain', '--', file], { cwd: repoRoot, encoding: 'utf8' }).stdout ?? '';
  // An ignored file shows no status either: only one git tracks can be committed or pushed.
  if (status.startsWith('??') || !gitOutput(['ls-files', '--', file])) return 'untracked';
  if (status.trim() !== '') return 'modified';
  return gitOutput(['log', '@{u}..HEAD', '--oneline', '--', file]) === '' ? 'pushed' : 'committed';
}

/** The newest release tag in this checkout, read locally. */
export function newestReleaseTag(): string | undefined {
  const tags = (gitOutput(['tag', '-l']) ?? '').split('\n').filter((tag) => RELEASE_TAG.test(tag));
  return tags.sort((a, b) => a.localeCompare(b, undefined, { numeric: true })).at(-1);
}

/** The target this checkout's environments file gives an environment; undefined without a line or when the file does not parse. */
export function environmentsTarget(environment: string): string | undefined {
  const path = join(repoRoot, ENVIRONMENTS_FILE);
  try {
    const rule = parseEnvironmentsFile(existsSync(path) ? readFileSync(path, 'utf8') : '').get(environment)?.rule;
    if (!rule) return undefined;
    return rule.kind === 'branch' ? `branch:${rule.branch}` : rule.kind === 'pin' ? rule.ref : 'releases';
  } catch {
    return undefined;
  }
}

/** The repository's default branch as the remote names it, `main` when the checkout does not know it. */
export function defaultBranch(): string {
  return gitOutput(['symbolic-ref', '--short', 'refs/remotes/origin/HEAD'])?.replace(/^origin\//, '') || 'main';
}

async function readAdminEmailSet(context: InfraContext, stackState: StackState): Promise<boolean | undefined> {
  const key = resolveOperatorIdentity().observer ?? rememberedOperatorKey();
  const secretName = runtimeSecrets.find((secret) => secret.id === 'adminEmail')?.secretName;
  if (!key || !secretName || stackState === 'fresh' || !context.projectId) return undefined;
  const client = createSecretManagerClient({ secretKey: key.secretKey, region: context.appConfig.s3.region, projectId: context.projectId });
  return client.getSecretByName(secretName, RUNTIME_FOLDER).then(
    (secret) => (secret?.version_count ?? 0) > 0,
    () => undefined,
  );
}

/** Read the checklist's facts. The stack file is read again, as a setup earlier in this run changes it. */
export async function collectChecklistFacts(context: InfraContext): Promise<ChecklistFacts> {
  const mode = context.environment;
  const stackYaml = existsSync(context.stackPath) ? readFileSync(context.stackPath, 'utf8') : undefined;
  const stackState = detectStackState({ yamlText: stackYaml });
  let repository: string | undefined;
  try {
    repository = repositoryUrl(repoRoot);
  } catch {
    repository = undefined;
  }
  return {
    pulumi: installedPulumiVersion(),
    dockerBuildx: spawnSync('docker', ['buildx', 'version'], { stdio: 'ignore' }).status === 0,
    repository,
    domain: context.appConfig.domain,
    hasCiKey: context.hasCiKey || stackState === 'bootstrapped',
    stackState,
    firstProvisioning: Boolean(detectComputeDeferred(stackYaml)),
    stackFile: gitFileState(`infra/Pulumi.${mode}.yaml`),
    releaseTag: newestReleaseTag(),
    environmentsTarget: environmentsTarget(mode),
    adminEmailSet: await readAdminEmailSet(context, stackState),
    mode,
  };
}

/** Read the facts and print the launch checklist. */
export async function printLaunchChecklist(context: InfraContext): Promise<void> {
  const rows = checklistRows(await collectChecklistFacts(context));
  console.info(`\n${formatChecklist(rows, { appSlug: context.appConfig.appSlug, mode: context.environment }).join('\n')}\n`);
}
