import { DEPLOY_OPERATION, type LockInfo, leaseHolder, leaseOwnerOfRun } from '../stack/control-store';
import { type RunRecord, RunRecorder, runId, runStamp } from './run-record';
import { ENVIRONMENTS_FILE, NoReleaseError, parseEnvironmentsFile, type RemoteRef, resolveTarget, type Target } from './target';

/** What a scheduled run does with its target: deploy it, or nothing, as a record of that target and retry counter exists. */
export type ScheduledDecision = { action: 'deploy' } | { action: 'none'; record: RunRecord };

/**
 * Whether a scheduled run deploys its target. The run records are the schedule's memory: a target and retry counter that have a record are
 * not deployed again by a scheduled run, however that run ended: deployed is done, failed waits for a change in git, blocked waits for the
 * operator who clears the block. A record the bucket no longer keeps (60 days) is no run, so its target deploys again.
 */
export function decideScheduledRun(target: Pick<Target, 'sha' | 'retry'>, records: readonly RunRecord[]): ScheduledDecision {
  const record = records.find((candidate) => candidate.target === target.sha && (candidate.retry ?? 0) === target.retry);
  return record ? { action: 'none', record } : { action: 'deploy' };
}

/** The lease and the reads a scheduled run makes, each on the deploy key or the repository read key. */
export interface ScheduledEffects {
  /** Take the environment's lease under `owner` and `operation`; the holder when another holds it. */
  takeLease(owner: string, operation: string): Promise<LockInfo | undefined>;
  /** Give the lease to another owner and operation; false when it is no longer `from`'s. */
  handOverLease(from: string, to: string, operation: string): Promise<boolean>;
  releaseLease(owner: string): Promise<void>;
  /** The environments file at the head of the default branch. */
  environmentsFile(): Promise<string>;
  listRemote(patterns: string[]): Promise<RemoteRef[]>;
  /** The records of the runs that deployed a commit, by the commit their ids name. */
  records(sha: string): Promise<RunRecord[]>;
  writeRecord(record: RunRecord): Promise<void>;
}

/** A target to deploy as `run`, under the lease the run holds, with the refs that found it: the release check reads them again. */
export interface ScheduledDeploy {
  deploy: Target;
  run: string;
  refs: RemoteRef[];
}

/**
 * A scheduled run's verdict, under the environment's lease, which it takes before any read: one run looks at a time, so two never deploy
 * one target. A lease another holds ends it at once, as that holder is a deploy or an operator action. A target to deploy keeps the lease,
 * handed to the deploy's run, and has its record opened, `running`, so a deploy that dies before its own write still leaves the target a
 * record; any other end releases the lease with the one line that says why it starts nothing.
 * @param started the run's start, to the second: the record's start and the stamp of its id.
 * @throws when the environments file or the repository cannot be read, or the lease went to another run meanwhile.
 */
export async function scheduledVerdict(environment: string, fx: ScheduledEffects, started: Date): Promise<ScheduledDeploy | { done: string }> {
  const looking = leaseOwnerOfRun(runStamp(started));
  const held = await fx.takeLease(looking, 'scheduled run');
  if (held) return { done: `${leaseHolder(held)} holds the lease` };
  let owner = looking;
  let kept = false;
  try {
    const refs: RemoteRef[] = [];
    const listRemote = async (patterns: string[]) => {
      const listed = await fx.listRemote(patterns);
      refs.push(...listed);
      return listed;
    };
    const line = parseEnvironmentsFile(await fx.environmentsFile()).get(environment);
    const target = await resolveTarget({ environment, line, listRemote }).catch((error: unknown) => {
      if (error instanceof NoReleaseError) return null;
      throw error;
    });
    if (target === null) return { done: 'no release yet: starts nothing' };
    if (!target) return { done: `no line in ${ENVIRONMENTS_FILE}: starts nothing` };
    const decision = decideScheduledRun(target, await fx.records(target.sha));
    if (decision.action === 'none') {
      return {
        done: `${target.sha.slice(0, 10)} (${target.source}, retry ${target.retry}): has run ${decision.record.run}, ${decision.record.outcome}`,
      };
    }
    const run = runId(target.sha, started);
    if (!(await fx.handOverLease(looking, leaseOwnerOfRun(run), DEPLOY_OPERATION))) {
      throw new Error('the lease went to another run while this one looked for its target');
    }
    owner = leaseOwnerOfRun(run);
    // Without the record the next scheduled run would deploy the target again, so a write that fails deploys nothing.
    await fx.writeRecord(new RunRecorder({ run, environment, target: target.sha, retry: target.retry, now: started }).record());
    kept = true;
    return { deploy: target, run, refs };
  } finally {
    if (!kept) await fx.releaseLease(owner);
  }
}
