import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pc, warningMark } from '../utils/cli-output';
import { errorMessage } from '../utils/errors';
import { isRecord } from '../utils/guards';
import { infraDir } from '../utils/paths';
import { repositoryUrl } from './repository-key';
import { defaultRule, ENVIRONMENTS_FILE, parseEnvironmentsFile } from './target';

/** The release PR's head branches, as release-please names them. */
const RELEASE_BRANCH_PREFIX = 'release-please--branches--';

/** The CI job (.github/workflows/ci.yml) whose run on the release PR holds the release against the applied description. */
const GATE_JOB = 'privileged-changes';

/** The repository variable holding the description hash the environment's last apply recorded, which the release PR's check reads. */
export function appliedDescriptionVariable(environment: string): string {
  return `INFRA_APPLIED_DESCRIPTION_${environment.toUpperCase().replaceAll('-', '_')}`;
}

/** Whether merging the release PR deploys to the environment: its line in the environments file, or its default, follows the releases. */
export function followsReleases(environment: string, root = join(infraDir, '..')): boolean {
  const line = parseEnvironmentsFile(readFileSync(join(root, ENVIRONMENTS_FILE), 'utf8')).get(environment);
  return (line?.rule ?? defaultRule(environment))?.kind === 'releases';
}

/** Parse what `gh --json` printed into its records, or none. */
function records(stdout: string | undefined): Record<string, unknown>[] {
  try {
    const parsed: unknown = JSON.parse(stdout ?? '');
    const list = isRecord(parsed) && Array.isArray(parsed.jobs) ? parsed.jobs : parsed;
    return Array.isArray(list) ? list.filter(isRecord) : [];
  } catch {
    return [];
  }
}

/**
 * Tell GitHub, through the operator's own `gh`, the description an apply recorded, and run a failed check of an open release PR again: the
 * check holds the release against this variable, as GitHub holds no Scaleway key to read `applied.json` with. Never throws: without `gh`,
 * or when GitHub refuses, it prints the command that publishes the hash by hand.
 */
export function publishAppliedDescription(environment: string, descriptionHash: string): void {
  const name = appliedDescriptionVariable(environment);
  let repo: string;
  try {
    repo = new URL(repositoryUrl()).pathname.replace(/^\//, '').replace(/\.git$/, '');
  } catch (error) {
    console.warn(`${warningMark} GitHub holds no applied description of ${environment}: ${errorMessage(error)}.`);
    return;
  }
  const gh = (...args: string[]) => spawnSync('gh', [...args, '--repo', repo], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  const set = gh('variable', 'set', name, '--body', descriptionHash);
  if (set.status !== 0) {
    const reason = (set.error?.message ?? set.stderr ?? '').trim().split('\n')[0];
    console.warn(
      `${warningMark} GitHub holds no applied description of ${environment} (${reason}), so the release PR's check stays red: \`gh variable set ${name} --repo ${repo} --body ${descriptionHash}\` publishes it.`,
    );
    return;
  }
  console.info(pc.dim(`  ${repo} variable ${name} holds this description, which the release PR's check compares with.`));

  const heads = records(gh('pr', 'list', '--state', 'open', '--json', 'headRefName,headRefOid').stdout).filter(
    (pr) => typeof pr.headRefName === 'string' && pr.headRefName.startsWith(RELEASE_BRANCH_PREFIX),
  );
  for (const { headRefOid } of heads) {
    if (typeof headRefOid !== 'string') continue;
    const [run] = records(gh('run', 'list', '--workflow', 'ci.yml', '--commit', headRefOid, '--limit', '1', '--json', 'databaseId').stdout);
    if (typeof run?.databaseId !== 'number') continue;
    const job = records(gh('run', 'view', String(run.databaseId), '--json', 'jobs').stdout).find(
      (found) => found.name === GATE_JOB && found.conclusion === 'failure',
    );
    if (typeof job?.databaseId !== 'number') continue;
    // A job runs again with the jobs that need it, so `ci-passed` follows.
    const rerun = gh('run', 'rerun', '--job', String(job.databaseId));
    console.info(
      rerun.status === 0
        ? pc.dim(`  The release PR's ${GATE_JOB} check runs again.`)
        : `${warningMark} The release PR's ${GATE_JOB} check did not start again (${(rerun.stderr ?? '').trim().split('\n')[0]}): rerun it on GitHub.`,
    );
  }
}
