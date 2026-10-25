import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { buildProviderEnv } from '../../lib/scaleway/provider-env';
import { generatePassphrase, supportsStdinPassphraseRotation, verifyStackPassphrase } from '../../lib/stack/pulumi-passphrase';
import { checkMark, crossMark, pc, warningMark } from '../../lib/utils/cli-output';
import { infraDir } from '../../lib/utils/paths';
import { passphraseCustody, rememberPassphrase } from '../session';
import {
  acquireStackLockOrExit,
  confirmPassphraseStored,
  endAction,
  type InfraContext,
  pulumiLoginAndSelect,
  resolveVerifiedPassphrase,
  stackNameFor,
} from '../shared';
import { operatorKeys } from './operator-unlock';

/**
 * Rotates and verifies the Pulumi passphrase, then stores it in Secret Manager, where the operator key and the main job read it.
 * The stack lock prevents CI reads during state re-encryption. No Scaleway resources are touched,
 * so state-bucket access is sufficient.
 */
export async function runRotatePassphrase(context: InfraContext): Promise<void> {
  if (!context.stackYaml || !/^encryptionsalt:/m.test(context.stackYaml)) {
    console.error(
      `${warningMark} "Rotate passphrase" requires an existing stack with encrypted state (state=${context.state}). A fresh setup generates its own passphrase.`,
    );
    endAction(1);
  }

  const versionOutput = spawnSync('pulumi', ['version'], { encoding: 'utf8' }).stdout?.trim() ?? '';
  if (!supportsStdinPassphraseRotation(versionOutput)) {
    console.error(
      `${crossMark} pulumi ${versionOutput} cannot rotate a passphrase non-interactively: v3.44.0 or newer is required. Upgrade: brew upgrade pulumi`,
    );
    endAction(1);
  }

  console.info(
    pc.dim(
      '\nRotate passphrase: re-encrypts the stack state and Pulumi.<stack>.yaml with a freshly generated passphrase, then stores it in Secret Manager. No Scaleway resources are touched: your operator key does the work, fetches the current passphrase and stores the new one.\n',
    ),
  );

  const oldPassphrase = await resolveVerifiedPassphrase(context.stackYaml);

  const { key, state } = await operatorKeys(context);
  const { accessKey, secretKey } = key;
  const targetStack = stackNameFor(context);

  const env = buildProviderEnv(infraDir, { accessKey, secretKey, projectId: context.projectId, passphrase: oldPassphrase });
  pulumiLoginAndSelect(infraDir, env, context.appConfig, targetStack);

  // Hold the stack lock across the re-encryption: a deploy reading state mid-rotation would decrypt against the wrong passphrase.
  const stackLock = await acquireStackLockOrExit({
    appConfig: context.appConfig,
    accessKey: state.accessKey,
    secretKey: state.secretKey,
    stack: targetStack,
    operation: 'rotate-passphrase',
  });

  // Shown and stored BEFORE the rotation runs, so a crash right after `change-secrets-provider` cannot leave state encrypted with a passphrase nobody has seen.
  const newPassphrase = generatePassphrase();
  await confirmPassphraseStored(newPassphrase, `New Pulumi passphrase ${pc.dim('(takes effect after the re-encryption below)')}`);

  console.info(
    `\n→ Re-encrypt stack secrets\n  $ pulumi stack change-secrets-provider passphrase --stack ${targetStack} ${pc.dim('(new passphrase piped on stdin)')}`,
  );
  const rotate = spawnSync('pulumi', ['stack', 'change-secrets-provider', 'passphrase', '--stack', targetStack, '--non-interactive'], {
    cwd: infraDir,
    env,
    input: `${newPassphrase}\n`,
    stdio: ['pipe', 'inherit', 'inherit'],
  });
  if (rotate.status !== 0) {
    await stackLock.release();
    console.error(
      `\n${crossMark} change-secrets-provider exited ${rotate.status}. The stack most likely still uses the OLD passphrase: verify before changing your password manager.`,
    );
    endAction(rotate.status ?? 1);
  }

  // Post-check: the rewritten stack yaml must decrypt with the new passphrase.
  const stackShort = targetStack.split('/').pop() ?? context.environment;
  const stackPath = resolve(infraDir, `Pulumi.${stackShort}.yaml`);
  let rotatedYaml: string;
  try {
    rotatedYaml = readFileSync(stackPath, 'utf8');
  } catch {
    await stackLock.release();
    console.error(
      `${crossMark} Could not read ${stackPath} after rotation. Verify manually which passphrase the stack now uses before updating anything else.`,
    );
    endAction(1);
  }
  if (!verifyStackPassphrase(rotatedYaml, newPassphrase)) {
    await stackLock.release();
    console.error(
      `${crossMark} Post-check failed: ${stackPath} does not verify against the new passphrase. Do not discard the old passphrase; investigate before retrying.`,
    );
    endAction(1);
  }
  console.info(`${checkMark} Stack re-encrypted: ${pc.cyan(`Pulumi.${stackShort}.yaml`)} verifies against the new passphrase.`);

  // The copy the operator key fetches and the main job reads by reference: without this write both would read the old passphrase.
  rememberPassphrase(newPassphrase);
  const custodied = (await passphraseCustody()?.store(newPassphrase)) ?? false;

  await stackLock.release();

  console.info(`\n${checkMark} ${pc.bold(pc.greenBright('Passphrase rotated.'))}`);
  console.info(
    `  1. Commit the updated ${pc.cyan(`infra/Pulumi.${stackShort}.yaml`)} (the encryptionsalt changed): a deploy runs on its target's stack file, so a target without this commit cannot read the state.`,
  );
  console.info(
    custodied
      ? '  2. Secret Manager holds the new passphrase: the operator key and the main job read it from now on.'
      : `  2. ${warningMark} Secret Manager was not updated (the session was unlocked with the passphrase, not the operator key): the next run asks for the new passphrase once and stores it.`,
  );
}
