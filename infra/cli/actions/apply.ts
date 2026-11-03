import { actionCommand, actionLabel } from '../../lib/operator-actions';
import { crossMark, pc, warningMark } from '../../lib/utils/cli-output';
import { errorMessage } from '../../lib/utils/errors';
import { type PublishedEngine, publishEngine } from '../../tasks/publish-engine';
import { endAction, type InfraContext } from '../shared';
import { openDbEndpoints } from './db-exposure';
import { exitOnIdentityChanges } from './identity';
import { admitOperatorOrExit, runOperatorApply } from './operator-apply';
import { acquireOperatorKey } from './operator-unlock';
import { askToApply, reviewPlan } from './plan';
import { startBlockedTarget } from './start-deploy';

/**
 * Publish the engine image of this checkout, plan, ask, then one `pulumi up` with the operator key in SCW_* env, for changes to privileged
 * resources (DB, VPC, private network, buckets, DNS, the main job and its engine) the read-only CI key cannot make.
 * The declared applications and their policies are IAM, written by `pnpm infra identity` with an Owner API key, never by this apply.
 * The plan is made before the lease is taken, so it is taken only for a plan the operator said yes to.
 * It runs against a bootstrapped stack, so it must NOT set the computeDeferred marker, which belongs to the fresh-provision flow in setup.ts.
 */
export async function runApply(context: InfraContext): Promise<void> {
  console.info(
    pc.dim(`\n${actionLabel('apply')}: plan what differs between the code and the live stack, ask, then apply it with your operator key.\n`),
  );

  // The plan is made before the lock, so the operator says yes before anything is held; the lock comes with the `up`.
  const operator = await acquireOperatorKey(context);
  // The committed stack config never records an open endpoint, so its plan keeps the endpoint and deletes the ACL.
  const open = await openDbEndpoints(context, operator.secretKey);
  if (open.length > 0) {
    console.error(
      `${crossMark} Public DB endpoint ${open.join(', ')} is open, and an apply would remove its ACL. Close it with \`${actionCommand('db-close')}\`, then apply.`,
    );
    endAction(1);
  }
  await admitOperatorOrExit(context, operator);
  // A missing identity would break the plan itself: the program looks up every application it names.
  await exitOnIdentityChanges(context, operator);
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
  const reviewed = await reviewPlan(context, operator, { forgetRetired: true, engineImage: engine?.image });
  if (!(await askToApply(context.environment))) {
    console.info('Declined; nothing applied.');
    return;
  }

  console.warn(
    `${pc.yellow(pc.bold('⚠  Keep this run in the foreground.'))} ${pc.dim(`If it is interrupted, run "${actionLabel('apply')}" again to converge.`)}`,
  );

  // Established stacks apply compute directly and recover from interruption by rerunning `up`; fresh-provision deferral here would tear down the live VMs and load balancer.
  // `pnpm infra --debug-provider` (or INFRA_DEBUG_PROVIDER=1) keeps the engine and provider log of the up under infra/.debug/ for a post-mortem.
  const debugProvider = process.argv.includes('--debug-provider') || process.env.INFRA_DEBUG_PROVIDER === '1';
  const { completed, verified } = await runOperatorApply(context, {
    operation: 'apply',
    confirmPlan: true,
    reviewed,
    verifyAfter: true,
    debugProvider,
    engine,
  });
  if (completed && verified === false) endAction(1);
  if (completed) {
    await startBlockedTarget(context, operator).catch((error) =>
      console.warn(`${warningMark} Could not start the blocked target again (${errorMessage(error)}): \`${actionCommand('start-deploy')}\` does.`),
    );
  }
}
