import { spawnSync } from 'node:child_process';
import type { EngineConfig } from '../config/engine-config';
import { deriveInfra } from '../lib/naming';
import { actionCommand, menuPath, type OperatorActionId } from '../lib/operator-actions';
import { allPrincipalNames } from '../lib/scaleway/principals';
import { controlActor, lockKey, makeControlClient, pruneLockVersions, stateBackendUrl, stateBucket } from '../lib/stack/control-store';
import type { StackContext } from '../lib/stack/stack-context';
import { acquireLease, installSignalRelease } from '../lib/stack/stack-lease';
import { crossMark, type Hint, pc, printFailureHint, warningMark } from '../lib/utils/cli-output';
import { errorMessage } from '../lib/utils/errors';
import { isPromptAbort } from './prompts/abort';
import { confirm, input, PromptBack } from './prompts/back';
import { inMenuSession } from './session';

type AppConfigType = EngineConfig;

/** Infra CLI operation modes: the ids of the operator action table. */
export type CliMode = OperatorActionId;

/** Stack information and state, passed to every CLI action handler. */
export interface InfraContext extends StackContext {
  hasCiKey: boolean;
}

export interface StepOptions {
  cwd?: string;
  retry?: boolean;
  env?: NodeJS.ProcessEnv;
}

/** What a failed action offers after it printed its failure. */
export interface EndOptions {
  /** The actions that fix the failure: a menu session offers each by its menu name, a single-action run prints its command. */
  fix?: OperatorActionId | readonly OperatorActionId[];
  /** The retry row's words, for a retry that does more than run the action again. */
  retry?: string;
  /** The operator already chose to leave from the ways out the action offered: nothing more is offered. */
  left?: boolean;
}

/**
 * Ends the running action after it printed its failure. It is thrown, and every `finally` on the way out runs: the menu then offers a retry
 * and the fixes, and a single-action run exits with `exitCode`.
 */
export class ActionEnded extends Error {
  readonly exitCode: number;
  readonly fix: readonly OperatorActionId[];
  readonly retry?: string;
  readonly left: boolean;

  constructor(exitCode: number, opts: EndOptions = {}) {
    super(`the action ended with exit code ${exitCode}`);
    this.name = 'ActionEnded';
    this.exitCode = exitCode;
    this.fix = opts.fix === undefined ? [] : typeof opts.fix === 'string' ? [opts.fix] : opts.fix;
    this.retry = opts.retry;
    this.left = opts.left === true;
  }
}

/** End the running action with `code` (see {@link ActionEnded}). Call it after printing what went wrong. */
export function endAction(code = 1, opts: EndOptions = {}): never {
  throw new ActionEnded(code, opts);
}

/** Print a failure with the command that recovers from it, then end the running action. */
export function endActionWithHint(message: string, hint: Hint, code = 1): never {
  printFailureHint(message, hint);
  return endAction(code);
}

/** True for the errors that end an action on purpose: the action ending itself, the operator's Ctrl-C and Esc. A catch-all lets them through. */
export function endsAction(error: unknown): boolean {
  return error instanceof ActionEnded || isPromptAbort(error) || error instanceof PromptBack;
}

/**
 * True when the run takes prompt defaults without asking: `--defaults`, a person on the fast path. A required input such as the Owner API
 * key is still asked, so the CLI never changes infrastructure without someone at the prompt.
 */
export const autoAcceptDefaults = (): boolean => process.argv.includes('--defaults');

/** `confirm` that resolves to its default under `--defaults`; an `id` keeps the answer for a step back or a retry. */
export async function confirmOrDefault(opts: { message: string; default: boolean; id?: string }): Promise<boolean> {
  if (autoAcceptDefaults()) {
    console.info(pc.dim(`  [defaults] ${opts.message} -> ${opts.default ? 'yes' : 'no'}`));
    return opts.default;
  }
  return confirm(opts);
}

/** Optional free-text `input` that resolves to env/default under `--defaults`. */
export async function inputOrDefault(opts: { message: string; envName?: string; default?: string }): Promise<string> {
  const fromEnv = opts.envName ? process.env[opts.envName]?.trim() : undefined;
  if (autoAcceptDefaults()) {
    const value = fromEnv ?? opts.default ?? '';
    console.info(pc.dim(`  [defaults] ${opts.message} -> ${value || '<empty>'}`));
    return value;
  }
  if (fromEnv) return fromEnv;
  return input({ message: opts.message, default: opts.default });
}

/** The stack name every action targets: derived from the mode on the DIY backend (`organization/infra/<mode>`); `INFRA_STACK_NAME` overrides it for unusual layouts. Never prompted. */
export function stackNameFor(context: Pick<InfraContext, 'environment'>): string {
  return process.env.INFRA_STACK_NAME?.trim() || `organization/infra/${context.environment}`;
}

/** S3-backend login URL for the app's Pulumi state bucket. */
export function pulumiLoginUrl(appConfig: AppConfigType): string {
  return stateBackendUrl(stateBucket(appConfig.slug), appConfig.s3.region);
}

/** `pulumi login` (ends the action on failure) plus a best-effort `pulumi stack select` against the S3 state backend; the caller may still be about to init the stack. */
export function pulumiLoginAndSelect(infraDir: string, env: NodeJS.ProcessEnv, appConfig: AppConfigType, targetStack: string): void {
  const login = spawnSync('pulumi', ['login', pulumiLoginUrl(appConfig)], { cwd: infraDir, env, stdio: 'inherit' });
  if (login.status !== 0) {
    const names = allPrincipalNames(appConfig, appConfig.mode);
    console.error(
      `${crossMark} pulumi login failed (exit ${login.status}). The state bucket admits the '${names.operator}', '${names.observer}' and '${names.ciDeploy}' applications, and a key made for another project reaches it only as \`<access key>@<project id>\`.`,
    );
    endAction(login.status ?? 1);
  }
  spawnSync('pulumi', ['stack', 'select', targetStack], { cwd: infraDir, env, stdio: 'ignore' });
}

/** Handle to a held stack lease; `release` logs failures, never throws, and does nothing on a second call. */
export interface StackLockHandle {
  release: () => Promise<void>;
  /** True once a renewal found the lock taken by another run: nothing may change after that. */
  readonly lost: boolean;
}

/** The leases this process holds, so an action that ends without releasing its own cannot leave the environment leased under the menu. */
const heldLocks = new Set<StackLockHandle>();

/**
 * Release every stack lease still held and report how many there were. The menu calls it after each action: a lease renews itself for as
 * long as the process lives, so one that outlived its action would keep the environment leased until the operator quits.
 */
export async function releaseHeldLocks(): Promise<number> {
  const leftover = [...heldLocks];
  for (const handle of leftover) await handle.release();
  return leftover.length;
}

/** An ISO moment as `HH:MM UTC`, for a line that says since when. */
function utcTime(iso: string): string {
  return `${iso.slice(11, 16)} UTC`;
}

/** How long an operator run waits for another holder's lease to lapse: longer than one lifetime, so a dead run always frees the stack in time. */
const OPERATOR_LOCK_WAIT_MS = 5 * 60_000;

/**
 * Take the environment's lease (`control/<mode>/lock.json` in its boot-diag bucket) so a second operator or a deploy cannot change it concurrently. A live lock held by someone else is waited out (a dead
 * run's lease lapses within minutes); a holder that keeps renewing wins, and the action ends pointing at the unlock action.
 * The lease renews itself while held and is released on Ctrl-C, so an interrupted run leaves nothing behind.
 */
export async function acquireStackLockOrExit(opts: {
  appConfig: AppConfigType;
  accessKey: string;
  secretKey: string;
  stack: string;
  operation: string;
  ttlMs?: number;
}): Promise<StackLockHandle> {
  const s3 = await makeControlClient(opts.appConfig.s3.region, opts.accessKey, opts.secretKey);
  const bucket = deriveInfra(opts.appConfig).naming.bootDiagBucket;
  const key = lockKey(opts.stack);
  // Only a person's key deletes versions here, and a lease of too many takes no write from an operator or from a deploy.
  const pruned = await pruneLockVersions(s3, bucket, key).catch((error: unknown) => {
    console.warn(`${warningMark} The lease's old versions could not be deleted (${errorMessage(error)}).`);
    return 0;
  });
  if (pruned >= 1000) console.info(pc.dim(`  Deleted ${pruned} old versions of the lease, which Scaleway refuses writes over.`));
  let lastWaitLine = 0;
  const result = await acquireLease({
    s3,
    bucket,
    key,
    owner: controlActor(),
    operation: opts.operation,
    ttlMs: opts.ttlMs,
    waitMs: OPERATOR_LOCK_WAIT_MS,
    onWait: (held, remainingMs) => {
      if (Date.now() - lastWaitLine < 30_000) return;
      lastWaitLine = Date.now();
      console.info(
        `${warningMark} Another run holds the lease of ${opts.stack}: ${pc.cyan(held.owner)} (${held.operation}), since ${utcTime(held.acquiredAt)}.`,
      );
      console.info(pc.dim(`  One deploy or action runs at a time. Waiting up to ${Math.ceil(remainingMs / 60_000)} min for it to end…`));
    },
    onRenewFailed: (reason, lost) =>
      console.warn(`${warningMark} stack lease renewal failed (${reason})${lost ? ': this run no longer holds the lock' : ''}`),
  });
  if (!result.acquired) {
    const { owner, operation, acquiredAt } = result.held;
    console.error(
      `${crossMark} ${pc.cyan(owner)} still holds the lease of ${opts.stack} (${operation}, since ${utcTime(acquiredAt)}). Nothing was changed.`,
    );
    console.error(
      pc.dim(`  A run that died lets go within minutes. "${menuPath('unlock')}" clears one that did not, or remove s3://${bucket}/${key}.`),
    );
    endAction(1, { fix: 'unlock', retry: 'Wait 5 more minutes' });
  }
  const uninstall = installSignalRelease(result.lease, { log: (msg) => console.warn(`${warningMark} ${msg}`) });
  const handle: StackLockHandle = {
    release: async () => {
      if (!heldLocks.delete(handle)) return;
      uninstall();
      await result.lease.release().catch((e) => console.warn(`${warningMark} failed to release lease: ${errorMessage(e)}`));
    },
    get lost() {
      return result.lease.lost;
    },
  };
  heldLocks.add(handle);
  return handle;
}

/** Step runner: runs a labelled command, offering retry on failure; `must` ends the action on a non-zero code. */
export function createStepRunner(infraDir: string, defaultEnv: NodeJS.ProcessEnv) {
  const step = async (
    label: string,
    cmd: string,
    args: string[],
    run: (cmd: string, args: string[], opts: { cwd: string; env: NodeJS.ProcessEnv; stdio: 'inherit' }) => { status: number | null },
    opts: StepOptions = {},
  ): Promise<number> => {
    while (true) {
      console.info(`\n→ ${label}\n  $ ${cmd} ${args.join(' ')}`);
      const { status } = run(cmd, args, { cwd: opts.cwd ?? infraDir, env: opts.env ?? defaultEnv, stdio: 'inherit' });
      if (status === 0) return 0;
      console.error(`\n${crossMark} ${label} failed (exit ${status}).`);
      if (!opts.retry || !(await confirm({ message: 'Retry?', default: true }))) {
        return status ?? 1;
      }
    }
  };

  const must = async (
    label: string,
    cmd: string,
    args: string[],
    run: (cmd: string, args: string[], opts: { cwd: string; env: NodeJS.ProcessEnv; stdio: 'inherit' }) => { status: number | null },
    opts: StepOptions = {},
  ) => {
    const code = await step(label, cmd, args, run, opts);
    if (code !== 0) endAction(code);
  };

  return { must };
}

/** Where a message sends the operator for an action: its menu name in a menu session, the command a single-action run types. */
export function pointTo(id: OperatorActionId): string {
  return inMenuSession() ? `"${menuPath(id)}"` : `\`${actionCommand(id)}\``;
}
