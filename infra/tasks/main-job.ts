import { spawnSync } from 'node:child_process';
import { MAIN_JOB_EXIT } from '../lib/deploy/main-job';
import { infraDir } from '../lib/utils/paths';

/** Run one infra task to its end, its output in the run's log; resolves to its exit code. */
export type RunTask = (script: string, args: string[]) => number;

const runTask: RunTask = (script, args) =>
  spawnSync('pnpm', ['--silent', 'run', script, ...args], { cwd: infraDir, stdio: 'inherit', env: process.env }).status ?? MAIN_JOB_EXIT.failed;

/**
 * One run of the main job, on the target commit's own engine (plan §3.5): the deploy of `TARGET_SHA` to `MODE`, the reap of the generation it
 * displaced included. Resolves to the run's exit code (lib/deploy/main-job.ts): deployed; blocked, when the deploy stopped on a privileged
 * change or a required secret the operator owes, which its record names; or failed.
 */
export function mainJob(env: NodeJS.ProcessEnv, run: RunTask = runTask): number {
  const mode = env.MODE;
  const sha = env.TARGET_SHA;
  if (!mode || !sha || !/^[0-9a-f]{40}$/.test(sha)) {
    console.error('The main job needs MODE and TARGET_SHA (a full commit id).');
    return MAIN_JOB_EXIT.failed;
  }
  console.info(`[main-job] ${mode}: ${sha} (retry ${env.RETRY ?? '0'})`);
  const deployed = run('deploy', ['--mode', mode, '--sha', sha]);
  if (deployed === MAIN_JOB_EXIT.blocked) {
    console.info('[main-job] blocked: the record names what is owed, an apply or a secret; settling it starts this target again');
    return MAIN_JOB_EXIT.blocked;
  }
  if (deployed !== MAIN_JOB_EXIT.deployed) return MAIN_JOB_EXIT.failed;
  console.info('[main-job] deployed');
  return MAIN_JOB_EXIT.deployed;
}

if (process.argv[1]?.endsWith('main-job.ts')) process.exit(mainJob(process.env));
