import { spawnSync } from 'node:child_process';
import { MAIN_JOB_EXIT } from '../lib/deploy/main-job';
import { infraDir } from '../lib/utils/paths';

/** Run one infra task to its end, its output in the run's log; resolves to its exit code. */
export type RunTask = (script: string, args: string[]) => number;

const runTask: RunTask = (script, args) =>
  spawnSync('pnpm', ['--silent', 'run', script, ...args], { cwd: infraDir, stdio: 'inherit', env: process.env }).status ?? MAIN_JOB_EXIT.failed;

/**
 * One run of the main job, on the target commit's own engine (plan §3.5): the deploy of `TARGET_SHA` to `MODE`, then the reap of the
 * generation it displaced. Resolves to the run's exit code (lib/deploy/main-job.ts): deployed; blocked, when the deploy stopped on an owed
 * privileged change; or failed. A reap that fails fails the run too: the old machines it leaves can hold what the new ones need.
 */
export function mainJob(env: NodeJS.ProcessEnv, run: RunTask = runTask): number {
  const mode = env.MODE;
  const sha = env.TARGET_SHA;
  if (!mode || !sha || !/^[0-9a-f]{40}$/.test(sha)) {
    console.error('The main job needs MODE and TARGET_SHA (a full commit id).');
    return MAIN_JOB_EXIT.failed;
  }
  console.info(`[main-job] ${mode}: ${sha} (retry ${env.RETRY ?? '0'})`);
  const deployed = run('deploy', ['--mode', mode, '--sha', sha, '--defer-reap']);
  if (deployed === MAIN_JOB_EXIT.blocked) {
    console.info('[main-job] blocked: a privileged change is owed; an apply first, then this target again');
    return MAIN_JOB_EXIT.blocked;
  }
  if (deployed !== MAIN_JOB_EXIT.deployed) return MAIN_JOB_EXIT.failed;
  if (run('reap', ['--mode', mode, '--sha', sha]) !== 0) {
    console.error('[main-job] the target is live, and the reap of the displaced generation failed');
    return MAIN_JOB_EXIT.failed;
  }
  console.info('[main-job] deployed');
  return MAIN_JOB_EXIT.deployed;
}

if (process.argv[1]?.endsWith('main-job.ts')) process.exit(mainJob(process.env));
