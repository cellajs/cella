import { spawnSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { confirm } from '@inquirer/prompts';
import { actionCommand, menuPath } from '../../lib/operator-actions';
import { describeKey } from '../../lib/scaleway/operator-identity';
import { buildProviderEnv } from '../../lib/scaleway/provider-env';
import { projectAccessKey } from '../../lib/scaleway/s3-client';
import { createSecretManagerClient } from '../../lib/scaleway/scaleway-secret-manager';
import { makeControlClient, stateBucket } from '../../lib/stack/control-store';
import { planBasisChanges, readPlanBasis } from '../../lib/stack/plan-basis';
import { parseOrphanedDeletes, pruneOrphanedDeletes, runPulumiUpWithHint } from '../../lib/stack/pulumi-up';
import { checkMark, pc, warningMark } from '../../lib/utils/cli-output';
import { errorMessage } from '../../lib/utils/errors';
import { infraDir } from '../../lib/utils/paths';
import { admitOperatorToBuckets } from '../../tasks/admit-operator-buckets';
import { copySharedSecrets } from '../../tasks/copy-shared-secrets';
import { ensureSecrets } from '../../tasks/ensure-secrets';
import { missingRegistryPrincipals } from '../../tasks/setup-service-apps';
import { verifyPrivilegedUp } from '../../tasks/verify-privileged-up';
import { acquireStackLockOrExit, endAction, type InfraContext, pulumiLoginAndSelect, resolveVerifiedPassphrase, stackNameFor } from '../shared';
import { acquirePrivilegedKey } from './operator-unlock';
import { askToApply, type ReviewedPlan, showPlan } from './plan';

export interface PrivilegedConvergeOptions {
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
  /** After a completed `up`, prove the live IAM grants and database privileges match what the program declares; the outcome lands in `verified`. */
  verifyAfter?: boolean;
  /** Capture the engine and provider log of the `up` under infra/.debug/, for an update Pulumi reports but the provider never sent. */
  debugProvider?: boolean;
  /** Read-only check after a completed `up`, while the run's privileged key is still valid; a throw is reported as a warning. */
  afterUp?: (env: NodeJS.ProcessEnv) => Promise<void>;
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
 * The privileged converge shared by "Review & apply changes", the DB access actions, and seeding, in order: resolve the passphrase, take the
 * privileged key and the stack lock, reconcile rollout config from live state so a local `up` cannot revert compute to a stale generation,
 * apply the caller's config mutation, hold the plan against what the operator confirmed, then `pulumi up` with an orphan-prune/retry loop.
 * Returns the provider env and stack for reading outputs after the lock releases, and exits the process on hard failures before the `up` loop.
 */
export async function runPrivilegedConverge(context: InfraContext, opts: PrivilegedConvergeOptions): Promise<PrivilegedConvergeResult> {
  if (context.state !== 'bootstrapped') {
    console.error(`${warningMark} This action requires a fully bootstrapped stack (state=${context.state}). Run "${menuPath('resume')}" first.`);
    endAction(1);
  }

  const passphrase = opts.reviewed?.passphrase ?? (await resolveVerifiedPassphrase(context.stackYaml));
  const { projectId, appConfig } = context;

  const ownerKey = await acquirePrivilegedKey(context);
  const { organizationId } = ownerKey;
  const stack = stackNameFor(context);

  await admitOperatorOrExit(context, { ...ownerKey, passphrase, stack });
  const env = buildProviderEnv(infraDir, { accessKey: ownerKey.accessKey, secretKey: ownerKey.secretKey, projectId, passphrase });
  pulumiLoginAndSelect(infraDir, env, appConfig, stack);

  // Lock the stack through the control bucket to exclude concurrent operators and CI.
  // Every exit path must release. The hard-failure paths release before they print and end the action, and the guard stops the double release when the finally below runs too.
  // The state side names this project: the operator key is made in one environment's project and serves them all.
  const stateKey = { accessKey: projectAccessKey(ownerKey.accessKey, projectId), secretKey: ownerKey.secretKey };
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
  // The minted key outlives the lock: the verification below reads IAM and the database with it, so it is revoked last (safe to call twice).
  const releaseAll = async () => {
    await releaseLock();
    await ownerKey.release();
  };

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

      // Registry principals anchor the machine policies. The operator key writes no IAM: it finds out which ones are missing and stops, since
      // the `up` would fail on them halfway.
      const missing = await missingRegistryPrincipals({
        slug: appConfig.slug,
        mode: context.environment,
        organizationId,
        secretKey: ownerKey.secretKey,
      }).catch((error) => {
        console.warn(`${warningMark} Could not check the registry principals (${errorMessage(error)}).`);
        return [] as string[];
      });
      if (missing.length > 0) {
        await releaseAll();
        console.error(
          `${warningMark} The service registry needs ${missing.length === 1 ? 'an identity that does' : 'identities that do'} not exist yet: ${missing.join(', ')}.`,
        );
        console.error(`  Creating one writes IAM, which the operator key cannot: \`${actionCommand('identity')}\` makes it with your Owner API key.`);
        endAction(1);
      }

      // Resources the program no longer declares and that stay live (machine policies, generated secret values): a state that still holds them would have this `up` delete them.
      console.info(pc.dim('\n→ Taking retired resources out of the state (forget-retired-resources)…'));
      const forget = spawnSync('pnpm', ['--filter', 'infra', 'forget-retired-resources', '--stack', stack], { cwd: infraDir, env, stdio: 'inherit' });
      if (forget.status !== 0) {
        await releaseAll();
        console.error(`${warningMark} forget-retired-resources failed (exit ${forget.status}). Nothing applied.`);
        endAction(forget.status ?? 1);
      }

      // Reconcile gen/sha from live state before `up`: a stale committed Pulumi.<stack>.yaml would converge compute back to an old generation and destroy newer live VMs.
      console.info(pc.dim('\n→ Reconciling rollout config from live state (sync-rollout-config)…'));
      const sync = spawnSync('pnpm', ['--filter', 'infra', 'sync-rollout-config', '--stack', stack], { cwd: infraDir, env, stdio: 'inherit' });
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
            return { env, stack, completed: false, ownerKeyPasted: ownerKey.pasted };
          }
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
      const client = createSecretManagerClient({ secretKey: ownerKey.secretKey, region: appConfig.s3.region, projectId });
      await copySharedSecrets({ client, slug: appConfig.slug, mode: context.environment, log: (message) => console.info(pc.dim(message)) }).catch(
        (error) =>
          console.warn(
            `${warningMark} Could not move the shared operator secrets into their copies (${errorMessage(error)}); the next deploy tries again.`,
          ),
      );
      // Generated and derived values are made in Secret Manager, never in the state; the `up` made any new secret's containers.
      await ensureSecrets({ client, slug: appConfig.slug, mode: context.environment, log: (message) => console.info(pc.dim(message)) }).catch(
        (error) => console.warn(`${warningMark} Could not make the generated secrets (${errorMessage(error)}); the next deploy tries again.`),
      );
    }

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
      if (result.errors.length > 0) {
        console.error(
          `\n${warningMark} could not verify the live infrastructure after the up:\n${result.errors.map((error) => `  ✗ ${error}`).join('\n')}`,
        );
        console.error(
          pc.dim(`  Nothing is known to be wrong: run \`${actionCommand('preview')}\`, or let the next deploy's Verify VM IAM grants step tell.`),
        );
      }
      if (result.problems.length > 0) {
        console.error(
          `\n${warningMark} pulumi reported success, but the live infrastructure still differs from the program:\n${result.problems.map((problem) => `  ✗ ${problem}`).join('\n')}`,
        );
        console.error(
          pc.dim(
            `  A machine policy differs from the declared one: \`${actionCommand('identity')}\` writes it with your Owner API key. A database privilege that differs: re-run with --debug-provider to capture the API calls.`,
          ),
        );
      } else if (result.errors.length === 0) {
        console.info(`${checkMark} live grants and privileges match the program`);
      }
    }
    if (completed && opts.afterUp) {
      await opts.afterUp(env).catch((error) => console.warn(`${warningMark} ${errorMessage(error)}`));
    }
  } finally {
    await ownerKey.release();
  }

  return { env, stack, completed, verified, ownerKeyPasted: ownerKey.pasted };
}

/**
 * Admit the operator to bucket policies written before it, before anything of the run reads the state (tasks/admit-operator-buckets.ts):
 * nothing when it is admitted already. Ends the action when the policies shut it out and nothing can let it in.
 */
export async function admitOperatorOrExit(
  context: InfraContext,
  run: { accessKey: string; secretKey: string; organizationId: string; passphrase: string; stack: string },
): Promise<void> {
  const operator = await describeKey(run).catch(() => undefined);
  if (operator?.bearer !== 'application') return;
  try {
    const admitted = await admitOperatorToBuckets({
      appConfig: context.appConfig,
      mode: context.environment,
      projectId: context.projectId,
      organizationId: run.organizationId,
      stack: run.stack,
      operator: { accessKey: run.accessKey, secretKey: run.secretKey, applicationId: operator.bearerId },
      passphrase: run.passphrase,
    });
    if (admitted.length > 0) console.info(`${checkMark} The operator is admitted to the buckets now: ${admitted.join(', ')}.`);
  } catch (error) {
    console.error(`${warningMark} Could not admit the operator to the buckets: ${errorMessage(error)}.`);
    endAction(1);
  }
}
