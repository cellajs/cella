import { spawnSync } from 'node:child_process';
import { input } from '@inquirer/prompts';
import { actionLabel } from '../../lib/operator-actions';
import { buildProviderEnv } from '../../lib/scaleway/provider-env';
import { stateKeyOf } from '../../lib/scaleway/s3-client';
import { checkMark, crossMark, pc, warningMark } from '../../lib/utils/cli-output';
import { infraDir } from '../../lib/utils/paths';
import {
  acquireStackLockOrExit,
  confirmOrDefault,
  endAction,
  type InfraContext,
  pulumiLoginAndSelect,
  resolveVerifiedPassphrase,
  stackNameFor,
} from '../shared';
import { acquirePrivilegedKey } from './operator-unlock';

/**
 * Remove one resource from the environment's Pulumi state, on the operator key: a resource the program no longer declares whose live object is
 * gone already, which an apply would try to delete and cannot. The live object must be gone first, or it is left without an owner. Says
 * whether the state lists the URN, asks, then runs `pulumi state delete` under the stack lock.
 */
export async function runStatePrune(context: InfraContext): Promise<void> {
  const { appConfig, projectId } = context;
  console.info(
    pc.dim(`\n${actionLabel('state-prune')}: one resource out of the state of ${context.environment}; the live object must be gone already.\n`),
  );
  const urn = (await input({ message: 'The URN to remove (verbatim, as `pulumi stack --show-urns` prints it)' })).trim();
  if (!urn.startsWith('urn:pulumi:')) {
    console.error(`${crossMark} '${urn}' is no Pulumi URN.`);
    return endAction(1);
  }

  const passphrase = await resolveVerifiedPassphrase(context.stackYaml);
  const operator = await acquirePrivilegedKey(context);
  const stack = stackNameFor(context);
  const env = buildProviderEnv(infraDir, { accessKey: operator.accessKey, secretKey: operator.secretKey, projectId, passphrase });
  pulumiLoginAndSelect(infraDir, env, appConfig, stack);
  const stateKey = stateKeyOf(operator, projectId);
  const lock = await acquireStackLockOrExit({ appConfig, ...stateKey, stack, operation: 'state-prune' });
  try {
    const listed = spawnSync('pulumi', ['stack', '--show-urns', '--stack', stack], { cwd: infraDir, env, encoding: 'utf8' });
    if (!listed.stdout?.includes(urn)) {
      console.warn(`${warningMark} The state of ${context.environment} does not list that URN: nothing to remove.`);
      return;
    }
    if (!(await confirmOrDefault({ message: `Remove ${urn} from the state of ${context.environment}?`, default: false }))) return;
    const removed = spawnSync('pulumi', ['state', 'delete', urn, '--yes', '--stack', stack], { cwd: infraDir, env, stdio: 'inherit' });
    if (removed.status !== 0) {
      console.error(`${crossMark} pulumi state delete exited ${removed.status}.`);
      return endAction(1);
    }
    console.info(`${checkMark} Removed. The next apply or deploy converges without it.`);
  } finally {
    await lock.release();
  }
}
