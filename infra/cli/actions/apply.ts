import { confirm } from '@inquirer/prompts';
import { pc } from '../../lib/utils/cli-output';
import type { InfraContext } from '../shared';
import { printRevokeReminder, runPrivilegedConverge } from './privileged-converge';

/**
 * One-shot `pulumi up` with a freshly-supplied bootstrap key in SCW_* env, for changes to bootstrap-owned resources (DB / VPC / private network) the read-only CI key cannot make.
 * It runs against a bootstrapped stack with live compute, so it must NOT set the computeDeferred marker, which belongs to the fresh-provision flow in setup.ts.
 */
export async function runApply(context: InfraContext): Promise<void> {
  console.info(pc.dim('\nApply infra change: run pulumi up with a bootstrap key (supplied via env).\n'));

  if (
    !(await confirm({
      message: `Swap stack creds to bootstrap key and run \`pulumi up\` on ${context.environment}?`,
      default: true,
    }))
  ) {
    console.info('Aborted; no changes made.');
    return;
  }

  console.warn(
    `${pc.yellow(pc.bold('⚠  Keep this run in the foreground.'))} ${pc.dim('If it is interrupted, re-run "Apply infra change" to converge.')}`,
  );

  // Established stacks apply compute directly and recover from interruption by rerunning `up`; fresh-provision deferral here would tear down the live VMs and load balancer.
  await runPrivilegedConverge(context, { operation: 'apply' });
  printRevokeReminder();
}
