import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { defaultRule, ENVIRONMENTS_FILE, parseEnvironmentsFile } from '../../lib/deploy/target';
import { actionLabel } from '../../lib/operator-actions';
import { changeMark, checkMark, pc, warningMark } from '../../lib/utils/cli-output';
import { errorMessage } from '../../lib/utils/errors';
import { ActionEnded, confirmOrDefault, type InfraContext } from '../shared';
import { defaultBranch, environmentsTarget, gitFileState, gitOutput, newestReleaseTag, printLaunchChecklist, repoRoot } from './setup-checklist';
import { runStartDeploy } from './start-deploy';

/** Run one git command in the repository, printed dim first; git's output goes to the terminal. */
function runGit(args: string[]): boolean {
  console.info(pc.dim(`  git ${args.map((arg) => (arg.includes(' ') ? `"${arg}"` : arg)).join(' ')}`));
  return spawnSync('git', args, { cwd: repoRoot, stdio: 'inherit' }).status === 0;
}

/** Give an environment that deploys a branch its line in the environments file; false when it has one, or the file does not parse. */
function addEnvironmentsLine(environment: string, branch: string): boolean {
  if (defaultRule(environment)) return false;
  const path = join(repoRoot, ENVIRONMENTS_FILE);
  const text = existsSync(path) ? readFileSync(path, 'utf8') : '';
  try {
    if (parseEnvironmentsFile(text).has(environment)) return false;
  } catch (error) {
    console.warn(`${warningMark} ${errorMessage(error)}: ${environment} gets no line there.`);
    return false;
  }
  const line = `${environment} branch:${branch}`;
  writeFileSync(path, `${text}${text === '' || text.endsWith('\n') ? '' : '\n'}${line}\n`);
  console.info(`  ${changeMark} ${ENVIRONMENTS_FILE}: ${line}`);
  return true;
}

/**
 * Offer to commit the stack file, with the environments line of an environment that deploys a branch, and push it: every checkout and the
 * scheduled runs, which read the default branch, then see the environment set up. A stack file an earlier run committed is pushed as it is.
 * Off the default branch the commit reaches it through a pull request, so nothing is pushed.
 */
export async function connectRepository(environment: string): Promise<void> {
  const stackFile = `infra/Pulumi.${environment}.yaml`;
  const state = gitFileState(stackFile);
  if (state === 'pushed' || state === 'missing') return;
  const base = defaultBranch();
  const pullRequest = `The scheduled runs read ${base}: open a pull request, so this commit reaches it.`;
  const onBase = gitOutput(['branch', '--show-current']) === base;
  const reach = `so every checkout and the scheduled runs see ${environment} set up`;
  if (state === 'committed') {
    if (!onBase) console.info(`  ${pullRequest}`);
    else if (await confirmOrDefault({ message: `Push the commit of ${stackFile}, ${reach}?`, default: true })) pushToBase(base, pullRequest);
    return;
  }
  if (!(await confirmOrDefault({ message: `Commit ${stackFile} and push, ${reach}?`, default: true }))) return;
  const files = addEnvironmentsLine(environment, base) ? [stackFile, ENVIRONMENTS_FILE] : [stackFile];
  // The pathspec commits these files only, whatever else is staged.
  if (!runGit(['add', ...files]) || !runGit(['commit', '-m', `chore(infra): connect ${environment}`, '--', ...files])) {
    console.warn(`${warningMark} Not committed: commit ${files.join(' and ')} yourself.`);
    return;
  }
  if (onBase) pushToBase(base, pullRequest);
  else console.info(`  ${pullRequest}`);
}

/** Push the default branch, and say in a line when the remote refuses it. */
function pushToBase(base: string, pullRequest: string): void {
  console.info(pc.dim('  git push'));
  const push = spawnSync('git', ['push'], { cwd: repoRoot, encoding: 'utf8', stdio: ['inherit', 'pipe', 'pipe'] });
  if (push.status === 0) {
    console.info(`  ${checkMark} Pushed to ${base}.`);
    return;
  }
  const lastLine =
    `${push.stderr ?? ''}`
      .split('\n')
      .filter((line) => line.trim() && !line.startsWith('hint:'))
      .at(-1) ?? '';
  console.warn(`${warningMark} git push was refused: ${lastLine}`);
  console.info(`  ${pullRequest}`);
}

/**
 * The end of a setup of an environment that never deployed. Production deploys releases, so without one it waits for the first; with one,
 * or for an environment that deploys a branch, the setup offers the first deploy and follows it. The checklist closes it.
 */
export async function offerFirstDeploy(context: InfraContext): Promise<void> {
  const { environment } = context;
  const releases = defaultRule(environment)?.kind === 'releases';
  const target = releases ? newestReleaseTag() : environmentsTarget(environment)?.replace(/^branch:/, '');
  if (releases && !target) {
    console.info(
      `\n${checkMark} ${environment} is set up. Publish your first release: merge the release PR; the first scheduled run deploys it within a minute, and ${pc.cyan('pnpm infra')} shows how it went.`,
    );
  } else if (target && (await confirmOrDefault({ message: `Deploy ${target} now and follow it?`, default: true }))) {
    try {
      await runStartDeploy(context, { asked: true });
    } catch (error) {
      // A first deploy that ends blocked or failed is read in Deploy logs; the setup itself is done.
      if (!(error instanceof ActionEnded)) throw error;
      console.warn(`${warningMark} The first deploy did not end deployed: "${actionLabel('runs')}" says why. The setup itself is done.`);
    }
  }
  await printLaunchChecklist(context);
}
