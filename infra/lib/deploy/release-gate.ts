import { type SpawnSyncReturns, spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pc, sleep, warningMark } from '../utils/cli-output';
import { errorMessage } from '../utils/errors';
import { isRecord } from '../utils/guards';
import { infraDir } from '../utils/paths';
import { repositoryUrl } from './repository-key';
import { defaultRule, ENVIRONMENTS_FILE, parseEnvironmentsFile } from './target';

/** The release PR's head branches, as release-please names them. */
const RELEASE_BRANCH_PREFIX = 'release-please--branches--';

/** The CI job (.github/workflows/ci.yml) that holds the release PR against the applied description. */
const GATE_JOB = 'release-applied';

/** How long an apply waits for the release PR's CI run to end before the check runs again: GitHub reruns no job of a run in progress. */
const RUN_WAIT_MS = 20 * 60_000;
const RUN_POLL_MS = 15_000;

/** The repository variable holding the description hash the environment's last apply recorded, which the release PR's check reads. */
export function appliedDescriptionVariable(environment: string): string {
  return `INFRA_APPLIED_DESCRIPTION_${environment.toUpperCase().replaceAll('-', '_')}`;
}

/** Whether merging the release PR deploys to the environment: its line in the environments file, or its default, follows the releases. */
export function followsReleases(environment: string, root = join(infraDir, '..')): boolean {
  const line = parseEnvironmentsFile(readFileSync(join(root, ENVIRONMENTS_FILE), 'utf8')).get(environment);
  return (line?.rule ?? defaultRule(environment))?.kind === 'releases';
}

/** `owner/name` of the repository `gh` addresses, from the root package.json. */
const repositoryName = (root?: string): string => new URL(repositoryUrl(root)).pathname.replace(/^\//, '').replace(/\.git$/, '');

/** One `gh` call against the repository. */
const gh = (repo: string, ...args: string[]): SpawnSyncReturns<string> =>
  spawnSync('gh', [...args, '--repo', repo], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });

/** The first line a failed `gh` call said. */
const saidFirst = (run: SpawnSyncReturns<string>): string => (run.error?.message ?? run.stderr ?? '').trim().split('\n')[0] ?? '';

/** What `gh --json` printed, parsed; undefined when it printed none. */
function printed(stdout: string | undefined): unknown {
  try {
    return JSON.parse(stdout ?? '');
  } catch {
    return undefined;
  }
}

/** The records `gh --json` printed: a list, or a run's `jobs`. */
function records(stdout: string | undefined): Record<string, unknown>[] {
  const value = printed(stdout);
  const list = isRecord(value) && Array.isArray(value.jobs) ? value.jobs : value;
  return Array.isArray(list) ? list.filter(isRecord) : [];
}

/**
 * Tell GitHub, through the operator's own `gh`, the description an apply recorded: the release PR's check holds the release against this
 * variable, as GitHub holds no Scaleway key to read `applied.json` with. Never throws: without `gh`, or when GitHub refuses, it prints the
 * command that publishes the hash by hand.
 */
export function publishAppliedDescription(environment: string, descriptionHash: string): void {
  const name = appliedDescriptionVariable(environment);
  let repo: string;
  try {
    repo = repositoryName();
  } catch (error) {
    console.warn(`${warningMark} GitHub holds no applied description of ${environment}: ${errorMessage(error)}.`);
    return;
  }
  const set = gh(repo, 'variable', 'set', name, '--body', descriptionHash);
  if (set.status !== 0) {
    console.warn(
      `${warningMark} GitHub holds no applied description of ${environment} (${saidFirst(set)}), so the release PR's check stays red: \`gh variable set ${name} --repo ${repo} --body ${descriptionHash}\` publishes it.`,
    );
    return;
  }
  console.info(pc.dim(`  ${repo} variable ${name} holds this description, which the release PR's check compares with.`));
}

/**
 * Run the failed check of an open release PR again, once its CI run has ended: GitHub reruns no job of a run in progress, and the run that
 * found the description unpublished is often still on its test jobs when the apply ends. The apply calls this last, so the wait, up to
 * {@link RUN_WAIT_MS}, holds nothing else up. Never throws; when it cannot rerun, it says the command that does.
 * @param root the checkout whose `package.json` names the repository
 */
export async function rerunReleaseCheck(root?: string): Promise<void> {
  let repo: string;
  try {
    repo = repositoryName(root);
  } catch {
    return;
  }
  const heads = records(gh(repo, 'pr', 'list', '--state', 'open', '--json', 'headRefName,headRefOid').stdout).filter(
    (pr) => typeof pr.headRefName === 'string' && pr.headRefName.startsWith(RELEASE_BRANCH_PREFIX),
  );
  for (const { headRefOid } of heads) {
    if (typeof headRefOid !== 'string') continue;
    const [run] = records(
      gh(repo, 'run', 'list', '--workflow', 'ci.yml', '--commit', headRefOid, '--limit', '1', '--json', 'databaseId,status').stdout,
    );
    if (typeof run?.databaseId !== 'number') continue;
    const runId = String(run.databaseId);
    const job = records(gh(repo, 'run', 'view', runId, '--json', 'jobs').stdout).find(
      (found) => found.name === GATE_JOB && found.conclusion === 'failure',
    );
    if (typeof job?.databaseId !== 'number') continue;
    const byHand = `\`gh run rerun --job ${job.databaseId} --repo ${repo}\` runs the check again by hand`;
    if (run.status !== 'completed') {
      console.info(
        pc.dim(
          `  The release PR's CI run is still in progress: its ${GATE_JOB} check runs again once the run ends. Ctrl-C skips the wait; ${byHand}.`,
        ),
      );
      if (!(await runEnded(repo, runId))) {
        console.warn(`${warningMark} The release PR's CI run is still in progress after ${RUN_WAIT_MS / 60_000} minutes; once it ends, ${byHand}.`);
        continue;
      }
    }
    // A job runs again with the jobs that need it, so `ci-passed` follows.
    const rerun = gh(repo, 'run', 'rerun', '--job', String(job.databaseId));
    console.info(
      rerun.status === 0
        ? pc.dim(`  The release PR's ${GATE_JOB} check runs again.`)
        : `${warningMark} The release PR's ${GATE_JOB} check did not start again (${saidFirst(rerun)}); ${byHand}.`,
    );
  }
}

/** Whether the run ended within the wait, polling its status. */
async function runEnded(repo: string, runId: string): Promise<boolean> {
  const until = Date.now() + RUN_WAIT_MS;
  while (Date.now() < until) {
    await sleep(RUN_POLL_MS);
    const view = printed(gh(repo, 'run', 'view', runId, '--json', 'status').stdout);
    if (isRecord(view) && view.status === 'completed') return true;
  }
  return false;
}
