import { actionCommand, actionLabel } from '../../lib/operator-actions';
import { pc, warningMark } from '../../lib/utils/cli-output';
import { errorMessage } from '../../lib/utils/errors';
import { endAction, type InfraContext, resolveVerifiedPassphrase, stackNameFor } from '../shared';
import { exitOnIdentityChanges } from './identity';
import { admitOperatorOrExit, runOperatorApply } from './operator-apply';
import { acquirePrivilegedKey } from './operator-unlock';
import { askToApply, reviewPlan } from './plan';
import { startBlockedTarget } from './start-deploy';

/**
 * Plan, ask, then one `pulumi up` with the operator key in SCW_* env, for changes to privileged resources (DB, VPC, private network, buckets, DNS) the read-only CI key cannot make.
 * The machine policies and the registry's applications are IAM, written by `pnpm infra identity` with an Owner API key, never by this apply.
 * The plan is made before the stack lock, so the lock is taken only for a plan the operator said yes to.
 * It runs against a bootstrapped stack with live compute, so it must NOT set the computeDeferred marker, which belongs to the fresh-provision flow in setup.ts.
 */
export async function runApply(context: InfraContext): Promise<void> {
  console.info(
    pc.dim(`\n${actionLabel('apply')}: plan what differs between the code and the live stack, ask, then apply it with your operator key.\n`),
  );

  // The plan is made before the lock, so the operator says yes before anything is held; the lock comes with the `up`.
  const operator = await acquirePrivilegedKey(context);
  const passphrase = await resolveVerifiedPassphrase(context.stackYaml);
  await admitOperatorOrExit(context, { ...operator, passphrase, stack: stackNameFor(context) });
  // A missing identity would break the plan itself: the program looks up every application it names.
  await exitOnIdentityChanges(context, operator);
  const reviewed = await reviewPlan(context, operator, { forgetRetired: true });
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
  });
  if (completed && verified === false) endAction(1);
  if (completed) {
    await startBlockedTarget(context, operator).catch((error) =>
      console.warn(`${warningMark} Could not start the blocked target again (${errorMessage(error)}): \`${actionCommand('start-deploy')}\` does.`),
    );
  }
}
