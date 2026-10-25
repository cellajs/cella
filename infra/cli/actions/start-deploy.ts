import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { listRemoteRefs } from '../../lib/deploy/git-remote';
import { findJobDefinition, readJobRun, runEnded, startJobRun } from '../../lib/deploy/job-runs';
import { mainJobOutcome } from '../../lib/deploy/main-job';
import { repositoryUrl } from '../../lib/deploy/repository-key';
import { ENVIRONMENTS_FILE, parseEnvironmentsFile, resolveTarget } from '../../lib/deploy/target';
import { deriveInfra } from '../../lib/naming';
import { actionCommand, actionLabel } from '../../lib/operator-actions';
import { checkMark, crossMark, pc, warningMark } from '../../lib/utils/cli-output';
import { infraDir } from '../../lib/utils/paths';
import { confirmOrDefault, endAction, type InfraContext } from '../shared';
import { acquirePrivilegedKey } from './operator-unlock';

const POLL_MS = 10_000;

/**
 * Start one run of the environment's main job by hand, on the operator key, for the environment's target as the environments file of this
 * checkout says it, and follow the run until it ends: deployed, blocked (an apply is owed) or failed. The runner does the same by itself; this
 * is the operator's way when it is not there or must not wait.
 */
export async function runStartDeploy(context: InfraContext): Promise<void> {
  const { appConfig, projectId } = context;
  const environment = context.environment;
  const repository = repositoryUrl();
  const file = join(infraDir, '..', ENVIRONMENTS_FILE);
  const line = existsSync(file) ? parseEnvironmentsFile(readFileSync(file, 'utf8')).get(environment) : undefined;
  const target = await resolveTarget({
    environment,
    line,
    listRemote: listRemoteRefs(repository, process.env.REPOSITORY_READ_KEY),
  });
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
    console.warn(`${warningMark} Blocked: a privileged change is owed. Apply it (\`${actionCommand('apply')}\`), then start the deploy again.`);
  else
    console.error(
      `${crossMark} The run ended ${run.state}${run.error_message ? `: ${run.error_message}` : ''}. Its log is in Cockpit, under Serverless Jobs.`,
    );
  if (outcome !== 'deployed') endAction(1);
}
