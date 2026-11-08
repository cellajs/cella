import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { confirm } from '@inquirer/prompts';
import { classifyRun } from '../../lib/deploy/failure-class';
import { listRemoteRefs } from '../../lib/deploy/git-remote';
import { findJobDefinition, type JobRun, listJobRuns, readJobRun, runEnded, startJobRun } from '../../lib/deploy/job-runs';
import { readLiveRecord } from '../../lib/deploy/live-record';
import { mainJobOutcome } from '../../lib/deploy/main-job';
import { repositoryUrl } from '../../lib/deploy/repository-key';
import { type RunRecord, stepLine, wroteRecord } from '../../lib/deploy/run-record';
import { bucketRunStore, type RunStore } from '../../lib/deploy/run-store';
import { commitName, ENVIRONMENTS_FILE, parseEnvironmentsFile, type RemoteRef, resolveTarget, type Target } from '../../lib/deploy/target';
import { machineRoles } from '../../lib/machine-roles';
import { deriveInfra } from '../../lib/naming';
import { actionCommand, actionLabel } from '../../lib/operator-actions';
import type { KeyPair } from '../../lib/scaleway/operator-identity';
import { makeS3Client, stateKeyOf } from '../../lib/scaleway/s3-client';
import { leaseDeploys, lockKey, makeControlClient, peekLock } from '../../lib/stack/control-store';
import { checkMark, crossMark, pc, sleep, warningMark } from '../../lib/utils/cli-output';
import { errorMessage } from '../../lib/utils/errors';
import { infraDir } from '../../lib/utils/paths';
import { autoAcceptDefaults, confirmOrDefault, endAction, type InfraContext, stackNameFor } from '../shared';
import { acquireOperatorKey } from './operator-unlock';

const POLL_MS = 5_000;
const REFS_BUDGET_MS = 4_000;
const MAX_TRIES = 3;

/**
 * Start one run of the environment's main job by hand, on the operator key, for the environment's target as the environments file of this
 * checkout says it, and follow the run until it ends: deployed (or already serving), blocked (a runtime value is owed) or failed. A scheduled
 * run does the same by itself at the environment's cadence; this is the operator's way for a target the schedule does not start again.
 */
export async function runStartDeploy(context: InfraContext): Promise<void> {
  const { appConfig, projectId } = context;
  const environment = context.environment;
  const target = await environmentTarget(context);
  if (!target) {
    console.error(
      `${crossMark} ${environment} has no line in ${ENVIRONMENTS_FILE}, so it deploys nothing: add \`${environment} branch:main\` there.`,
    );
    return endAction(1);
  }
  console.info(
    pc.dim(
      `\n${actionLabel('start-deploy')}: one run of ${environment}'s main job, for ${target.sha.slice(0, 10)} (${target.source}, retry ${target.retry}).\n`,
    ),
  );
  if (!(await confirmOrDefault({ message: `Deploy ${target.sha.slice(0, 10)} to ${environment}?`, default: true }))) return;

  const operator = await acquireOperatorKey(context);
  const auth = { secretKey: operator.secretKey };
  const { naming, region } = deriveInfra(appConfig);
  const definitionId = await findJobDefinition(auth, { region, projectId, name: naming.resource('main') });
  if (!definitionId) {
    console.error(
      `${crossMark} ${environment} has no main job yet: an apply makes it (\`${actionCommand('apply')}\`), once the deploy key's copy is in the engine folder (\`${actionCommand('rotate-keys')}\`).`,
    );
    return endAction(1);
  }
  const outcome = await deployAndFollow(context, operator, definitionId, target, 'started');
  if (outcome !== 'deployed') endAction(1);
}

/**
 * The environment's target, as the environments file of this checkout and the repository's refs say it; none for an environment other than
 * production without a line.
 */
async function environmentTarget(context: InfraContext): Promise<Target | undefined> {
  const file = join(infraDir, '..', ENVIRONMENTS_FILE);
  const line = existsSync(file) ? parseEnvironmentsFile(readFileSync(file, 'utf8')).get(context.environment) : undefined;
  return resolveTarget({ environment: context.environment, line, listRemote: listRemoteRefs(repositoryUrl(), process.env.REPOSITORY_READ_KEY) });
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

/**
 * Follow a run until it ends: its job state until its record appears, then each step once it completes. A record that cannot be read
 * this time is read again at the next poll.
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
    for (const step of record?.steps.slice(shownSteps) ?? []) console.info(stepLine(step));
    shownSteps = record?.steps.length ?? 0;
    if (runEnded(run)) return { run, record };
    await sleep(POLL_MS);
    run = await readJobRun(auth, { region, runId: run.id });
  }
}

/** The repository's release tags and branch heads, which name a commit, when they answer within the budget. */
function commitRefs(): Promise<RemoteRef[] | undefined> {
  return Promise.resolve()
    .then(() => listRemoteRefs(repositoryUrl(), process.env.REPOSITORY_READ_KEY, { timeoutMs: REFS_BUDGET_MS })(['refs/tags/*', 'refs/heads/*']))
    .catch(() => undefined);
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
): Promise<ReturnType<typeof mainJobOutcome>> {
  const auth = { secretKey: key.secretKey };
  const { naming, region } = deriveInfra(context.appConfig);
  const state = stateKeyOf(key, context.projectId);
  const store = bucketRunStore(await makeS3Client(context.appConfig.s3.region, state.accessKey, state.secretKey), naming.bootDiagBucket);
  for (let tries = 1; ; tries++) {
    const start = await startJobRun(auth, { region, definitionId, values: { TARGET_SHA: commit.sha, RETRY: String(commit.retry) } });
    console.info(`  ${checkMark} Run ${start.id} ${started}.`);
    const { run, record } = await followRun(auth, region, store, commit.sha, start);
    const outcome = mainJobOutcome(run);
    const verdict = record && record.outcome !== 'running' ? classifyRun(record) : undefined;
    if (outcome === 'deployed') {
      console.info(`${checkMark} ${context.environment} runs ${commitName(await commitRefs(), commit.sha)}`);
      return outcome;
    }
    if (outcome === 'blocked') {
      if (!verdict) {
        console.warn(
          `${warningMark} Blocked: \`${actionCommand('runs')}\` names what is owed. A runtime value: \`${actionCommand('secrets')}\` stores it, or \`${actionCommand('apply')}\` for one it makes. "apply needed": \`${actionCommand('apply')}\` from a checkout at this commit. Either deploys this commit again.`,
        );
        return outcome;
      }
      console.warn(`${warningMark} ${verdict.sentence}`);
      console.warn(
        record?.outcome === 'apply needed'
          ? `  \`${actionCommand('apply')}\` from a checkout at this commit applies it and deploys the commit again.`
          : `  \`${actionCommand('secrets')}\` stores it and deploys the commit again.`,
      );
      return outcome;
    }
    const unended = `The run ended ${run.state} before ${record ? 'its record did' : 'it wrote a record'}${run.error_message ? `: ${run.error_message}` : '.'}`;
    console.error(`${crossMark} ${verdict?.sentence ?? unended}`);
    const live = await liveCommit(context, key).catch(() => undefined);
    if (live) {
      const still = commit.sha.startsWith(live) ? '' : ' still';
      console.info(`${pc.green('●')} Your users${still} get ${commitName(await commitRefs(), live)}`);
    }
    const offer = verdict?.retryLikely && tries < MAX_TRIES && Boolean(process.stdin.isTTY) && !autoAcceptDefaults();
    if (!offer || !(await confirm({ message: 'Retry now?', default: true }))) return outcome;
  }
}

/** The commit the environment runs: the primary role's in the live record, none before the first deploy. */
async function liveCommit(context: InfraContext, key: KeyPair): Promise<string | undefined> {
  const { appConfig, projectId } = context;
  const primary = machineRoles(appConfig).find((role) => role.primary);
  if (!primary) return undefined;
  const state = stateKeyOf(key, projectId);
  const s3 = await makeControlClient(appConfig.s3.region, state.accessKey, state.secretKey);
  const { record } = await readLiveRecord(s3, deriveInfra(appConfig).naming.bootDiagBucket, stackNameFor(context));
  return record.roles[primary.role]?.commit;
}

/**
 * End a rotation on the operator key: deploy the live commit again, which the rotation's counter makes replace every machine, as the live
 * record names the counter each machine was booted under, then start
 * the environment's target when it is another commit. The running machines hold keys or values the rotation replaced, and a scheduled run
 * deploys only when the target moves; a deploy of the live commit, a release that deployed before, puts them on the rotated ones whatever
 * becomes of the target. The live run is followed to its end, as the target's run would wait on the lease behind it, and when it does
 * not deploy the target is left for the action that clears the block or `start-deploy`. Before the first deploy there is no live commit,
 * and when the live record cannot be read there is none known: the target alone is started.
 */
export async function redeployAfterRotation(context: InfraContext, key: KeyPair): Promise<void> {
  const auth = { secretKey: key.secretKey };
  const { naming, region } = deriveInfra(context.appConfig);
  const definitionId = await findJobDefinition(auth, { region, projectId: context.projectId, name: naming.resource('main') });
  if (!definitionId) {
    console.warn(
      `${warningMark} ${context.environment} has no main job yet: deploy with \`${actionCommand('start-deploy')}\` once an apply made it.`,
    );
    return;
  }
  const live = await liveCommit(context, key).catch((error) => {
    console.warn(`${warningMark} The live commit could not be read (${errorMessage(error)}): the target alone is started.`);
    return undefined;
  });
  const target = await environmentTarget(context);
  if (!live && !target) {
    console.warn(
      `${warningMark} ${context.environment} has no line in ${ENVIRONMENTS_FILE}, so no deploy replaces its machines: they hold what the rotation replaced.`,
    );
    return;
  }
  if (live) {
    const outcome = await deployAndFollow(
      context,
      key,
      definitionId,
      { sha: live, retry: 0 },
      `deploys the live ${live.slice(0, 10)} again, replacing every machine with the rotated keys and values`,
    );
    if (outcome !== 'deployed') {
      console.warn(`${warningMark} The machines keep what the rotation replaced until a deploy succeeds; the target is not started.`);
      return;
    }
    if (!target || target.sha === live) return;
  }
  if (!target) return;
  const run = await startJobRun(auth, { region, definitionId, values: { TARGET_SHA: target.sha, RETRY: String(target.retry) } });
  console.info(
    `${checkMark} Run ${run.id} deploys the target ${target.sha.slice(0, 10)}${live ? '' : ' with the rotated keys and values, replacing every machine'} (\`${actionCommand('runs')}\` shows how it ends).`,
  );
}

/**
 * Start the environment's main job again for the target whose last deploy ended blocked or apply needed, on the operator key: the apply,
 * or Env vars & secrets for a missing secret, does it at its end, as a scheduled run never starts a target and retry counter that have
 * a record. The last deploy is the newest record, or a newer job run started by hand that exited blocked and wrote no record. Nothing while a
 * deploy holds the lease, or when the last deploy ended otherwise; a target that moved on since is the schedule's. The lease decides, not
 * the run list: a scheduled run looks for seconds every cadence and deploys nothing. A start by hand still queued holds no lease, so the
 * target can deploy twice, and the second deploy ends unchanged.
 */
export async function startBlockedTarget(context: InfraContext, key: KeyPair): Promise<void> {
  const auth = { secretKey: key.secretKey };
  const { naming, region } = deriveInfra(context.appConfig);
  const definitionId = await findJobDefinition(auth, { region, projectId: context.projectId, name: naming.resource('main') });
  if (!definitionId) return;
  const state = stateKeyOf(key, context.projectId);
  const held = await peekLock(
    await makeControlClient(context.appConfig.s3.region, state.accessKey, state.secretKey),
    naming.bootDiagBucket,
    lockKey(context.environment),
  );
  if (held && Date.parse(held.expiresAt) > Date.now() && leaseDeploys(held)) return;
  const store = bucketRunStore(await makeS3Client(context.appConfig.s3.region, state.accessKey, state.secretKey), naming.bootDiagBucket);
  const [newest] = await store.listRuns(1);
  const record = newest ? await store.currentRecord(newest) : undefined;
  const ended = (await listJobRuns(auth, { region, projectId: context.projectId, definitionId })).find(runEnded);
  const sha = ended?.environment_variables?.TARGET_SHA;
  const unrecorded = ended && sha && mainJobOutcome(ended) === 'blocked' && (!record || (ended.created_at ?? '') > record.startedAt);
  const last = unrecorded
    ? { target: sha, retry: ended.environment_variables?.RETRY ?? '0', outcome: 'blocked' }
    : record && (record.outcome === 'blocked' || record.outcome === 'apply needed')
      ? { target: record.target, retry: String(record.retry ?? 0), outcome: record.outcome }
      : undefined;
  if (!last) return;
  const run = await startJobRun(auth, { region, definitionId, values: { TARGET_SHA: last.target, RETRY: last.retry } });
  console.info(
    `${checkMark} The last deploy was ${last.outcome}: run ${run.id} deploys ${last.target.slice(0, 10)} again (\`${actionCommand('runs')}\` shows how it ends).`,
  );
}
