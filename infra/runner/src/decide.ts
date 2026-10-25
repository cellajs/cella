import { type JobRun, runEnded } from '../../lib/deploy/job-runs.ts';
import type { Target } from '../../lib/deploy/target.ts';

/** What the runner does for one environment in one round. */
export type Decision = { action: 'start' } | { action: 'wait'; run: JobRun } | { action: 'none'; run: JobRun };

/**
 * Whether to start a run of the environment's main job for its target (plan §3.4, C17, D21). Scaleway's run list is the runner's memory: a
 * run's start values name its target and retry counter. A run in progress waits; a target and counter that have a run are not started again
 * by the runner, however that run ended: deployed is done, failed waits for a change in git, blocked is started again by the operator's apply.
 */
export function decide(target: Pick<Target, 'sha' | 'retry'>, runs: readonly JobRun[]): Decision {
  const inProgress = runs.find((run) => !runEnded(run));
  if (inProgress) return { action: 'wait', run: inProgress };
  const done = runs.find(
    (run) => run.environment_variables?.TARGET_SHA === target.sha && (run.environment_variables?.RETRY ?? '0') === String(target.retry),
  );
  return done ? { action: 'none', run: done } : { action: 'start' };
}
