import { spawnSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { confirm } from '@inquirer/prompts';
import { buildProviderEnv } from '../../lib/scaleway/bootstrap-scw-env';
import { assertBootstrapCapable, formatKeyLine, resolveOperatorIdentity } from '../../lib/scaleway/operator-identity';
import { principalNames } from '../../lib/scaleway/principals';
import { resolveOrganizationId } from '../../lib/scaleway/scaleway-iam';
import { PRIVILEGED_UP_ENV } from '../../lib/stack/privileged-up';
import { parseOrphanedDeletes, pruneOrphanedDeletes, runPulumiUpWithHint } from '../../lib/stack/pulumi-up';
import { pc, warningMark } from '../../lib/utils/cli-output';
import { errorMessage } from '../../lib/utils/errors';
import { infraDir } from '../../lib/utils/paths';
import { ensureRegistryPrincipals } from '../../tasks/setup-service-apps';
import { verifyPrivilegedUp } from '../../tasks/verify-privileged-up';
import { maskedSecret } from '../prompts/masked-secret';
import {
  acquireStackLockOrExit,
  type InfraContext,
  promptRequiredInput,
  pulumiLoginAndSelect,
  resolveVerifiedPassphrase,
  stackNameFor,
} from '../shared';

export interface PrivilegedConvergeOptions {
  /** Operation name recorded in the stack lock (e.g. 'apply', 'expose-db'). */
  operation: string;
  /**
   * Config mutation applied after the lock is held and rollout config is reconciled, right before `pulumi up`.
   * Returns an alternate `--config-file` for the `up`, or undefined to converge the committed config.
   */
  prepare?: (env: NodeJS.ProcessEnv, stack: string) => string | undefined;
  /** Show the plan (`pulumi preview --diff`) and confirm it once before `up`; `up` then skips its own preview. Declining ends the run with `completed: false`. */
  confirmPlan?: boolean;
  /** After a completed `up`, prove the live IAM grants and database privileges match what the program declares; the outcome lands in `verified`. */
  verifyAfter?: boolean;
  /** Capture the engine and provider log of the `up` under infra/.debug/, for an update Pulumi reports but the provider never sent. */
  debugProvider?: boolean;
}

export interface PrivilegedConvergeResult {
  env: NodeJS.ProcessEnv;
  stack: string;
  /** False when the operator declined the retry loop before `up` converged. */
  completed: boolean;
  /** Set only with `verifyAfter`: false when the live grants or privileges still differ from the program after a completed `up`. */
  verified?: boolean;
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

  const identity = resolveOperatorIdentity();
  const bootAccess = identity.bootstrap?.accessKey ?? (await promptRequiredInput('Scaleway bootstrap access key'));
  const bootSecret =
    identity.bootstrap?.secretKey ?? (await maskedSecret({ message: 'Scaleway bootstrap secret key' }));
  const stack = stackNameFor(context);

  // The Pulumi program requires the organization id (pulumi-context.ts requireEnv): SCW_ORGANIZATION_ID / SCW_DEFAULT_ORGANIZATION_ID from the env, else the Account API. Without it the up is a guaranteed failure, so stop before touching the stack.
  let organizationId: string;
  try {
    organizationId = await resolveOrganizationId(bootSecret, projectId);
  } catch (error) {
    console.error(
      `${warningMark} Could not resolve the organization id (${errorMessage(error)}). Set SCW_ORGANIZATION_ID (backend/.env) or SCW_DEFAULT_ORGANIZATION_ID and re-run.`,
    );
    process.exit(1);
  }

  // A CI or admin key pasted at the bootstrap prompt fails here, in a second and with the reason, not half-way through `pulumi up`.
  try {
    const { desc, role } = await assertBootstrapCapable({
      pair: { accessKey: bootAccess, secretKey: bootSecret },
      names: principalNames(appConfig.slug, context.environment),
      organizationId,
    });
    console.info(`${pc.dim('Bootstrap key:')} ${formatKeyLine(desc, role)}`);
  } catch (error) {
    console.error(`${warningMark} ${errorMessage(error)}`);
    process.exit(1);
  }

  // The state identity (the deprecated SCW_STATE_* override, else the standing key from infra/.env.<mode>, else the bootstrap key) applies to every state-bucket touch (login, lock, `up`), while the bootstrap key drives the resource mutations.
  const stateOverride = identity.state
    ? { stateAccessKey: identity.state.accessKey, stateSecretKey: identity.state.secretKey }
    : {};
  const env = buildProviderEnv(infraDir, {
    accessKey: bootAccess,
    secretKey: bootSecret,
    projectId,
    passphrase,
    ...stateOverride,
  });
  // Marks the `pulumi up` child as bootstrap-keyed: bootstrap-owned resources (VM IAM policy rules) reconcile under this marker.
  env[PRIVILEGED_UP_ENV] = '1';
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
    env.SCW_DEFAULT_ORGANIZATION_ID = organizationId;

    // Registry principals are bootstrap-owned like the policies they anchor: create any missing vm-<service>/boot application here, so a registry change converges in this one run. Idempotent; a failure only warns because a missing application still fails the `up` with guidance.
    console.info(pc.dim('\n→ Ensuring registry IAM principals (vm-<service> + boot applications)…'));
    try {
      await ensureRegistryPrincipals({
        callerSecretKey: bootSecret,
        projectId,
        slug: appConfig.slug,
        mode: context.environment,
        organizationId: env.SCW_DEFAULT_ORGANIZATION_ID,
        singleVM: appConfig.singleVM ?? false,
      });
    } catch (error) {
      console.warn(
        `${warningMark} Could not ensure registry principals (${errorMessage(error)}); \`pulumi up\` fails at requirePrincipalId if one is missing.`,
      );
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

    if (opts.confirmPlan) {
      const previewArgs = ['preview', '--stack', stack, '--diff', ...(configFile ? ['--config-file', configFile] : [])];
      console.info(`\n→ pulumi preview (the plan this run would apply)\n  $ pulumi ${previewArgs.join(' ')}`);
      const preview = spawnSync('pulumi', previewArgs, { cwd: infraDir, env, stdio: 'inherit' });
      if (preview.status !== 0) {
        await releaseLock();
        console.error(`${warningMark} pulumi preview exited ${preview.status}; nothing applied.`);
        process.exit(preview.status ?? 1);
      }
      if (!(await confirm({ message: `Apply this plan to ${context.environment}?`, default: false }))) {
        console.info('Declined; nothing applied.');
        return { env, stack, completed: false };
      }
    }

    let debugLogPath: string | undefined;
    if (opts.debugProvider) {
      const dir = resolve(infraDir, '.debug');
      mkdirSync(dir, { recursive: true });
      debugLogPath = resolve(dir, `${opts.operation}-${new Date().toISOString().replace(/[:.]/g, '-')}.log`);
    }

    while (true) {
      const { code, output } = await runPulumiUpWithHint(stack, infraDir, env, {
        configFile,
        skipPreview: opts.confirmPlan,
        debugLogPath,
      });
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

  let verified: boolean | undefined;
  if (completed && opts.verifyAfter) {
    console.info(pc.dim('\n→ Verifying live IAM grants and database privileges against the program…'));
    const result = await verifyPrivilegedUp({
      appConfig,
      projectId,
      organizationId,
      secretKey: bootSecret,
      log: (msg) => console.info(pc.dim(msg)),
    });
    verified = result.ok;
    if (!result.ok) {
      console.error(
        `\n${warningMark} pulumi reported success, but the live infrastructure still differs from the program:\n${result.problems.map((problem) => `  ✗ ${problem}`).join('\n')}`,
      );
      console.error(
        pc.dim(
          '  The provider recorded an update Scaleway did not keep. Re-run with --debug-provider to capture the API calls, then fix the rule in the console if a deploy is waiting.',
        ),
      );
    } else {
      console.info(`${pc.green('✓')} live grants and privileges match the program`);
    }
  }

  return { env, stack, completed, verified };
}

/** Loud reminder to revoke the short-lived bootstrap key after the run. */
export function printRevokeReminder(): void {
  console.info(`\n${pc.dim('Reminder:')} revoke the bootstrap key now (Scaleway console → IAM → API keys).`);
}
