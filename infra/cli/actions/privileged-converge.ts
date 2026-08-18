import { spawnSync } from 'node:child_process';
import { confirm } from '@inquirer/prompts';
import { buildProviderEnv, stateKeyOverrideFromEnv } from '../../lib/scaleway/bootstrap-scw-env';
import { resolveOrganizationId } from '../../lib/scaleway/scaleway-iam';
import { parseOrphanedDeletes, pruneOrphanedDeletes, runPulumiUpWithHint } from '../../lib/stack/pulumi-up';
import { pc, warningMark } from '../../lib/utils/cli-output';
import { errorMessage } from '../../lib/utils/errors';
import { infraDir } from '../../lib/utils/paths';
import { maskedSecret } from '../prompts/masked-secret';
import {
  acquireStackLockOrExit,
  envOr,
  type InfraContext,
  promptRequiredInput,
  promptStackName,
  pulumiLoginAndSelect,
  resolveVerifiedPassphrase,
} from '../shared';

export interface PrivilegedConvergeOptions {
  /** Operation name recorded in the stack lock (e.g. 'apply', 'expose-db'). */
  operation: string;
  /**
   * Config mutation applied after the lock is held and rollout config is reconciled, right before `pulumi up`.
   * Returns an alternate `--config-file` for the `up`, or undefined to converge the committed config.
   */
  prepare?: (env: NodeJS.ProcessEnv, stack: string) => string | undefined;
}

export interface PrivilegedConvergeResult {
  env: NodeJS.ProcessEnv;
  stack: string;
  /** False when the operator declined the retry loop before `up` converged. */
  completed: boolean;
}

/**
 * The privileged bootstrap-key converge shared by "Apply infra change", the DB-exposure toggle, and seeding, in order: resolve the passphrase,
 * take a freshly-supplied bootstrap key and the stack lock, reconcile rollout config from live state so a local `up` cannot revert compute to a
 * stale generation, apply the caller's config mutation, then `pulumi up` with an orphan-prune/retry loop.
 * Returns the provider env and stack for reading outputs after the lock releases, and exits the process on hard failures before the `up` loop.
 */
export async function runPrivilegedConverge(
  context: InfraContext,
  opts: PrivilegedConvergeOptions,
): Promise<PrivilegedConvergeResult> {
  if (context.state !== 'bootstrapped') {
    console.error(
      `${warningMark} This action requires a fully bootstrapped stack (state=${context.state}). Run Resume first.`,
    );
    process.exit(1);
  }

  const passphrase = await resolveVerifiedPassphrase(context.stackYaml);
  const { projectId, appConfig } = context;

  const bootAccess = await envOr('SCW_BOOTSTRAP_ACCESS_KEY', () =>
    promptRequiredInput('Scaleway bootstrap access key'),
  );
  const bootSecret = await envOr('SCW_BOOTSTRAP_SECRET_KEY', () =>
    maskedSecret({ message: 'Scaleway bootstrap secret key' }),
  );
  const stack = await promptStackName(context);

  // The state-identity override applies to every state-bucket touch (login, lock, `up`), while the bootstrap key drives the resource mutations.
  const stateOverride = stateKeyOverrideFromEnv();
  const env = buildProviderEnv(infraDir, {
    accessKey: bootAccess,
    secretKey: bootSecret,
    projectId,
    passphrase,
    ...stateOverride,
  });
  pulumiLoginAndSelect(infraDir, env, appConfig, stack);

  // Lock the stack through the control bucket to exclude concurrent operators and CI.
  // Every exit path must release, and process.exit skips finally blocks, so hard-failure paths release explicitly and the guard stops a double release.
  const stackLock = await acquireStackLockOrExit({
    appConfig,
    accessKey: stateOverride.stateAccessKey ?? bootAccess,
    secretKey: stateOverride.stateSecretKey ?? bootSecret,
    stack,
    operation: opts.operation,
  });
  let lockReleased = false;
  const releaseLock = async () => {
    if (lockReleased) return;
    lockReleased = true;
    await stackLock.release();
  };

  let completed = false;
  try {
    // Resolve the organization id for the program's IAM resources; failure is non-fatal because the program can derive it at runtime.
    try {
      env.SCW_DEFAULT_ORGANIZATION_ID = await resolveOrganizationId(bootSecret, projectId);
    } catch (error) {
      console.warn(`${warningMark} Could not resolve organization id (${errorMessage(error)}); continuing without it.`);
    }

    // Reconcile gen/sha from live state before `up`: a stale committed Pulumi.<stack>.yaml would converge compute back to an old generation and destroy newer live VMs.
    console.info(pc.dim('\n→ Reconciling rollout config from live state (sync-rollout-config)…'));
    const sync = spawnSync('pnpm', ['--filter', 'infra', 'sync-rollout-config', '--stack', stack], {
      cwd: infraDir,
      env,
      stdio: 'inherit',
    });
    if (sync.status !== 0) {
      await releaseLock();
      console.error(
        `${warningMark} sync-rollout-config failed (exit ${sync.status}). Aborting to avoid applying against stale gen/sha.`,
      );
      process.exit(sync.status ?? 1);
    }

    const configFile = opts.prepare?.(env, stack);

    while (true) {
      const { code, output } = await runPulumiUpWithHint(stack, infraDir, env, configFile);
      if (code === 0) {
        completed = true;
        break;
      }
      // A delete 404 leaves only stale Pulumi state, so offer to prune it and reconverge.
      const orphans = parseOrphanedDeletes(output);
      if (orphans.length > 0) {
        console.warn(
          `\n${warningMark} ${orphans.length} resource(s) failed to delete because the live object no longer exists:`,
        );
        for (const urn of orphans) console.warn(`  ${pc.dim('-')} ${urn}`);
        if (
          await confirm({
            message: `Prune ${orphans.length === 1 ? 'this stale entry' : 'these stale entries'} from state and retry pulumi up?`,
            default: true,
          })
        ) {
          pruneOrphanedDeletes(orphans, stack, infraDir, env);
          continue;
        }
      }
      if (!(await confirm({ message: 'Retry pulumi up?', default: false }))) break;
    }
  } finally {
    await releaseLock();
  }

  return { env, stack, completed };
}

/** Loud reminder to revoke the short-lived bootstrap key after the run. */
export function printRevokeReminder(): void {
  console.info(`\n${pc.dim('Reminder:')} revoke the bootstrap key now (Scaleway console → IAM → API keys).`);
}
