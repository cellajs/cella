import { actionCommand, actionLabel } from '../../lib/operator-actions';
import { crossMark, pc, warningMark } from '../../lib/utils/cli-output';
import { errorMessage } from '../../lib/utils/errors';
import { discardEngine, type PublishedEngine, publishEngine } from '../../tasks/publish-engine';
import { endAction, type InfraContext } from '../shared';
import { openDbEndpoints } from './db-exposure';
import { dropKeptPassphrase } from './drop-passphrase';
import { exitOnIdentityChanges } from './identity';
import { exitWhenShutOutOfBuckets, runOperatorApply } from './operator-apply';
import { acquireOperatorKey } from './operator-unlock';
import { askToApply, reviewPlan } from './plan';
import { checkWaitingRelease } from './releases';
import { startBlockedTarget } from './start-deploy';

/**
 * Publish the engine image of this checkout, plan, ask, then one `pulumi up` with the operator key in SCW_* env, for changes to privileged
 * resources (DB, VPC, private network, buckets, DNS, the main job and its engine) the read-only CI key cannot make.
 * The declared applications and their policies are IAM, written by `pnpm infra identity` with an Owner API key, never by this apply.
 * The plan is made before the lease is taken, so it is taken only for a plan the operator said yes to.
 * It runs against a bootstrapped stack, so it must NOT set the computeDeferred marker, which belongs to the fresh-provision flow in setup.ts.
 */
export async function runApply(context: InfraContext): Promise<void> {
  console.info(pc.dim(`\n${actionLabel('apply')}: plan what differs between code and live stack and apply it.\n`));

  // The plan is made before the lock, so the operator says yes before anything is held; the lock comes with the `up`.
  const operator = await acquireOperatorKey(context);
  await exitWhenShutOutOfBuckets(context, operator);
  // Before anything runs Pulumi, the close of an open endpoint included.
  await dropKeptPassphrase(context, operator);
  // The committed stack config never records an open endpoint, so its plan keeps the endpoint and deletes the ACL.
  const open = await openDbEndpoints(context, operator.secretKey);
  if (open.length > 0) {
    console.error(
      `${crossMark} Public DB endpoint ${open.join(', ')} is open, and an apply would remove its ACL. Close it with \`${actionCommand('db-close')}\`, then apply.`,
    );
    endAction(1);
  }
  // A missing identity would break the plan itself: the program looks up every application it names.
  await exitOnIdentityChanges(context, operator);
  // A release waiting on an apply deploys only on the description of its own checkout: another one ends the action before the build.
  await checkWaitingRelease(context, operator);
  // Built and pushed before the plan, so the plan shows the main job's new image: until the `up` names it, nothing runs it.
  let engine: PublishedEngine | undefined;
  try {
    engine = await publishEngine({ appConfig: context.appConfig, projectId: context.projectId, secretKey: operator.secretKey });
  } catch (error) {
    console.error(`${crossMark} The engine image could not be published (${errorMessage(error)}). Nothing applied.`);
    return endAction(1);
  }
  if (!engine) {
    console.warn(`${warningMark} The registry has no namespace yet: this apply makes it, and the next one publishes the engine the main job runs.`);
  }
  const reviewed = await reviewPlan(context, operator, { engineImage: engine?.image });
  // A declined plan leaves no engine image behind: no definition names the one pushed for it.
  const discard = () => (engine ? discardEngine({ appConfig: context.appConfig, secretKey: operator.secretKey, engine }) : undefined);
  if (!(await askToApply(context.environment))) {
    await discard();
    console.info('Declined; nothing applied.');
    return;
  }

  console.warn(`${pc.yellow(pc.bold('⚠  Keep this terminal open.'))} ${pc.dim('If it stops, run it again.')}`);

  // An established stack recovers from an interruption by running the apply again; the first-provisioning marker is the setup's alone.
  // `pnpm infra --debug-provider` (or INFRA_DEBUG_PROVIDER=true) keeps the engine and provider log of the up under infra/.debug/ for a post-mortem.
  const debugProvider = process.argv.includes('--debug-provider') || process.env.INFRA_DEBUG_PROVIDER === 'true';
  const { completed, verified, declined } = await runOperatorApply(context, {
    operation: 'apply',
    confirmPlan: true,
    reviewed,
    verifyAfter: true,
    debugProvider,
    engine,
  });
  if (declined) await discard();
  if (completed) {
    await startBlockedTarget(context, operator).catch((error) =>
      console.warn(`${warningMark} Could not start the blocked target again (${errorMessage(error)}): \`${actionCommand('start-deploy')}\` does.`),
    );
  }
  // A verified difference is reported, not a failure of the apply: the target still starts, and the exit code says to look.
  if (completed && verified === false) endAction(1);
}
