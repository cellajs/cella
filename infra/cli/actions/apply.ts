import { actionCommand, actionLabel } from '../../lib/operator-actions';
import { resolveOperatorIdentity } from '../../lib/scaleway/operator-identity';
import { pc } from '../../lib/utils/cli-output';
import { endAction, type InfraContext } from '../shared';
import { printRevokeReminder } from './owner-key';
import { askToApply, type ReviewedPlan, reviewPlan } from './plan';
import { runPrivilegedConverge } from './privileged-converge';

/**
 * Plan, ask, then one `pulumi up` with the Owner API key in SCW_* env, for changes to privileged resources (registry IAM principals and policies, DB, VPC, private network) the read-only CI key cannot make.
 * The admin application key is enough to plan, so the Owner API key and the stack lock are taken only for a plan the operator said yes to.
 * It runs against a bootstrapped stack with live compute, so it must NOT set the computeDeferred marker, which belongs to the fresh-provision flow in setup.ts.
 */
export async function runApply(context: InfraContext): Promise<void> {
  console.info(
    pc.dim(`\n${actionLabel('apply')}: plan what differs between the code and the live stack, ask, then apply it with your Owner API key.\n`),
  );

  const { admin } = resolveOperatorIdentity();
  let reviewed: ReviewedPlan | undefined;
  if (admin) {
    reviewed = await reviewPlan(context, admin);
    if (!(await askToApply(context.environment))) {
      console.info('Declined; nothing applied.');
      return;
    }
  } else {
    console.info(
      pc.dim(
        `No admin application key on this machine (\`${actionCommand('fetch-admin-key')}\` stores it): the plan is made with your Owner API key, under the stack lock.`,
      ),
    );
  }

  console.warn(
    `${pc.yellow(pc.bold('⚠  Keep this run in the foreground.'))} ${pc.dim(`If it is interrupted, run "${actionLabel('apply')}" again to converge.`)}`,
  );

  // Established stacks apply compute directly and recover from interruption by rerunning `up`; fresh-provision deferral here would tear down the live VMs and load balancer.
  // `pnpm infra --debug-provider` (or INFRA_DEBUG_PROVIDER=1) keeps the engine and provider log of the up under infra/.debug/ for a post-mortem.
  const debugProvider = process.argv.includes('--debug-provider') || process.env.INFRA_DEBUG_PROVIDER === '1';
  const { completed, verified, ownerKeyPasted } = await runPrivilegedConverge(context, {
    operation: 'apply',
    confirmPlan: true,
    reviewed,
    verifyAfter: true,
    debugProvider,
  });
  if (completed && ownerKeyPasted) printRevokeReminder();
  if (completed && verified === false) endAction(1);
}
