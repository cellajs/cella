import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { listRemoteRefs } from '../../lib/deploy/git-remote';
import { findJobDefinition, type JobRun, listJobRuns, readJobRun, runEnded, startJobRun } from '../../lib/deploy/job-runs';
import { readLiveRecord } from '../../lib/deploy/live-record';
import { mainJobOutcome } from '../../lib/deploy/main-job';
import { repositoryUrl } from '../../lib/deploy/repository-key';
import { ENVIRONMENTS_FILE, parseEnvironmentsFile, resolveTarget, type Target } from '../../lib/deploy/target';
import { machineRoles } from '../../lib/machine-roles';
import { deriveInfra } from '../../lib/naming';
import { actionCommand, actionLabel } from '../../lib/operator-actions';
import type { KeyPair } from '../../lib/scaleway/operator-identity';
import { stateKeyOf } from '../../lib/scaleway/s3-client';
import { makeControlClient } from '../../lib/stack/control-store';
import { checkMark, crossMark, pc, warningMark } from '../../lib/utils/cli-output';
import { errorMessage } from '../../lib/utils/errors';
import { infraDir } from '../../lib/utils/paths';
import { confirmOrDefault, endAction, type InfraContext, stackNameFor } from '../shared';
import { acquireOperatorKey } from './operator-unlock';

const POLL_MS = 10_000;

/**
 * Start one run of the environment's main job by hand, on the operator key, for the environment's target as the environments file of this
 * checkout says it, and follow the run until it ends: deployed (or already serving), blocked (a runtime value is owed) or failed. The runner does the
 * same by itself; this is the operator's way when it is not there or must not wait.
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
  const outcome = await deployAndFollow(context, auth, definitionId, target, 'started');
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

/** Follow a run until it ends, printing each state it passes. */
async function followRun(auth: { secretKey: string }, region: string, started: JobRun): Promise<JobRun> {
  let run = started;
  let shown = '';
  while (!runEnded(run)) {
    if (run.state !== shown) console.info(`  ${pc.dim(new Date().toISOString().slice(11, 19))} ${run.state}`);
    shown = run.state;
    await new Promise((resolve) => setTimeout(resolve, POLL_MS));
    run = await readJobRun(auth, { region, runId: run.id });
  }
  return run;
}

/**
 * Start a run of the main job for one commit and follow it to its end, reporting how it ended: a blocked run names what the operator owes
 * and which action deploys the commit again, a failed one where its log is.
 * @param started what the run does, after "Run <id>".
 */
async function deployAndFollow(
  context: InfraContext,
  auth: { secretKey: string },
  definitionId: string,
  commit: { sha: string; retry: number },
  started: string,
): Promise<ReturnType<typeof mainJobOutcome>> {
  const { region } = deriveInfra(context.appConfig);
  const first = await startJobRun(auth, { region, definitionId, values: { TARGET_SHA: commit.sha, RETRY: String(commit.retry) } });
  console.info(`  ${checkMark} Run ${first.id} ${started}.`);
  const run = await followRun(auth, region, first);
  const outcome = mainJobOutcome(run);
  if (outcome === 'deployed') console.info(`${checkMark} ${context.environment} runs ${commit.sha.slice(0, 10)}.`);
  else if (outcome === 'blocked')
    console.warn(
      `${warningMark} Blocked: \`${actionCommand('runs')}\` names the runtime value owed. \`${actionCommand('secrets')}\` stores it, or \`${actionCommand('apply')}\` for one it makes: either deploys this commit again.`,
    );
  else
    console.error(
      `${crossMark} The run ended ${run.state}${run.error_message ? `: ${run.error_message}` : ''}. Its log is in Cockpit, under Serverless Jobs.`,
    );
  return outcome;
}

/** The commit the environment runs: the primary role's in the live record, none before the first deploy. */
async function liveCommit(context: InfraContext, key: KeyPair): Promise<string | undefined> {
  const { appConfig, projectId } = context;
  const [primary] = machineRoles(appConfig);
  if (!primary) return undefined;
  const state = stateKeyOf(key, projectId);
  const s3 = await makeControlClient(appConfig.s3.region, state.accessKey, state.secretKey);
  const { record } = await readLiveRecord(s3, deriveInfra(appConfig).naming.bootDiagBucket, stackNameFor(context));
  return record.roles[primary.role]?.commit;
}

/**
 * End a rotation on the operator key: deploy the live commit again, which the rotation's counter makes replace every machine, as the live
 * record names the counter each machine was booted under, then start
 * the environment's target when it is another commit. The running machines hold keys or values the rotation replaced, and the runner starts
 * a run only when the target moves; a deploy of the live commit, a release that deployed before, puts them on the rotated ones whatever
 * becomes of the target. The live run is followed to its end, as the target's run would wait on the stack lock behind it, and when it does
 * not deploy the target is left for the action that clears the block or `start-deploy`. Before the first deploy there is no live commit,
 * and when the control object cannot be read there is none known: the target alone is started.
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
      auth,
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
 * Start the environment's main job again for the target whose last run ended blocked (D21), on the operator key: the apply, or Manage runtime
 * secrets for a missing secret, does it at its end, as the runner holds rights over jobs only and cannot see either. Nothing when the last
 * run ended otherwise or runs still; a target that moved on since is the runner's.
 */
export async function startBlockedTarget(context: InfraContext, key: { secretKey: string }): Promise<void> {
  const auth = { secretKey: key.secretKey };
  const { naming, region } = deriveInfra(context.appConfig);
  const definitionId = await findJobDefinition(auth, { region, projectId: context.projectId, name: naming.resource('main') });
  if (!definitionId) return;
  const [last] = await listJobRuns(auth, { region, projectId: context.projectId, definitionId });
  const sha = last?.environment_variables?.TARGET_SHA;
  if (!last || !sha || !runEnded(last) || mainJobOutcome(last) !== 'blocked') return;
  const run = await startJobRun(auth, { region, definitionId, values: { TARGET_SHA: sha, RETRY: last.environment_variables?.RETRY ?? '0' } });
  console.info(
    `${checkMark} The last run was blocked: run ${run.id} deploys ${sha.slice(0, 10)} again (\`${actionCommand('runs')}\` shows how it ends).`,
  );
}
