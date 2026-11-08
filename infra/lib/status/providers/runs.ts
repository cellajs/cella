import { commandOf, isScheduledRun, type JobDefinitionFacts, type JobRun, runEnded } from '../../deploy/job-runs';
import { mainJobOutcome } from '../../deploy/main-job';
import { type Growth, type RunRecord, rewriteNote } from '../../deploy/run-record';
import { bucketRunStore } from '../../deploy/run-store';
import { deriveInfra } from '../../naming';
import { actionCommand } from '../../operator-actions';
import { makeS3Client, projectAccessKey } from '../../scaleway/s3-client';
import { leaseHeldByRun } from '../../stack/control-store';
import { errorMessage } from '../../utils/errors';
import { type CheckBuilder, check, probed } from '../check';
import type { Check, LockFacts, ProbeSession, StatusProvider } from '../types';

/**
 * The main job's newest runs and its definition, none and undefined when the environment has none yet, the newest record as read by its
 * first version (`denied` until an apply lets the observer read versions, or the error that stopped the read), and the lease.
 */
export type RunsFacts = {
  runs: JobRun[];
  definition?: JobDefinitionFacts;
  record?: Growth<RunRecord> | { denied: true } | { error: string };
  lock?: LockFacts;
};

/** True for the bucket refusing the key: the policy an apply writes admits the observer's version reads. */
function accessDenied(error: unknown): boolean {
  const { name, $metadata } = error as { name?: string; $metadata?: { httpStatusCode?: number } };
  return name === 'AccessDenied' || $metadata?.httpStatusCode === 403;
}

/** The newest record read on the session's key, or why it was not; undefined without a key or before the first record. */
async function newestRecord(session: ProbeSession): Promise<RunsFacts['record']> {
  if (!session.accessKey || !session.secretKey || !session.projectId) return undefined;
  try {
    const { naming } = deriveInfra(session.appConfig);
    const s3 = await makeS3Client(session.appConfig.s3.region, projectAccessKey(session.accessKey, session.projectId), session.secretKey);
    const store = bucketRunStore(s3, naming.bootDiagBucket);
    const [run] = await store.listRuns(1);
    return run ? await store.readRecord(run) : undefined;
  } catch (error) {
    return accessDenied(error) ? { denied: true } : { error: errorMessage(error) };
  }
}

/** The values every start by hand sets: the target and the retry counter. */
const START_VALUES = new Set(['TARGET_SHA', 'RETRY']);

/**
 * What a run was started with beyond the target and the retry counter (D-b): a value the definition does not set, another value for one it
 * sets, or a startup command or arguments of its own. The schedule sets none, and a rotation, an apply and Deploy now the two only, so anything
 * else is a key holder's own start, which no check inside the job can stop. A run started before the definition's last change ran the values
 * and command of that time, a key the apply removed included, so nothing is compared for it. Empty for a run started as the engine starts one.
 */
export function runOverrides(run: JobRun, definition: JobDefinitionFacts): string[] {
  const sameDefinition = !definition.updatedAt || Date.parse(run.created_at ?? '') >= Date.parse(definition.updatedAt);
  if (!sameDefinition) return [];
  const own: string[] = [];
  for (const [name, value] of Object.entries(run.environment_variables ?? {})) {
    if (START_VALUES.has(name)) continue;
    if (!(name in definition.env)) own.push(`sets ${name}`);
    else if (definition.env[name] !== value) own.push(`sets ${name} to another value`);
  }
  const command = commandOf(run);
  if (command && definition.command && command !== definition.command) own.push('runs its own command');
  return own;
}

/** A deploy's end, as its record says it, or a hand start's job run that wrote none. */
function deployVerdict(runs: CheckBuilder, sha: string, outcome: RunRecord['outcome'] | ReturnType<typeof mainJobOutcome>, state: string): Check {
  if (outcome === 'running') return runs.ok(`${sha} is deploying`);
  if (outcome === 'deployed' || outcome === 'unchanged') return runs.ok(`deployed ${sha}`);
  if (outcome === 'blocked' || outcome === 'apply needed') {
    return runs.warn(`${sha} is blocked: its record names what is owed, an identity update, an apply or a secret`, {
      description: 'Read what is owed; the apply or storing the secret starts this target again, start-deploy after an identity update',
      command: actionCommand('runs'),
    });
  }
  return runs.error(`${sha} failed (${state})`, { description: 'Read how it ended', command: actionCommand('runs') });
}

/**
 * How the environment's last deploy went: the newest record, or a run started by hand since that left none. A record that says running
 * is deploying while a deploy holds the lease under its run, and was interrupted otherwise. A blocked one owes an identity update, an apply
 * or a secret, a failed one is read in Deploy logs.
 */
export const runsProvider: StatusProvider<RunsFacts> = {
  domain: 'runs',
  async gather(session) {
    if (session.stackState !== 'bootstrapped') return undefined;
    if (!session.scalewayKeyAvailable || !session.secretKey || !session.projectId) return undefined;
    const { mainJob, lock } = await session.scalewayFacts();
    if (mainJob === undefined) return undefined;
    if (mainJob === null) return { runs: [] };
    const record = await newestRecord(session);
    return { runs: mainJob.runs, definition: mainJob.definition, ...(record ? { record } : {}), ...(lock ? { lock } : {}) };
  },
  evaluate(facts, session) {
    if (session.stackState !== 'bootstrapped') return [];
    const runs = check('runs.last', 'Last deploy', 'scaleway');
    return [
      probed(runs, session.scalewayKeyAvailable, facts, "could not read the main job's runs", ({ runs: jobRuns, definition, record, lock }) => {
        const label = (run: JobRun) => run.environment_variables?.TARGET_SHA?.slice(0, 10) ?? `scheduled run ${run.id}`;
        const started = jobRuns.find((run) => definition && runOverrides(run, definition).length > 0);
        if (started && definition) {
          return runs.error(
            `${label(started)} was started with its own values (${runOverrides(started, definition).join(', ')}): no start of the engine does that`,
            { description: 'Read the run, then rotate the keys that may start one', command: actionCommand('runs') },
          );
        }
        if (record && 'denied' in record) {
          return runs.warn('the run records were not read, as the bucket admits no version read by the observer yet', {
            description: 'Review & apply changes writes the bucket policy that does',
            command: actionCommand('apply'),
          });
        }
        if (record && 'error' in record) {
          return runs.warn(`the newest run record could not be read (${record.error})`, {
            description: 'Read the run',
            command: actionCommand('runs'),
          });
        }
        const newest = record?.newest;
        if (record?.rewrite && newest) {
          return runs.error(`the record of run ${newest.run} was ${rewriteNote(record.rewrite)}: only a key that may write the bucket does that`, {
            description: 'Read the run as it stood, then rotate the keys',
            command: actionCommand('runs'),
          });
        }
        // A run started by hand after the newest record that wrote none: it runs still, or ended before its record.
        const unrecorded = jobRuns.find((run) => !isScheduledRun(run) && (!newest || (run.created_at ?? '') > newest.startedAt));
        if (unrecorded) {
          return deployVerdict(runs, label(unrecorded), runEnded(unrecorded) ? mainJobOutcome(unrecorded) : 'running', unrecorded.state);
        }
        if (!newest) return runs.ok('no deploy yet');
        const sha = newest.target.slice(0, 10);
        if (newest.outcome === 'running' && !leaseHeldByRun(lock, newest.run)) {
          return runs.error(`${sha} was interrupted: its record says running, and no deploy holds the lease under run ${newest.run}`, {
            description: 'Read how far it came; a scheduled run does not start this target again',
            command: actionCommand('runs'),
          });
        }
        return deployVerdict(runs, sha, newest.outcome, newest.outcome);
      }),
    ];
  },
};
