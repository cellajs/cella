import { spawnSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { confirm } from '@inquirer/prompts';
import { resolveOperatorIdentity } from '../../lib/scaleway/operator-identity';
import { principalNames } from '../../lib/scaleway/principals';
import { buildProviderEnv } from '../../lib/scaleway/provider-env';
import { PRIVILEGED_UP_ENV } from '../../lib/stack/privileged-up';
import { parseOrphanedDeletes, pruneOrphanedDeletes, runPulumiUpWithHint } from '../../lib/stack/pulumi-up';
import { pc, warningMark } from '../../lib/utils/cli-output';
import { errorMessage } from '../../lib/utils/errors';
import { infraDir } from '../../lib/utils/paths';
import { ensureRegistryPrincipals } from '../../tasks/setup-service-apps';
import { verifyPrivilegedUp } from '../../tasks/verify-privileged-up';
import {
  acquireStackLockOrExit,
  type InfraContext,
  pulumiLoginAndSelect,
  resolveVerifiedPassphrase,
  stackNameFor,
} from '../shared';
import { acquireOwnerKey } from './owner-key';

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
  /** True when the Owner API key was typed at the prompt, so a revoke reminder is due once the run's output is complete. */
  ownerKeyPasted: boolean;
  /** False when the operator declined the retry loop before `up` converged. */
  completed: boolean;
  /** Set only with `verifyAfter`: false when the live grants or privileges still differ from the program after a completed `up`. */
  verified?: boolean;
}

/**
 * The privileged converge shared by "Apply infra change", the DB-exposure toggle, and seeding, in order: resolve the passphrase, take the
 * Owner API key and the stack lock, reconcile rollout config from live state so a local `up` cannot revert compute to a stale generation,
 * apply the caller's config mutation, then `pulumi up` with an orphan-prune/retry loop.
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
  const ownerKey = await acquireOwnerKey({
    identity,
    names: principalNames(appConfig.slug, context.environment),
    projectId,
    slug: appConfig.slug,
    mode: context.environment,
  });
  const { organizationId } = ownerKey;
  const stack = stackNameFor(context);

  // The admin application key from infra/.env.<mode> signs every state-bucket touch (login, lock, `up`) while the Owner API key drives the resource mutations; without an admin key the Owner API key serves both sides.
  const stateOverride = identity.admin
    ? { stateAccessKey: identity.admin.accessKey, stateSecretKey: identity.admin.secretKey }
    : {};
  const env = buildProviderEnv(infraDir, {
    accessKey: ownerKey.accessKey,
    secretKey: ownerKey.secretKey,
    projectId,
    passphrase,
    ...stateOverride,
  });
  // Marks the `pulumi up` child as privileged: the resources only a privileged run writes (VM IAM policy rules) reconcile under this marker.
  env[PRIVILEGED_UP_ENV] = '1';
  pulumiLoginAndSelect(infraDir, env, appConfig, stack);

  // Lock the stack through the control bucket to exclude concurrent operators and CI.
  // Every exit path must release, and process.exit skips finally blocks, so hard-failure paths release explicitly and the guard stops a double release.
  const stackLock = await acquireStackLockOrExit({
    appConfig,
    accessKey: stateOverride.stateAccessKey ?? ownerKey.accessKey,
    secretKey: stateOverride.stateSecretKey ?? ownerKey.secretKey,
    stack,
    operation: opts.operation,
  });
  let lockReleased = false;
  const releaseLock = async () => {
    if (lockReleased) return;
    lockReleased = true;
    await stackLock.release();
    await ownerKey.release();
  };

  let completed = false;
  try {
    env.SCW_DEFAULT_ORGANIZATION_ID = organizationId;

    // Registry principals are privileged like the policies they anchor: create any missing vm-<service>/boot application here, so a registry change converges in this one run. Idempotent; a failure only warns because a missing application still fails the `up` with guidance.
    console.info(pc.dim('\n→ Ensuring registry IAM principals (vm-<service> + boot applications)…'));
    try {
      await ensureRegistryPrincipals({
        callerSecretKey: ownerKey.secretKey,
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
        return { env, stack, completed: false, ownerKeyPasted: ownerKey.pasted };
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
      secretKey: ownerKey.secretKey,
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

  return { env, stack, completed, verified, ownerKeyPasted: ownerKey.pasted };
}
