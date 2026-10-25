import { spawnSync } from 'node:child_process';
import { confirm } from '@inquirer/prompts';
import { menuPath } from '../../lib/operator-actions';
import { type KeyPair, organizationIdOfKey } from '../../lib/scaleway/operator-identity';
import { buildProviderEnv } from '../../lib/scaleway/provider-env';
import { projectAccessKey, stateKeyOf } from '../../lib/scaleway/s3-client';
import { makeControlClient, stateBucket } from '../../lib/stack/control-store';
import { type PlanBasis, readPlanBasis } from '../../lib/stack/plan-basis';
import { pc, warningMark } from '../../lib/utils/cli-output';
import { errorMessage } from '../../lib/utils/errors';
import { infraDir } from '../../lib/utils/paths';
import { acquireStackLockOrExit, endAction, type InfraContext, pulumiLoginAndSelect, resolveVerifiedPassphrase, stackNameFor } from '../shared';

/** The `pulumi preview` arguments of a plan an operator reviews. `--refresh` reads every resource live first, so drift made outside Pulumi (a rule re-scoped in the console) is part of the diff. */
export function planArgs(stack: string, configFile?: string): string[] {
  return ['preview', '--stack', stack, '--diff', '--refresh', ...(configFile ? ['--config-file', configFile] : [])];
}

/** Print the plan in the terminal and resolve to Pulumi's exit status. */
export function showPlan(env: NodeJS.ProcessEnv, stack: string, configFile?: string): number {
  const args = planArgs(stack, configFile);
  console.info(`\n→ pulumi preview (the plan an apply carries out)\n  $ pulumi ${args.join(' ')}`);
  return spawnSync('pulumi', args, { cwd: infraDir, env, stdio: 'inherit' }).status ?? 1;
}

/** The one question between a plan and its `up`. */
export function askToApply(environment: string): Promise<boolean> {
  return confirm({ message: `Apply this plan to ${environment}?`, default: false });
}

/** A plan shown before the stack is locked. */
export interface ReviewedPlan {
  /** The passphrase verified for the plan, so the apply does not ask for it again. */
  passphrase: string;
  /** What the plan was computed from. Undefined when the state bucket could not be read: the apply then plans again under the lock. */
  basis?: PlanBasis;
}

/**
 * Show the plan of what an apply would change, with the operator key, before anything is locked or written. The provider authenticates from SCW_* env, never from stack config, in the environment the operator apply builds
 * (organization id, privileged marker). A deploy applies only the part of such a diff that is not privileged, and stops while a privileged
 * change is pending. Nothing is locked or written: the returned basis lets the apply tell whether the plan still holds once it is.
 */
export async function reviewPlan(context: InfraContext, key: KeyPair, opts: { forgetRetired?: boolean } = {}): Promise<ReviewedPlan> {
  if (context.state !== 'bootstrapped') {
    console.error(`${warningMark} A plan needs a fully bootstrapped stack (state=${context.state}). Run "${menuPath('resume')}" first.`);
    endAction(1);
  }
  const { projectId, appConfig } = context;
  const passphrase = await resolveVerifiedPassphrase(context.stackYaml);
  const stack = stackNameFor(context);

  // The Pulumi program requires the organization id (pulumi-context.ts requireEnv): SCW_ORGANIZATION_ID / SCW_DEFAULT_ORGANIZATION_ID from the env, else what IAM says about the key.
  let organizationId: string;
  try {
    organizationId = await organizationIdOfKey(key, projectId);
  } catch (error) {
    console.error(
      `${warningMark} Could not resolve the organization id (${errorMessage(error)}). Set SCW_ORGANIZATION_ID (backend/.env) or SCW_DEFAULT_ORGANIZATION_ID and re-run.`,
    );
    endAction(1);
  }

  // The operator key serves both sides: the provider reads and the state bucket, which admits it.
  const env = buildProviderEnv(infraDir, { ...key, projectId, passphrase, organizationId });
  pulumiLoginAndSelect(infraDir, env, appConfig, stack);

  // An apply first takes retired resources out of the state, under the stack lock, so its plan shows none of them as deleted: they stay live
  // (lib/stack/retired-state.ts). A preview leaves the state as it is.
  if (opts.forgetRetired) {
    const lock = await acquireStackLockOrExit({
      appConfig,
      ...stateKeyOf(key, projectId),
      stack,
      operation: 'forget-retired-resources',
    });
    try {
      const forget = spawnSync('pnpm', ['--filter', 'infra', 'forget-retired-resources', '--stack', stack], { cwd: infraDir, env, stdio: 'inherit' });
      if (forget.status !== 0) {
        console.error(`${warningMark} forget-retired-resources failed (exit ${forget.status}). Nothing was planned or applied.`);
        endAction(forget.status ?? 1);
      }
    } finally {
      await lock.release();
    }
  }

  // Read before the plan runs, so a deploy that lands while Pulumi computes it counts as a change too.
  const basis = await makeControlClient(appConfig.s3.region, projectAccessKey(key.accessKey, projectId), key.secretKey)
    .then((s3) => readPlanBasis(s3, stateBucket(appConfig.slug), stack))
    .catch(() => undefined);

  const status = showPlan(env, stack);
  if (status !== 0) {
    console.error(`\n${warningMark} pulumi preview exited ${status}. Check provider auth (SCW_* env) and the passphrase.`);
    endAction(status);
  }
  console.info(
    `\n${pc.dim('The preview applied nothing. A clean "no changes" result means the stack matches the code; a deploy stops on any privileged change in it.')}`,
  );
  return { passphrase, basis };
}
