import { spawnSync } from 'node:child_process';
import { confirm, input } from '@inquirer/prompts';
import type { EngineConfig } from '../config/engine-config';
import { menuPath, type OperatorActionId } from '../lib/operator-actions';
import type { KeyPair } from '../lib/scaleway/operator-identity';
import { allPrincipalNames } from '../lib/scaleway/principals';
import { controlActor, lockKey, makeControlClient, stateBackendUrl, stateBucket } from '../lib/stack/control-store';
import { generatePassphrase, verifyStackPassphrase } from '../lib/stack/pulumi-passphrase';
import type { StackContext } from '../lib/stack/stack-context';
import { acquireLease, installSignalRelease } from '../lib/stack/stack-lease';
import { crossMark, type Hint, pc, printFailureHint, warningMark } from '../lib/utils/cli-output';
import { errorMessage } from '../lib/utils/errors';
import { isPromptAbort } from './prompts/abort';
import { maskedSecret } from './prompts/masked-secret';
import { passphraseCustody, rememberedPassphrase, rememberPassphrase } from './session';

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

/**
 * Ends the running action after it printed its failure. It is thrown, so every `finally` on the way out runs: the menu then lists its rows
 * again, and a single-action run exits with `exitCode`.
 */
export class ActionEnded extends Error {
  readonly exitCode: number;

  constructor(exitCode: number) {
    super(`the action ended with exit code ${exitCode}`);
    this.name = 'ActionEnded';
    this.exitCode = exitCode;
  }
}

/** End the running action with `code` (see {@link ActionEnded}). Call it after printing what went wrong. */
export function endAction(code = 1): never {
  throw new ActionEnded(code);
}

/** Print a failure with the command that recovers from it, then end the running action. */
export function endActionWithHint(message: string, hint: Hint, code = 1): never {
  printFailureHint(message, hint);
  return endAction(code);
}

/** True for the two errors that end an action on purpose: the action ending itself, and the operator's Ctrl-C at a prompt. A catch-all lets both through. */
export function endsAction(error: unknown): boolean {
  return error instanceof ActionEnded || isPromptAbort(error);
}

/**
 * True when the run takes prompt defaults without asking: `--defaults`, a person on the fast path. A required input such as the Owner API
 * key is still asked, so the CLI never changes infrastructure without someone at the prompt.
 */
export const autoAcceptDefaults = (): boolean => process.argv.includes('--defaults');

/** `confirm` that resolves to its default under `--defaults`. */
export async function confirmOrDefault(opts: { message: string; default: boolean }): Promise<boolean> {
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

/**
 * Resolve and verify the Pulumi passphrase against existing stack encryption metadata. It never comes from the environment: a value on disk
 * would let the CLI run with nobody at the prompt. It comes from Secret Manager, read with the operator key the session is unlocked with,
 * else from the prompt; either way it is kept in memory for this run of the CLI, so a menu session asks once.
 * A passphrase typed while the session is unlocked is stored in Secret Manager, which is how an existing stack gets its copy there.
 * A stack with nothing encrypted yet takes one prompt unverified.
 */
export async function resolveVerifiedPassphrase(stackYaml?: string): Promise<string> {
  const canVerify = !!stackYaml && /^encryptionsalt:/m.test(stackYaml);
  if (!canVerify) return maskedSecret({ message: 'Pulumi passphrase' });

  // From earlier in this run: a rotation since then changed the stack's salt, so a stale one fails here and is fetched or asked again.
  const remembered = rememberedPassphrase();
  if (remembered && verifyStackPassphrase(stackYaml, remembered)) return remembered;

  const custody = passphraseCustody();
  const stored = await custody?.read();
  if (stored && verifyStackPassphrase(stackYaml, stored)) {
    rememberPassphrase(stored);
    return stored;
  }
  if (stored) console.warn(`${warningMark} The passphrase in Secret Manager does not open this stack: type the current one, and it is stored again.`);

  while (true) {
    const entered = await maskedSecret({ message: 'Pulumi passphrase' });
    if (verifyStackPassphrase(stackYaml, entered)) {
      rememberPassphrase(entered);
      if (await custody?.store(entered)) console.info(pc.dim('  Stored in Secret Manager: from now on the operator key fetches it.'));
      return entered;
    }
    console.warn(`${warningMark} Incorrect passphrase for this stack. Try again.`);
  }
}

/** Show a new passphrase once and block until the operator confirms storage: it encrypts stack state and is unrecoverable if lost. */
export async function confirmPassphraseStored(passphrase: string, heading: string, note?: string): Promise<void> {
  console.info(`\n→ ${heading}`);
  console.info(`\n    ${pc.cyanBright(passphrase)}\n`);
  console.info(`  ${pc.bold('Store it in your password manager now.')} It cannot be recovered if lost.${note ? `\n  ${pc.dim(note)}` : ''}`);
  while (!(await confirm({ message: 'Passphrase stored in your password manager?', default: false }))) {
    console.warn(`${warningMark} Store it before continuing: this is the only time it is shown.`);
  }
}

/**
 * Setup-time counterpart of `resolveVerifiedPassphrase`: an already-encrypting stack defers to the fetch-or-prompt flow.
 * A stack with nothing encrypted yet gets a generated passphrase, shown once via `confirmPassphraseStored`, and `generated` reports that to the caller.
 */
export async function resolveOrCreatePassphrase(stackYaml?: string): Promise<{ passphrase: string; generated: boolean }> {
  const canVerify = !!stackYaml && /^encryptionsalt:/m.test(stackYaml);
  if (canVerify) return { passphrase: await resolveVerifiedPassphrase(stackYaml), generated: false };

  const passphrase = generatePassphrase();
  await confirmPassphraseStored(passphrase, `Pulumi passphrase ${pc.dim('(encrypts stack secret state: generated for this new stack)')}`);
  return { passphrase, generated: true };
}

/** The stack name every action targets: derived from the mode on the DIY backend (`organization/infra/<mode>`); `INFRA_STACK_NAME` overrides it for unusual layouts. Never prompted. */
export function stackNameFor(context: Pick<InfraContext, 'environment'>): string {
  return process.env.INFRA_STACK_NAME?.trim() || `organization/infra/${context.environment}`;
}

/** A key pair the resolver found in the env, else both halves prompted: the access key in clear, the secret key masked. `label` names the key (`Scaleway Owner API key`); `hint` says where to get one. */
export async function keyPairOrPrompt(pair: KeyPair | undefined, label: string, hint?: string): Promise<KeyPair> {
  if (pair) return pair;
  const accessKey = await input({ message: `${label}, access key${hint ? ` (${hint})` : ''}`, validate: (value) => !!value.trim() || '(required)' });
  const secretKey = await maskedSecret({ message: `${label}, secret key` });
  return { accessKey, secretKey };
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
}

/** The leases this process holds, so an action that ends without releasing its own cannot leave the stack locked under the menu. */
const heldLocks = new Set<StackLockHandle>();

/**
 * Release every stack lease still held and report how many there were. The menu calls it after each action: a lease renews itself for as
 * long as the process lives, so one that outlived its action would keep the stack locked until the operator quits.
 */
export async function releaseHeldLocks(): Promise<number> {
  const leftover = [...heldLocks];
  for (const handle of leftover) await handle.release();
  return leftover.length;
}

/** How long an operator run waits for another holder's lease to lapse: longer than one lifetime, so a dead run always frees the stack in time. */
const OPERATOR_LOCK_WAIT_MS = 5 * 60_000;

/**
 * Take the stack lease so a second operator or CI cannot mutate the stack concurrently. A live lock held by someone else is waited out (a dead
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
  const bucket = stateBucket(opts.appConfig.slug);
  const key = lockKey(opts.stack);
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
        `${warningMark} Stack ${opts.stack} is locked by ${pc.cyan(held.owner)} (operation: ${held.operation}, since ${held.acquiredAt}); waiting up to ${Math.ceil(remainingMs / 60_000)} min for the lease to lapse…`,
      );
    },
    onRenewFailed: (reason, lost) =>
      console.warn(`${warningMark} stack lease renewal failed (${reason})${lost ? ': this run no longer holds the lock' : ''}`),
  });
  if (!result.acquired) {
    console.error(
      `${warningMark} Stack ${opts.stack} is still locked by ${pc.cyan(result.held.owner)} (operation: ${result.held.operation}, since ${result.held.acquiredAt}).`,
    );
    console.error(`  If that run is dead, clear it with "${menuPath('unlock')}" in the CLI or remove s3://${bucket}/${key}.`);
    endAction(1);
  }
  const uninstall = installSignalRelease(result.lease, { log: (msg) => console.warn(`${warningMark} ${msg}`) });
  const handle: StackLockHandle = {
    release: async () => {
      if (!heldLocks.delete(handle)) return;
      uninstall();
      await result.lease.release().catch((e) => console.warn(`${warningMark} failed to release stack lock: ${errorMessage(e)}`));
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
