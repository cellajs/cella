import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { listRemoteRefs } from '../../lib/deploy/git-remote';
import { findJobDefinition, listJobRuns, readJobRun, runEnded, startJobRun } from '../../lib/deploy/job-runs';
import { mainJobOutcome } from '../../lib/deploy/main-job';
import { repositoryUrl } from '../../lib/deploy/repository-key';
import { ENVIRONMENTS_FILE, parseEnvironmentsFile, resolveTarget, type Target } from '../../lib/deploy/target';
import { deriveInfra } from '../../lib/naming';
import { actionCommand, actionLabel } from '../../lib/operator-actions';
import { checkMark, crossMark, pc, warningMark } from '../../lib/utils/cli-output';
import { infraDir } from '../../lib/utils/paths';
import { confirmOrDefault, endAction, type InfraContext } from '../shared';
import { acquirePrivilegedKey } from './operator-unlock';

const POLL_MS = 10_000;

/**
 * Start one run of the environment's main job by hand, on the operator key, for the environment's target as the environments file of this
 * checkout says it, and follow the run until it ends: deployed, blocked (the operator owes something first) or failed. The runner does the
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

  const operator = await acquirePrivilegedKey(context);
  const auth = { secretKey: operator.secretKey };
  const { naming, region } = deriveInfra(appConfig);
  const definitionId = await findJobDefinition(auth, { region, projectId, name: naming.resource('main') });
  if (!definitionId) {
    console.error(
      `${crossMark} ${environment} has no main job yet: an apply makes it (\`${actionCommand('apply')}\`), once the deploy key's copy is in the engine folder (\`${actionCommand('rotate-keys')}\`).`,
    );
    return endAction(1);
  }
  let run = await startJobRun(auth, { region, definitionId, values: { TARGET_SHA: target.sha, RETRY: String(target.retry) } });
  console.info(`  ${checkMark} Run ${run.id} started.`);
  let shown = '';
  while (!runEnded(run)) {
    if (run.state !== shown) console.info(`  ${pc.dim(new Date().toISOString().slice(11, 19))} ${run.state}`);
    shown = run.state;
    await new Promise((resolve) => setTimeout(resolve, POLL_MS));
    run = await readJobRun(auth, { region, runId: run.id });
  }
  const outcome = mainJobOutcome(run);
  if (outcome === 'deployed') console.info(`${checkMark} ${environment} runs ${target.sha.slice(0, 10)}.`);
  else if (outcome === 'blocked')
    console.warn(
      `${warningMark} Blocked: \`${actionCommand('runs')}\` names what is owed. A privileged change is applied with \`${actionCommand('apply')}\`, a missing secret stored with \`${actionCommand('secrets')}\`: either starts this target again. Identities are written with \`${actionCommand('identity')}\`, and this action starts the target after it.`,
    );
  else
    console.error(
      `${crossMark} The run ended ${run.state}${run.error_message ? `: ${run.error_message}` : ''}. Its log is in Cockpit, under Serverless Jobs.`,
    );
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

/**
 * Start the environment's target after a rotation, on the operator key. The running machines hold keys or values the rotation replaced, and the
 * runner starts a run only when the target moves, so the rotation starts the run whose new generations replace every machine.
 */
export async function startTargetAfterRotation(context: InfraContext, key: { secretKey: string }): Promise<void> {
  const auth = { secretKey: key.secretKey };
  const { naming, region } = deriveInfra(context.appConfig);
  const definitionId = await findJobDefinition(auth, { region, projectId: context.projectId, name: naming.resource('main') });
  if (!definitionId) {
    console.warn(
      `${warningMark} ${context.environment} has no main job yet: deploy with \`${actionCommand('start-deploy')}\` once an apply made it.`,
    );
    return;
  }
  const target = await environmentTarget(context);
  if (!target) {
    console.warn(
      `${warningMark} ${context.environment} has no line in ${ENVIRONMENTS_FILE}, so no deploy replaces its machines: they hold what the rotation replaced.`,
    );
    return;
  }
  const run = await startJobRun(auth, { region, definitionId, values: { TARGET_SHA: target.sha, RETRY: String(target.retry) } });
  console.info(
    `${checkMark} Run ${run.id} deploys ${target.sha.slice(0, 10)} with the rotated keys and values, replacing every machine (\`${actionCommand('runs')}\` shows how it ends).`,
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
