import { spawnSync } from 'node:child_process';
import { confirm } from '@inquirer/prompts';
import { menuPath } from '../../lib/operator-actions';
import { type KeyPair, organizationIdOfKey } from '../../lib/scaleway/operator-identity';
import { buildProviderEnv } from '../../lib/scaleway/provider-env';
import { projectAccessKey } from '../../lib/scaleway/s3-client';
import { makeControlClient, readObjectEtag, stateBucket } from '../../lib/stack/control-store';
import { checkpointKey } from '../../lib/stack/pending-operations';
import { warningMark } from '../../lib/utils/cli-output';
import { errorMessage } from '../../lib/utils/errors';
import { infraDir } from '../../lib/utils/paths';
import { endAction, type InfraContext, pulumiLoginAndSelect, pulumiLoginUrl, stackNameFor } from '../shared';

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
  /**
   * The etag of the stack's checkpoint the plan was computed from, null when there was none: every `up` changes it, and a preview writes
   * none. Undefined when the state bucket could not be read: the apply then plans again under the lock.
   */
  checkpoint?: string | null;
}

/**
 * Show the plan of what an apply would change, with the operator key, before anything is locked or written. The provider authenticates from SCW_* env, never from stack config, in the environment the operator apply builds
 * (organization id). Nothing is locked or written: the returned checkpoint lets the apply tell whether the plan still holds once it is.
 */
export async function reviewPlan(context: InfraContext, key: KeyPair, opts: { engineImage?: string } = {}): Promise<ReviewedPlan> {
  if (context.state !== 'bootstrapped') {
    console.error(`${warningMark} A plan needs a fully bootstrapped stack (state=${context.state}). Run "${menuPath('resume')}" first.`);
    endAction(1);
  }
  const { projectId, appConfig } = context;
  const stack = stackNameFor(context);

  // The Pulumi program requires the organization id (pulumi-context.ts requireEnv): SCW_DEFAULT_ORGANIZATION_ID from the env, else what IAM says about the key.
  let organizationId: string;
  try {
    organizationId = await organizationIdOfKey(key, projectId);
  } catch (error) {
    console.error(
      `${warningMark} Could not resolve the organization id (${errorMessage(error)}). Set SCW_DEFAULT_ORGANIZATION_ID (.env) and re-run.`,
    );
    endAction(1);
  }

  // The operator key serves both sides: the provider reads and the state bucket, which admits it.
  const env = buildProviderEnv(infraDir, { ...key, projectId, stateBackendUrl: pulumiLoginUrl(appConfig), organizationId });
  // The engine image the apply just pushed, which the plan shows on the main job; without one the program keeps the applied engine's.
  if (opts.engineImage) env.INFRA_ENGINE_IMAGE = opts.engineImage;
  pulumiLoginAndSelect(infraDir, env, appConfig, stack);

  // Read before the plan runs, so an apply whose `up` completes and writes the checkpoint while the preview runs counts as a change too.
  const checkpoint = await makeControlClient(appConfig.s3.region, projectAccessKey(key.accessKey, projectId), key.secretKey)
    .then((s3) => readObjectEtag(s3, stateBucket(appConfig.slug), checkpointKey(stack)))
    .catch(() => undefined);

  const status = showPlan(env, stack);
  if (status !== 0) {
    console.error(`\n${warningMark} pulumi preview exited ${status}. Check provider auth (SCW_* env).`);
    endAction(status);
  }
  return { checkpoint };
}
