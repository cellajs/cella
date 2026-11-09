import { confirm } from '@inquirer/prompts';
import { classifyRun } from '../../lib/deploy/failure-class';
import { commitRefs } from '../../lib/deploy/git-remote';
import { type JobRun, readJobRun, runEnded, startJobRun } from '../../lib/deploy/job-runs';
import { readLiveRecord } from '../../lib/deploy/live-record';
import { mainJobOutcome } from '../../lib/deploy/main-job';
import { type RunOutcome, type RunRecord, stepLine, wroteRecord } from '../../lib/deploy/run-record';
import { bucketRunStore, type RunStore } from '../../lib/deploy/run-store';
import { commitName } from '../../lib/deploy/target';
import { machineRoles } from '../../lib/machine-roles';
import { deriveInfra } from '../../lib/naming';
import { actionCommand } from '../../lib/operator-actions';
import type { KeyPair } from '../../lib/scaleway/operator-identity';
import { makeS3Client, stateKeyOf } from '../../lib/scaleway/s3-client';
import { type LockInfo, leaseDeploys, leaseHeldByRun, lockKey, makeControlClient, peekLock } from '../../lib/stack/control-store';
import { checkMark, crossMark, pc, sleep, warningMark } from '../../lib/utils/cli-output';
import { autoAcceptDefaults, type InfraContext, stackNameFor } from '../shared';

const POLL_MS = 5_000;
const MAX_TRIES = 3;

/** How a followed deploy ended, for the caller: as the main job reports it. */
export type FollowOutcome = ReturnType<typeof mainJobOutcome>;

/** The run store and the control client of the environment, on a key the bucket admits: the observer's for reading, the operator's for both. */
async function deployStores(
  context: InfraContext,
  key: KeyPair,
): Promise<{ store: RunStore; control: Awaited<ReturnType<typeof makeControlClient>>; bucket: string }> {
  const state = stateKeyOf(key, context.projectId);
  const { naming } = deriveInfra(context.appConfig);
  const [s3, control] = await Promise.all([
    makeS3Client(context.appConfig.s3.region, state.accessKey, state.secretKey),
    makeControlClient(context.appConfig.s3.region, state.accessKey, state.secretKey),
  ]);
  return { store: bucketRunStore(s3, naming.bootDiagBucket), control, bucket: naming.bootDiagBucket };
}

/** The commit the environment runs: the primary role's in the live record, none before the first deploy. */
export async function liveCommit(context: InfraContext, key: KeyPair): Promise<string | undefined> {
  const { appConfig, projectId } = context;
  const primary = machineRoles(appConfig).find((role) => role.primary);
  if (!primary) return undefined;
  const state = stateKeyOf(key, projectId);
  const s3 = await makeControlClient(appConfig.s3.region, state.accessKey, state.secretKey);
  const { record } = await readLiveRecord(s3, deriveInfra(appConfig).naming.bootDiagBucket, stackNameFor(context));
  return record.roles[primary.role]?.commit;
}

/** This run's record: the one it names once found, else the newest of the last three that the run wrote. */
async function recordOf(store: RunStore, run: JobRun, sha: string, found: string | undefined): Promise<RunRecord | undefined> {
  if (found) return (await store.readRecord(found))?.newest;
  for (const id of await store.listRuns(3)) {
    const reading = await store.readRecord(id);
    if (reading && wroteRecord(run, sha, reading.newest)) return reading.newest;
  }
  return undefined;
}

/** Print the steps a record gained since `shown` were printed; resolves to how many are printed now. */
function printNewSteps(record: RunRecord | undefined, shown: number): number {
  for (const step of record?.steps.slice(shown) ?? []) console.info(stepLine(step));
  return record?.steps.length ?? shown;
}

/**
 * Follow a run started by hand until it ends: its job state until its record appears, then each step once it completes. A record that
 * cannot be read this time is read again at the next poll.
 */
async function followRun(
  auth: { secretKey: string },
  region: string,
  store: RunStore,
  sha: string,
  started: JobRun,
): Promise<{ run: JobRun; record?: RunRecord }> {
  let run = started;
  let record: RunRecord | undefined;
  let shownState = '';
  let shownSteps = 0;
  for (;;) {
    if (!record && !runEnded(run) && run.state !== shownState) console.info(`  ${pc.dim(new Date().toISOString().slice(11, 19))} ${run.state}`);
    shownState = run.state;
    record = (await recordOf(store, run, sha, record?.run).catch(() => undefined)) ?? record;
    shownSteps = printNewSteps(record, shownSteps);
    if (runEnded(run)) return { run, record };
    await sleep(POLL_MS);
    run = await readJobRun(auth, { region, runId: run.id });
  }
}

/** The outcome a record alone says, for a deploy followed without its job run. */
function recordOutcome(outcome: RunOutcome): FollowOutcome {
  if (outcome === 'deployed' || outcome === 'unchanged') return 'deployed';
  if (outcome === 'blocked' || outcome === 'apply needed') return 'blocked';
  return 'failed';
}

/**
 * Say how a deploy ended: the release that serves, the one action a blocked run owes, or whose side a failure is on and what the users get
 * meanwhile. `fallback` is the sentence for a run that left no record.
 * @returns the failure's class when the run failed with a record, for a retry offer
 */
async function reportEnd(
  context: InfraContext,
  key: KeyPair,
  outcome: FollowOutcome,
  sha: string,
  record: RunRecord | undefined,
  fallback: string,
): Promise<ReturnType<typeof classifyRun> | undefined> {
  const verdict = record && record.outcome !== 'running' ? classifyRun(record) : undefined;
  if (outcome === 'deployed') {
    console.info(`${checkMark} ${context.environment} runs ${commitName(await commitRefs(), sha)}`);
    return undefined;
  }
  if (outcome === 'blocked') {
    if (!verdict) {
      console.warn(
        `${warningMark} Blocked: \`${actionCommand('runs')}\` names what is owed. A runtime value: \`${actionCommand('secrets')}\` stores it, or \`${actionCommand('apply')}\` for one it makes. "apply needed": \`${actionCommand('apply')}\` from a checkout at this commit. Either deploys this commit again.`,
      );
      return undefined;
    }
    console.warn(`${warningMark} ${verdict.sentence}`);
    console.warn(
      record?.outcome === 'apply needed'
        ? `  \`${actionCommand('apply')}\` from a checkout at this commit applies it and deploys the commit again.`
        : `  \`${actionCommand('secrets')}\` stores it and deploys the commit again.`,
    );
    return undefined;
  }
  console.error(`${crossMark} ${verdict?.sentence ?? fallback}`);
  const live = await liveCommit(context, key).catch(() => undefined);
  if (live) {
    const still = sha.startsWith(live) ? '' : ' still';
    console.info(`${pc.green('●')} Your users${still} get ${commitName(await commitRefs(), live)}`);
  }
  return verdict;
}

/**
 * Start a run of the main job for one commit and follow it step by step to its end, reporting how it ended: the version that serves, or
 * whose side the failure is on and what the users get meanwhile. A failure that a retry usually clears offers to start the same target
 * and retry counter again, as the deploy replaces only the roles that do not serve it yet, up to three tries; a blocked run names the one
 * action that deploys it again. Without a record, the job's state says how it ended.
 * @param started what the run does, after "Run <id>".
 */
export async function deployAndFollow(
  context: InfraContext,
  key: KeyPair,
  definitionId: string,
  commit: { sha: string; retry: number },
  started: string,
): Promise<FollowOutcome> {
  const auth = { secretKey: key.secretKey };
  const { region } = deriveInfra(context.appConfig);
  const { store } = await deployStores(context, key);
  for (let tries = 1; ; tries++) {
    const start = await startJobRun(auth, { region, definitionId, values: { TARGET_SHA: commit.sha, RETRY: String(commit.retry) } });
    console.info(`  ${checkMark} Run ${start.id} ${started}.`);
    const { run, record } = await followRun(auth, region, store, commit.sha, start);
    const outcome = mainJobOutcome(run);
    const unended = `The run ended ${run.state} before ${record ? 'its record did' : 'it wrote a record'}${run.error_message ? `: ${run.error_message}` : '.'}`;
    const verdict = await reportEnd(context, key, outcome, commit.sha, record, unended);
    const offer = verdict?.retryLikely && tries < MAX_TRIES && Boolean(process.stdin.isTTY) && !autoAcceptDefaults();
    if (!offer || !(await confirm({ message: 'Retry now?', default: true }))) return outcome;
  }
}

/** A deploy under way: its record, which says running while a deploy holds the lease under its run. */
export interface LiveDeploy {
  record: RunRecord;
  lock: LockInfo;
}

/**
 * The deploy under way, when one is: the newest record says running and a live lease is held under its run. The observer key reads both,
 * so the home and Deploy now find it without a paste. Undefined when no deploy runs.
 */
export async function liveDeploy(context: InfraContext, key: KeyPair): Promise<LiveDeploy | undefined> {
  const { store, control, bucket } = await deployStores(context, key);
  const lock = await peekLock(control, bucket, lockKey(context.environment));
  if (!lock || !leaseDeploys(lock) || Date.parse(lock.expiresAt) <= Date.now()) return undefined;
  const [newest] = await store.listRuns(1);
  const record = newest ? (await store.readRecord(newest))?.newest : undefined;
  if (record?.outcome !== 'running' || !leaseHeldByRun(lock, record.run)) return undefined;
  return { record, lock };
}

/**
 * Follow a deploy another start made, the schedule's or a colleague's, by its record alone: the steps done so far, then each one as it
 * completes, until the record ends or the lease under it lapses (the deploy died: its record says running for good). Ends as
 * {@link deployAndFollow} does, without a retry offer, as the target is the schedule's to start again.
 */
export async function followLiveDeploy(context: InfraContext, key: KeyPair, live: LiveDeploy): Promise<FollowOutcome> {
  const { store, control, bucket } = await deployStores(context, key);
  let record = live.record;
  console.info(`  ${pc.dim(`Run ${record.run}, started ${record.startedAt.slice(11, 16)} UTC: following it.`)}`);
  let shown = printNewSteps(record, 0);
  for (;;) {
    await sleep(POLL_MS);
    record = (await store.readRecord(record.run).catch(() => undefined))?.newest ?? record;
    shown = printNewSteps(record, shown);
    if (record.outcome !== 'running') break;
    const lock = await peekLock(control, bucket, lockKey(context.environment)).catch(() => live.lock);
    if (!leaseHeldByRun(lock, record.run)) {
      console.error(`${crossMark} The deploy stopped without ending its record: no deploy holds the lease under run ${record.run} any more.`);
      return 'failed';
    }
  }
  const outcome = recordOutcome(record.outcome);
  await reportEnd(context, key, outcome, record.target, record, `The run ended ${record.outcome}.`);
  return outcome;
}
