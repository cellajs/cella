import { pc } from '../../lib/utils/cli-output';
import type { InfraContext } from '../shared';
import { printRevokeReminder } from './owner-key';
import { runPrivilegedConverge } from './privileged-converge';

/**
 * One-shot `pulumi up` with the Owner API key in SCW_* env, for changes to privileged resources (registry IAM principals and policies, DB, VPC, private network) the read-only CI key cannot make.
 * It runs against a bootstrapped stack with live compute, so it must NOT set the computeDeferred marker, which belongs to the fresh-provision flow in setup.ts.
 */
export async function runApply(context: InfraContext): Promise<void> {
  console.info(
    pc.dim(
      '\nApply infra change: ensure registry IAM principals, preview the plan with your Owner API key, confirm, then pulumi up.\n',
    ),
  );

  console.warn(
    `${pc.yellow(pc.bold('⚠  Keep this run in the foreground.'))} ${pc.dim('If it is interrupted, re-run "Apply infra change" to converge.')}`,
  );

  // Established stacks apply compute directly and recover from interruption by rerunning `up`; fresh-provision deferral here would tear down the live VMs and load balancer.
  // `pnpm infra --debug-provider` (or INFRA_DEBUG_PROVIDER=1) keeps the engine and provider log of the up under infra/.debug/ for a post-mortem.
  const debugProvider = process.argv.includes('--debug-provider') || process.env.INFRA_DEBUG_PROVIDER === '1';
  const { completed, verified, ownerKeyPasted } = await runPrivilegedConverge(context, {
    operation: 'apply',
    confirmPlan: true,
    verifyAfter: true,
    debugProvider,
  });
  if (completed && ownerKeyPasted) printRevokeReminder();
  if (completed && verified === false) process.exit(1);
}
