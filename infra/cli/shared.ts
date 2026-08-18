import { spawnSync } from 'node:child_process';
import { confirm, input } from '@inquirer/prompts';
import type { EngineConfig } from '../config/engine-config';
import type { Environment, StackState } from '../lib/stack/bootstrap-stack-state';
import {
  acquireLock,
  controlActor,
  lockKey,
  makeControlClient,
  releaseLock,
  stateBucket,
} from '../lib/stack/control-store';
import { generatePassphrase, verifyStackPassphrase } from '../lib/stack/pulumi-passphrase';
import { crossMark, pc, warningMark } from '../lib/utils/cli-output';
import { errorMessage } from '../lib/utils/errors';
import { maskedSecret } from './prompts/masked-secret';

type AppConfigType = EngineConfig;

/** Infra CLI operation modes */
export type CliMode =
  | 'status'
  | 'resume'
  | 'rotate'
  | 'rotate-passphrase'
  | 'apply'
  | 'preview'
  | 'secrets'
  | 'reset-database'
  | 'seed-db'
  | 'expose-db'
  | 'unexpose-db'
  | 'unlock'
  | 'teardown';

/** Stack information and state, passed to every CLI action handler. */
export interface InfraContext {
  environment: Environment;
  stackPath: string;
  stackYaml?: string;
  state: StackState;
  hasCiKey: boolean;
  appConfig: EngineConfig;
  /** Scaleway project id. Empty only on a fresh install without SCW_PROJECT_ID; the setup wizard resolves it. */
  projectId: string;
}

export interface StepOptions {
  cwd?: string;
  retry?: boolean;
  env?: NodeJS.ProcessEnv;
}

/** Non-interactive mode (INFRA_NON_INTERACTIVE=1): every prompt resolves to its default, its env value, or empty; a prompt without a safe default throws. */
export const nonInteractive = (): boolean => process.env.INFRA_NON_INTERACTIVE === '1';

/**
 * True when the run accepts prompt defaults without asking: `--defaults` (a human on the fast path) or INFRA_NON_INTERACTIVE (automation).
 * They differ only for required inputs such as the bootstrap key: `--defaults` still prompts, automation lets the prompt throw on a non-TTY.
 */
export const autoAcceptDefaults = (): boolean => process.argv.includes('--defaults') || nonInteractive();

/** Short label for the auto-resolution log line. */
const autoLabel = (): string => (nonInteractive() ? 'non-interactive' : 'defaults');

/** `confirm` that resolves to its default under `--defaults`/INFRA_NON_INTERACTIVE. */
export async function confirmOrDefault(opts: { message: string; default: boolean }): Promise<boolean> {
  if (autoAcceptDefaults()) {
    console.info(pc.dim(`  [${autoLabel()}] ${opts.message} -> ${opts.default ? 'yes' : 'no'}`));
    return opts.default;
  }
  return confirm(opts);
}

/** Optional free-text `input` that resolves to env/default under `--defaults`/INFRA_NON_INTERACTIVE. */
export async function inputOrDefault(opts: { message: string; envName?: string; default?: string }): Promise<string> {
  const fromEnv = opts.envName ? process.env[opts.envName]?.trim() : undefined;
  if (autoAcceptDefaults()) {
    const value = fromEnv ?? opts.default ?? '';
    console.info(pc.dim(`  [${autoLabel()}] ${opts.message} -> ${value || '<empty>'}`));
    return value;
  }
  if (fromEnv) return fromEnv;
  return input({ message: opts.message, default: opts.default });
}

/** First set variable from `envName` (a single name or ordered fallbacks), prompting when none are set. */
export const envOr = async (envName: string | string[], prompt: () => Promise<string>) => {
  const names = Array.isArray(envName) ? envName : [envName];
  for (const name of names) {
    const value = process.env[name];
    if (value) return value;
  }
  return prompt();
};

/**
 * Resolve and verify the Pulumi passphrase against existing stack encryption metadata.
 * An invalid environment value falls back to repeated prompts; a new unencrypted stack accepts the environment or one prompt unverified.
 */
export async function resolveVerifiedPassphrase(stackYaml?: string): Promise<string> {
  const canVerify = !!stackYaml && /^encryptionsalt:/m.test(stackYaml);
  if (!canVerify) return envOr('PULUMI_CONFIG_PASSPHRASE', () => maskedSecret({ message: 'Pulumi passphrase' }));

  const fromEnv = process.env.PULUMI_CONFIG_PASSPHRASE;
  if (fromEnv && verifyStackPassphrase(stackYaml, fromEnv)) return fromEnv;
  if (fromEnv) {
    console.warn(
      `${warningMark} ${pc.yellow('PULUMI_CONFIG_PASSPHRASE in your environment does not match this stack: prompting instead.')}`,
    );
  }

  while (true) {
    const entered = await maskedSecret({ message: 'Pulumi passphrase' });
    if (verifyStackPassphrase(stackYaml, entered)) return entered;
    console.warn(`${warningMark} Incorrect passphrase for this stack. Try again.`);
  }
}

/** Show a new passphrase once and block until the operator confirms storage: it encrypts stack state, is unrecoverable if lost, and GitHub Actions secrets are write-only. */
export async function confirmPassphraseStored(passphrase: string, heading: string, note?: string): Promise<void> {
  console.info(`\n→ ${heading}`);
  console.info(`\n    ${pc.cyanBright(passphrase)}\n`);
  console.info(
    `  ${pc.bold('Store it in your password manager now.')} It cannot be recovered if lost,\n` +
      '  and once synced to GitHub it can never be viewed again (Actions secrets are write-only).' +
      (note ? `\n  ${pc.dim(note)}` : ''),
  );
  while (!(await confirm({ message: 'Passphrase stored in your password manager?', default: false }))) {
    console.warn(`${warningMark} Store it before continuing: this is the only time it is shown.`);
  }
}

/**
 * Bootstrap-time counterpart of `resolveVerifiedPassphrase`: an already-encrypting stack (or a set `PULUMI_CONFIG_PASSPHRASE`) defers to the verify/prompt flow.
 * A stack with nothing encrypted yet gets a generated passphrase, shown once via `confirmPassphraseStored`, and `generated` reports that to the caller.
 */
export async function resolveOrCreatePassphrase(
  stackYaml?: string,
): Promise<{ passphrase: string; generated: boolean }> {
  const canVerify = !!stackYaml && /^encryptionsalt:/m.test(stackYaml);
  if (canVerify || process.env.PULUMI_CONFIG_PASSPHRASE) {
    return { passphrase: await resolveVerifiedPassphrase(stackYaml), generated: false };
  }

  const passphrase = generatePassphrase();
  await confirmPassphraseStored(
    passphrase,
    `Pulumi passphrase ${pc.dim('(encrypts stack secret state: generated for this new stack)')}`,
    'To supply your own instead, abort and re-run with PULUMI_CONFIG_PASSPHRASE set.',
  );
  return { passphrase, generated: true };
}

/** The "Pulumi stack name" prompt every action shares. */
export function promptStackName(context: InfraContext): Promise<string> {
  return inputOrDefault({
    message: 'Pulumi stack name',
    envName: 'INFRA_STACK_NAME',
    default: `organization/infra/${context.environment}`,
  });
}

/** A required free-text prompt (used for Scaleway access keys). */
export function promptRequiredInput(message: string): Promise<string> {
  return input({ message, validate: (value) => !!value.trim() || '(required)' });
}

/** S3-backend login URL for the app's Pulumi state bucket. */
export function pulumiLoginUrl(appConfig: AppConfigType): string {
  return `s3://${stateBucket(appConfig.slug)}?endpoint=s3.${appConfig.s3.region}.scw.cloud&region=${appConfig.s3.region}`;
}

/** `pulumi login` (exits on failure) plus a best-effort `pulumi stack select` against the S3 state backend; the caller may still be about to init the stack. */
export function pulumiLoginAndSelect(
  infraDir: string,
  env: NodeJS.ProcessEnv,
  appConfig: AppConfigType,
  targetStack: string,
): void {
  const login = spawnSync('pulumi', ['login', pulumiLoginUrl(appConfig)], { cwd: infraDir, env, stdio: 'inherit' });
  if (login.status !== 0) {
    console.error(
      `${crossMark} pulumi login failed (exit ${login.status}). Check the state-bucket credentials (AWS_* env).`,
    );
    process.exit(login.status ?? 1);
  }
  spawnSync('pulumi', ['stack', 'select', targetStack], { cwd: infraDir, env, stdio: 'ignore' });
}

/** Handle to a held stack lock; `release` logs failures and never throws. */
export interface StackLockHandle {
  release: () => Promise<void>;
}

/**
 * Acquire the S3 conditional-write stack lock so a second operator or CI cannot mutate the stack concurrently, or exit(1) pointing at the "Unlock" action when it is held.
 * A dead run's lock self-expires after the TTL.
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
  const owner = controlActor();
  const lock = await acquireLock(s3, bucket, key, {
    owner,
    operation: opts.operation,
    ttlMs: opts.ttlMs ?? 30 * 60_000,
  });
  if (!lock.acquired) {
    console.error(
      `${warningMark} Stack ${opts.stack} is locked by ${pc.cyan(lock.held.owner)} (operation: ${lock.held.operation}, since ${lock.held.acquiredAt}).`,
    );
    console.error(`  If that run is dead, clear it with the CLI "Unlock" action or remove s3://${bucket}/${key}.`);
    process.exit(1);
  }
  return {
    release: () =>
      releaseLock(s3, bucket, key, owner).catch((e) =>
        console.warn(`${warningMark} failed to release stack lock: ${errorMessage(e)}`),
      ),
  };
}

/** Step runner: runs a labelled command, offering retry on failure; `must` exits the process on a non-zero code. */
export function createStepRunner(infraDir: string, defaultEnv: NodeJS.ProcessEnv) {
  const step = async (
    label: string,
    cmd: string,
    args: string[],
    run: (
      cmd: string,
      args: string[],
      opts: { cwd: string; env: NodeJS.ProcessEnv; stdio: 'inherit' },
    ) => { status: number | null },
    opts: StepOptions = {},
  ): Promise<number> => {
    while (true) {
      console.info(`\n→ ${label}\n  $ ${cmd} ${args.join(' ')}`);
      const { status } = run(cmd, args, {
        cwd: opts.cwd ?? infraDir,
        env: opts.env ?? defaultEnv,
        stdio: 'inherit',
      });
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
    run: (
      cmd: string,
      args: string[],
      opts: { cwd: string; env: NodeJS.ProcessEnv; stdio: 'inherit' },
    ) => { status: number | null },
    opts: StepOptions = {},
  ) => {
    const code = await step(label, cmd, args, run, opts);
    if (code !== 0) process.exit(code);
  };

  return { must };
}
