import { actionCommand, actionLabel, menuPath, OPERATOR_ACTIONS, type OperatorActionId } from '../../lib/operator-actions';
import { crossMark, pc, warningMark } from '../../lib/utils/cli-output';
import { errorMessage } from '../../lib/utils/errors';
import { isPromptAbort } from '../prompts/abort';
import { PromptBack } from '../prompts/back';
import { keptKeyNote, LEAVE, leaveRow, type WayOut, whatNow } from '../prompts/what-now';
import { forgetAnswers, inMenuSession, rememberedOperatorKey } from '../session';
import { ActionEnded, type InfraContext, releaseHeldLocks } from '../shared';
import { runApply } from './apply';
import { runExposeDatabase, runUnexposeDatabase } from './db-exposure';
import { runIdentity } from './identity';
import { runOperatorKey } from './operator-key';
import { runPreview } from './preview';
import { runReleases } from './releases';
import { runRepositoryKey } from './repository-key';
import { runResetDatabase } from './reset-database';
import { runRotateSecrets } from './rotate-secrets';
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
  status: async (context) => (await import('../../tasks/status')).runStatus({ ...context, operatorKey: rememberedOperatorKey() }),
  logs: runRuns,
  preview: runPreview,
  apply: runApply,
  'rotate-keys': (context) => runSetup(context, 'rotate-keys'),
  'rotate-secrets': runRotateSecrets,
  operators: runOperatorKey,
  identities: runIdentity,
  deploy: runStartDeploy,
  releases: runReleases,
  'repository-key': runRepositoryKey,
  env: runSecrets,
  'db-open': runExposeDatabase,
  'db-seed': runSeedDatabase,
  'db-close': runUnexposeDatabase,
  'db-reset': runResetDatabase,
  unlock: runUnlock,
  resume: (context) => runSetup(context, 'resume'),
  'state-remove': runStatePrune,
  teardown: runTeardown,
};

/** How a run of an action ended: the exit code of a single-action run, and the action the operator chose to run next. */
export interface ActionOutcome {
  code: number;
  next?: OperatorActionId;
  /** The operator stepped back out of the action with Esc, so it changed nothing. */
  back?: boolean;
}

/** How one try of an action ended, before anything is offered. */
type Try = 'done' | 'back' | 'stopped' | ActionEnded;

export interface RunActionOptions {
  runners?: ActionRunners;
  log?: (line: string) => void;
  /** The action is a first setup, which has no menu to return to: a failure offers a retry of the step or quitting. */
  firstSetup?: boolean;
  /** Asks what to do after a failure; a test answers in its place. */
  choose?: typeof whatNow;
}

/** The letter of a fix row: the first letter of its label that no other row of the frame takes. */
function fixKey(label: string, taken: Set<string>): string {
  const key = [...label.toLowerCase()].find((char) => /[a-z]/.test(char) && !taken.has(char)) ?? String(taken.size);
  taken.add(key);
  return key;
}

/** The ways out of a failed action: retry it, each action that fixes it by its menu name (in a menu session), then leave. */
function waysOut(id: OperatorActionId, ended: ActionEnded, firstSetup: boolean): Array<WayOut<string>> {
  const retry: WayOut<string> = firstSetup
    ? { key: 'r', value: RETRY, label: 'Retry this step', description: 'Runs the step again. What is made stays, and only the rest is created.' }
    : { key: 'r', value: RETRY, label: ended.retry ?? `Retry ${actionLabel(id)}`, description: 'Runs the action again, from its first question.' };
  const taken = new Set(['r', 'm', 'q']);
  const fixes = inMenuSession()
    ? ended.fix.map((fix) => ({
        key: fixKey(actionLabel(fix), taken),
        value: fix,
        label: actionLabel(fix),
        hint: menuPath(fix) === actionLabel(fix) ? undefined : menuPath(fix),
        description: OPERATOR_ACTIONS[fix].description,
      }))
    : [];
  return [retry, ...fixes, leaveRow()];
}

const RETRY = 'retry';

/**
 * Try an action once and say how it ended. A failure the action did not expect is printed here in one line (the stack trace with
 * INFRA_DEBUG=true). A stack lease the action left held is released on every way out: under the menu it would renew for as long as the CLI
 * stays open.
 */
async function tryAction(id: OperatorActionId, context: InfraContext, runners: ActionRunners, log: (line: string) => void): Promise<Try> {
  try {
    await runners[id](context);
    return 'done';
  } catch (error) {
    if (error instanceof PromptBack) return 'back';
    if (isPromptAbort(error)) {
      if (!inMenuSession()) throw error;
      return 'stopped';
    }
    if (error instanceof ActionEnded) return error;
    log(`\n${crossMark} ${actionLabel(id)} failed: ${errorMessage(error)}`);
    if (process.env.INFRA_DEBUG === 'true' && error instanceof Error && error.stack) log(pc.dim(error.stack));
    else log(pc.dim('  Set INFRA_DEBUG=true for the stack trace.'));
    return new ActionEnded(1);
  } finally {
    const leftover = await releaseHeldLocks();
    if (leftover > 0) log(`${warningMark} Released a lease the action left held.`);
  }
}

/**
 * Run one action to its end and resolve to the exit code of a single-action run. In a menu session (and a first setup) a failure asks what
 * now: retry with the answers kept, run the action that fixes it, or leave; Esc at a prompt returns to the menu quietly, and Ctrl-C at one
 * returns with the keys kept. A single-action run prints each fix as its command, gives the action's own code, and lets a Ctrl-C through
 * to the handler that ends the run.
 */
export async function runAction(id: OperatorActionId, context: InfraContext, opts: RunActionOptions = {}): Promise<ActionOutcome> {
  const { runners = ACTION_RUNNERS, log = (line: string) => console.error(line), firstSetup = false, choose = whatNow } = opts;
  try {
    for (;;) {
      const ended = await tryAction(id, context, runners, log);
      if (ended === 'done') return { code: 0 };
      if (ended === 'back') {
        if (!inMenuSession()) log(pc.dim('Cancelled.'));
        return { code: 0, back: true };
      }
      if (ended === 'stopped') {
        log(pc.dim(['Back to the menu.', keptKeyNote()].filter(Boolean).join(' ')));
        return { code: 130 };
      }
      if (ended.exitCode === 0 || ended.left) return { code: ended.exitCode };
      if (!inMenuSession() && !firstSetup) {
        for (const fix of ended.fix) log(pc.dim(`  ${actionLabel(fix)}: ${actionCommand(fix)}`));
        return { code: ended.exitCode };
      }
      const note = firstSetup && rememberedOperatorKey() ? SETUP_KEY_NOTE : keptKeyNote();
      const picked = await choose(waysOut(id, ended, firstSetup), note);
      if (picked === RETRY) continue;
      if (picked === LEAVE) return { code: ended.exitCode };
      return { code: ended.exitCode, next: ended.fix.find((fix) => fix === picked) };
    }
  } finally {
    forgetAnswers();
  }
}

/** The line under a first setup's failure: the operator key its Owner moment made is in memory only. */
const SETUP_KEY_NOTE = 'The operator key this setup made ends with this run: after quitting, make one in the console.';
