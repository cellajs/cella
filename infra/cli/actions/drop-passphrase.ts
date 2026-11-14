import { spawnSync } from 'node:child_process';
import { buildProviderEnv } from '../../lib/scaleway/provider-env';
import { stateKeyOf } from '../../lib/scaleway/s3-client';
import { createSecretManagerClient } from '../../lib/scaleway/scaleway-secret-manager';
import { ENGINE_FOLDER } from '../../lib/scaleway/secret-paths';
import { checkMark, crossMark, pc } from '../../lib/utils/cli-output';
import { infraDir } from '../../lib/utils/paths';
import { acquireStackLockOrExit, endAction, type InfraContext, pulumiLoginAndSelect, pulumiLoginUrl, stackNameFor } from '../shared';
import type { OperatorKey } from './operator-unlock';

/** The engine folder's container of the passphrase a stack was encrypted with before every stack took the empty one. */
const keptPassphraseName = 'pulumi-passphrase';

/**
 * Move a stack off the passphrase its engine folder still keeps, onto the empty one every stack takes (lib/scaleway/provider-env.ts),
 * before an apply plans. Under the lease, Pulumi encrypts the state and the stack file anew, then the kept copy is deleted. Nothing for a
 * stack whose engine folder keeps none. A move whose last step failed leaves a stack that opens with the empty passphrase beside a kept
 * copy: the second try finds that, and deletes the copy. Ends the action when neither passphrase opens the stack.
 */
export async function dropKeptPassphrase(context: InfraContext, operator: OperatorKey): Promise<void> {
  const { appConfig, projectId } = context;
  const secrets = createSecretManagerClient({ secretKey: operator.secretKey, region: appConfig.s3.region, projectId });
  const kept = await secrets.getSecretByName(keptPassphraseName, ENGINE_FOLDER);
  if (!kept) return;

  const stack = stackNameFor(context);
  const env = buildProviderEnv(infraDir, { ...operator, projectId, stateBackendUrl: pulumiLoginUrl(appConfig) });
  pulumiLoginAndSelect(infraDir, env, appConfig, stack);
  // Non-interactive and without a terminal, Pulumi takes the empty passphrase as the new one. It refuses an old one that does not
  // decrypt what the state holds.
  const moveFrom = (passphrase: string) =>
    spawnSync('pulumi', ['stack', 'change-secrets-provider', 'passphrase', '--stack', stack, '--non-interactive'], {
      cwd: infraDir,
      env: { ...env, PULUMI_CONFIG_PASSPHRASE: passphrase },
      stdio: ['ignore', 'ignore', 'pipe'],
      encoding: 'utf8',
    });

  console.info(pc.dim(`\n→ Moving ${context.environment} to the empty Pulumi passphrase: its state holds no secret value…`));
  const lock = await acquireStackLockOrExit({ appConfig, ...stateKeyOf(operator, projectId), stack, operation: 'drop-passphrase' });
  let failure: string | undefined;
  try {
    const passphrase = (kept.version_count ?? 0) > 0 ? await secrets.accessLatestValue(kept.id) : '';
    const moved = moveFrom(passphrase);
    if (moved.status !== 0 && moveFrom('').status !== 0) failure = moved.stderr.trim();
  } finally {
    await lock.release();
  }
  if (failure !== undefined) {
    console.error(
      `${crossMark} The passphrase ${ENGINE_FOLDER} keeps does not open ${stack} (${failure}). Put the one from your password manager in '${keptPassphraseName}' there, in the console, then apply again. Nothing applied.`,
    );
    endAction(1);
  }
  await secrets.deleteSecret(kept.id);
  console.info(`${checkMark} Done. Commit infra/Pulumi.${context.environment}.yaml: its encryptionsalt changed.`);
}
