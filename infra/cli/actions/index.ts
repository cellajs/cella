import { actionLabel, type OperatorActionId } from '../../lib/operator-actions';
import { crossMark, pc, warningMark } from '../../lib/utils/cli-output';
import { errorMessage } from '../../lib/utils/errors';
import { isPromptAbort } from '../prompts/abort';
import { rememberedOperatorKey } from '../session';
import { ActionEnded, type InfraContext, releaseHeldLocks } from '../shared';
import { runApply } from './apply';
import { runExposeDatabase, runUnexposeDatabase } from './db-exposure';
import { runIdentity } from './identity';
import { runOperatorKey } from './operator-key';
import { runPreview } from './preview';
import { runRepositoryKey } from './repository-key';
import { runResetDatabase } from './reset-database';
import { runRotatePassphrase } from './rotate-passphrase';
import { runRotateSecrets } from './rotate-secrets';
import { runRunnerIdentity, runRunnerReplace, runRunnerRotate } from './runner';
import { runRuns } from './runs';
import { runSecrets } from './secrets';
import { runSeedDatabase } from './seed-db';
import { runSetup } from './setup';
import { runStartDeploy } from './start-deploy';
import { runStatePrune } from './state-prune';
import { runTeardown } from './teardown';
import { runUnlock } from './unlock';

type ActionRunners = Record<OperatorActionId, (context: InfraContext) => Promise<void>>;

/** The function behind every operator action: the menu and `pnpm infra <action>` both run an action through this table. */
export const ACTION_RUNNERS: ActionRunners = {
  // The status task reads config while its module loads, so it is imported once the context has loaded the config.
  status: async (context) => (await import('../../tasks/status')).runStatus({ ...context, operatorSecretKey: rememberedOperatorKey()?.secretKey }),
  runs: runRuns,
  preview: runPreview,
  apply: runApply,
  'rotate-keys': (context) => runSetup(context, 'rotate-keys'),
  'rotate-secrets': runRotateSecrets,
  'rotate-passphrase': runRotatePassphrase,
  'operator-key': runOperatorKey,
  identity: runIdentity,
  'start-deploy': runStartDeploy,
  'runner-identity': runRunnerIdentity,
  'runner-replace': runRunnerReplace,
  'runner-rotate': runRunnerRotate,
  'repository-key': runRepositoryKey,
  secrets: runSecrets,
  'db-open': runExposeDatabase,
  'db-seed': runSeedDatabase,
  'db-close': runUnexposeDatabase,
  'db-reset': runResetDatabase,
  unlock: runUnlock,
  resume: (context) => runSetup(context, 'resume'),
  'state-prune': runStatePrune,
  teardown: runTeardown,
};

/**
 * Run one action to its end and resolve to the exit code of a single-action run. An action that ended itself after printing its failure
 * gives its own code. A failure the action did not expect is printed here in one line (the stack trace with INFRA_DEBUG=1) and gives 1, so
 * the menu can list its rows again. Only the operator's Ctrl-C at a prompt propagates, to the handler that ends the run.
 * A stack lease the action left held is released on every way out: under the menu it would renew for as long as the CLI stays open.
 */
export async function runAction(
  id: OperatorActionId,
  context: InfraContext,
  runners: ActionRunners = ACTION_RUNNERS,
  log: (line: string) => void = (line) => console.error(line),
): Promise<number> {
  try {
    await runners[id](context);
    return 0;
  } catch (error) {
    if (error instanceof ActionEnded) return error.exitCode;
    if (isPromptAbort(error)) throw error;
    log(`\n${crossMark} ${actionLabel(id)} failed: ${errorMessage(error)}`);
    if (process.env.INFRA_DEBUG === '1' && error instanceof Error && error.stack) log(pc.dim(error.stack));
    else log(pc.dim('  Set INFRA_DEBUG=1 for the stack trace.'));
    return 1;
  } finally {
    const leftover = await releaseHeldLocks();
    if (leftover > 0) log(`${warningMark} Released a stack lock the action left held.`);
  }
}
