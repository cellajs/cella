import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { confirm } from '@inquirer/prompts';
import { actionCommand, menuPath } from '../../lib/operator-actions';
import { describeKey } from '../../lib/scaleway/operator-identity';
import { buildProviderEnv } from '../../lib/scaleway/provider-env';
import { stateKeyOf } from '../../lib/scaleway/s3-client';
import { createSecretManagerClient } from '../../lib/scaleway/scaleway-secret-manager';
import { makeControlClient, stateBucket } from '../../lib/stack/control-store';
import { planBasisChanges, readPlanBasis } from '../../lib/stack/plan-basis';
import { parseOrphanedDeletes, pruneOrphanedDeletes, runPulumiUpWithHint } from '../../lib/stack/pulumi-up';
import { syncDeployTelemetryKey } from '../../lib/telemetry/sink-key';
import { checkMark, pc, warningMark } from '../../lib/utils/cli-output';
import { errorMessage } from '../../lib/utils/errors';
import { infraDir } from '../../lib/utils/paths';
import { admitOperatorToBuckets } from '../../tasks/admit-operator-buckets';
import { copySharedSecrets } from '../../tasks/copy-shared-secrets';
import { ensureDatabaseForStack } from '../../tasks/ensure-database';
import { ensureSecrets } from '../../tasks/ensure-secrets';
import { verifyAfterApply } from '../../tasks/verify-after-apply';
import { acquireStackLockOrExit, endAction, type InfraContext, pulumiLoginAndSelect, resolveVerifiedPassphrase, stackNameFor } from '../shared';
import { exitOnIdentityChanges } from './identity';
import { acquirePrivilegedKey } from './operator-unlock';
import { askToApply, type ReviewedPlan, showPlan } from './plan';

export interface OperatorApplyOptions {
  /** Operation name recorded in the stack lock (e.g. 'apply', 'expose-db'). */
  operation: string;
  /**
   * Config mutation applied after the lock is held and rollout config is reconciled, right before `pulumi up`.
   * Returns an alternate `--config-file` for the `up`, or undefined to converge the committed config. A throw ends the run before the `up`.
   */
  prepare?: (env: NodeJS.ProcessEnv, stack: string) => string | undefined | Promise<string | undefined>;
  /**
   * Apply only a plan the operator confirmed: show it (`pulumi preview --diff --refresh`) under the lock and ask once before `up`, which
   * then refreshes as the plan did and skips its own preview. Declining ends the run with `completed: false`.
   */
  confirmPlan?: boolean;
  /**
   * With `confirmPlan`, the plan the operator confirmed before this run took its privileged key and the lock. It is applied without a second
   * question for as long as the state it was computed from stands; a state that changed since is planned and confirmed again under the lock.
   */
  reviewed?: ReviewedPlan;
  /** After a completed `up`, prove the live database privileges match what the program declares; the outcome lands in `verified`. */
  verifyAfter?: boolean;
  /** Capture the engine and provider log of the `up` under infra/.debug/, for an update Pulumi reports but the provider never sent. */
  debugProvider?: boolean;
  /** Read-only check after a completed `up`, while the run's privileged key is still valid; a throw is reported as a warning. */
  afterUp?: (env: NodeJS.ProcessEnv) => Promise<void>;
}

export interface OperatorApplyResult {
  env: NodeJS.ProcessEnv;
  stack: string;
  /** False when the operator declined the retry loop before `up` converged. */
  completed: boolean;
  /** Set only with `verifyAfter`: false when the live database privileges still differ from the program after a completed `up`. */
  verified?: boolean;
}

/** One infra task under the lock, as a child that leaves the event loop free, so the stack lease keeps renewing while it runs. */
function infraTask(env: NodeJS.ProcessEnv, args: string[]): Promise<{ status: number }> {
  return new Promise((done) => {
    spawn('pnpm', ['--filter', 'infra', ...args], { cwd: infraDir, env, stdio: 'inherit' }).once('close', (code) => done({ status: code ?? 1 }));
  });
}

/**
 * The operator apply shared by "Review & apply changes", the DB access actions, and seeding, in order: resolve the passphrase, take the
 * operator key and the stack lock, reconcile rollout config from live state so a local `up` cannot revert compute to a stale generation,
 * apply the caller's config mutation, hold the plan against what the operator confirmed, then `pulumi up` with an orphan-prune/retry loop.
 * Returns the provider env and stack for reading outputs after the lock releases, and exits the process on hard failures before the `up` loop.
 */
export async function runOperatorApply(context: InfraContext, opts: OperatorApplyOptions): Promise<OperatorApplyResult> {
  if (context.state !== 'bootstrapped') {
    console.error(`${warningMark} This action requires a fully bootstrapped stack (state=${context.state}). Run "${menuPath('resume')}" first.`);
    endAction(1);
  }

  const passphrase = opts.reviewed?.passphrase ?? (await resolveVerifiedPassphrase(context.stackYaml));
  const { projectId, appConfig } = context;

  const operator = await acquirePrivilegedKey(context);
  const { organizationId } = operator;
  const stack = stackNameFor(context);

  await admitOperatorOrExit(context, operator);
  const env = buildProviderEnv(infraDir, { accessKey: operator.accessKey, secretKey: operator.secretKey, projectId, passphrase });
  pulumiLoginAndSelect(infraDir, env, appConfig, stack);

  // Lock the stack through the control bucket to exclude concurrent operators and CI.
  // Every exit path must release. The hard-failure paths release before they print and end the action, and the guard stops the double release when the finally below runs too.
  // The state side names this project: the operator key is made in one environment's project and serves them all.
  const stateKey = stateKeyOf(operator, projectId);
  const stackLock = await acquireStackLockOrExit({
    appConfig,
    accessKey: stateKey.accessKey,
    secretKey: stateKey.secretKey,
    stack,
    operation: opts.operation,
  });
  let lockReleased = false;
  const releaseLock = async () => {
    if (lockReleased) return;
    lockReleased = true;
    await stackLock.release();
  };
  const releaseAll = releaseLock;

  /** Why a plan confirmed before the lock may no longer hold; empty when the state it was computed from stands. A state that cannot be compared counts as changed. */
  const changesSinceReview = async (reviewed: ReviewedPlan): Promise<string[]> => {
    if (!reviewed.basis) return ['the state bucket could not be read when it was made'];
    try {
      const s3 = await makeControlClient(appConfig.s3.region, stateKey.accessKey, stateKey.secretKey);
      return planBasisChanges(reviewed.basis, await readPlanBasis(s3, stateBucket(appConfig.slug), stack));
    } catch (error) {
      return [`the state bucket could not be read (${errorMessage(error)})`];
    }
  };

  let completed = false;
  let verified: boolean | undefined;
  try {
    try {
      env.SCW_DEFAULT_ORGANIZATION_ID = organizationId;

      // Identities are IAM, which the operator key writes none of: one that differs from the declared ones stops the run before its `up`.
      await exitOnIdentityChanges(context, { secretKey: operator.secretKey, organizationId }, releaseAll);

      // Resources the program no longer declares and that stay live (machine policies, generated secret values): a state that still holds them would have this `up` delete them.
      console.info(pc.dim('\n→ Taking retired resources out of the state (forget-retired-resources)…'));
      const forget = await infraTask(env, ['forget-retired-resources', '--stack', stack]);
      if (forget.status !== 0) {
        await releaseAll();
        console.error(`${warningMark} forget-retired-resources failed (exit ${forget.status}). Nothing applied.`);
        endAction(forget.status ?? 1);
      }

      // An errored certificate leaves the state and Scaleway here, so the `up` makes it anew behind its DNS gate; certificates are the apply's (D15).
      console.info(pc.dim('\n→ Clearing errored load balancer certificates (repair-certs)…'));
      const repair = await infraTask(env, ['repair-certs', '--stack', stack]);
      if (repair.status !== 0) {
        await releaseAll();
        console.error(`${warningMark} repair-certs failed (exit ${repair.status}). Nothing applied.`);
        endAction(repair.status ?? 1);
      }

      // Reconcile gen/sha from live state before `up`: a stale committed Pulumi.<stack>.yaml would converge compute back to an old generation and destroy newer live VMs.
      console.info(pc.dim('\n→ Reconciling rollout config from live state (sync-rollout-config)…'));
      const sync = await infraTask(env, ['sync-rollout-config', '--stack', stack]);
      if (sync.status !== 0) {
        await releaseAll();
        console.error(`${warningMark} sync-rollout-config failed (exit ${sync.status}). Aborting to avoid applying against stale gen/sha.`);
        endAction(sync.status ?? 1);
      }

      const configFile = await opts.prepare?.(env, stack);

      if (opts.confirmPlan) {
        // Read after the reconcile above: a rollout pointer it corrected changes what the `up` does, so the plan made before it no longer holds.
        const outdated = opts.reviewed ? await changesSinceReview(opts.reviewed) : undefined;
        if (outdated?.length === 0) {
          console.info(pc.dim('\nThe stack is as the confirmed plan found it.'));
        } else {
          if (outdated) console.warn(`\n${warningMark} The confirmed plan may no longer hold: ${outdated.join(' and ')}. The plan as it stands now:`);
          const status = showPlan(env, stack, configFile);
          if (status !== 0) {
            await releaseAll();
            console.error(`${warningMark} pulumi preview exited ${status}; nothing applied.`);
            endAction(status);
          }
          if (!(await askToApply(context.environment))) {
            console.info('Declined; nothing applied.');
            return { env, stack, completed: false };
          }
        }
      }

      let debugLogPath: string | undefined;
      if (opts.debugProvider) {
        const dir = resolve(infraDir, '.debug');
        mkdirSync(dir, { recursive: true });
        debugLogPath = resolve(dir, `${opts.operation}-${new Date().toISOString().replace(/[:.]/g, '-')}.log`);
      }

      if (stackLock.lost) {
        await releaseAll();
        console.error(`${warningMark} This run lost the stack lock to another one; nothing applied. Run "${opts.operation}" again.`);
        endAction(1);
      }
      while (true) {
        const { code, output } = await runPulumiUpWithHint(stack, infraDir, env, {
          configFile,
          skipPreview: opts.confirmPlan,
          refresh: opts.confirmPlan,
          debugLogPath,
        });
        if (code === 0) {
          completed = true;
          break;
        }
        // A delete 404 leaves only stale Pulumi state, so offer to prune it and reconverge.
        const orphans = parseOrphanedDeletes(output);
        if (orphans.length > 0) {
          console.warn(`\n${warningMark} ${orphans.length} resource(s) failed to delete because the live object no longer exists:`);
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

    // The `up` made each consumer's copy of a secret; operator values still in a shared folder move into them (ledger L3).
    if (completed) {
      const client = createSecretManagerClient({ secretKey: operator.secretKey, region: appConfig.s3.region, projectId });
      await copySharedSecrets({ client, log: (message) => console.info(pc.dim(message)) }).catch((error) =>
        console.warn(
          `${warningMark} Could not move the shared operator secrets into their copies (${errorMessage(error)}); the next apply tries again.`,
        ),
      );
      // The database roles and connection strings, then the generated and derived values: made outside the state, after the `up` made any
      // new secret's containers.
      await ensureDatabaseForStack({
        env,
        stack,
        region: appConfig.s3.region,
        projectId,
        secretKey: operator.secretKey,
        log: (message) => console.info(pc.dim(message)),
      }).catch((error) => console.warn(`${warningMark} Could not make the database roles and connection strings (${errorMessage(error)}).`));
      await ensureSecrets({ client, log: (message) => console.info(pc.dim(message)) }).catch((error) =>
        console.warn(`${warningMark} Could not make the generated secrets (${errorMessage(error)}); run the apply again.`),
      );
      // The deploy reads values in the deploy folder only: the telemetry key it exports with is copied there.
      await syncDeployTelemetryKey({ client }).catch((error) =>
        console.warn(`${warningMark} Could not copy the telemetry key into the deploy folder (${errorMessage(error)}).`),
      );
    }

    if (completed && opts.verifyAfter) {
      console.info(pc.dim('\n→ Verifying live database privileges against the program…'));
      const result = await verifyAfterApply({ appConfig, secretKey: operator.secretKey, log: (msg) => console.info(pc.dim(msg)) });
      verified = result.ok;
      if (result.errors.length > 0) {
        console.error(
          `\n${warningMark} could not verify the live infrastructure after the up:\n${result.errors.map((error) => `  ✗ ${error}`).join('\n')}`,
        );
        console.error(pc.dim(`  Nothing is known to be wrong: run \`${actionCommand('preview')}\`.`));
      }
      if (result.problems.length > 0) {
        console.error(
          `\n${warningMark} pulumi reported success, but the live infrastructure still differs from the program:\n${result.problems.map((problem) => `  ✗ ${problem}`).join('\n')}`,
        );
        console.error(pc.dim('  Re-run with --debug-provider to capture the API calls.'));
      } else if (result.errors.length === 0) {
        console.info(`${checkMark} live privileges match the program`);
      }
    }
    if (completed && opts.afterUp) {
      await opts.afterUp(env).catch((error) => console.warn(`${warningMark} ${errorMessage(error)}`));
    }
  } finally {
  }

  return { env, stack, completed, verified };
}

/**
 * Admit the operator to bucket policies written before it, before anything of the run reads the state (tasks/admit-operator-buckets.ts):
 * nothing when it is admitted already. Ends the action when the policies shut it out and nothing can let it in.
 */
export async function admitOperatorOrExit(context: InfraContext, key: { accessKey: string; secretKey: string }): Promise<void> {
  const operator = await describeKey(key).catch(() => undefined);
  if (operator?.bearer !== 'application') return;
  try {
    const admitted = await admitOperatorToBuckets({
      appConfig: context.appConfig,
      mode: context.environment,
      projectId: context.projectId,
      operator: { accessKey: key.accessKey, secretKey: key.secretKey, applicationId: operator.bearerId },
    });
    if (admitted.length > 0) console.info(`${checkMark} The operator is admitted to the buckets now: ${admitted.join(', ')}.`);
  } catch (error) {
    console.error(`${warningMark} Could not admit the operator to the buckets: ${errorMessage(error)}.`);
    endAction(1);
  }
}
