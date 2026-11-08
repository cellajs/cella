import { confirm } from '@inquirer/prompts';
import { actionCommand } from '../../lib/operator-actions';
import { resolveOperatorIdentity } from '../../lib/scaleway/operator-identity';
import { warningMark } from '../../lib/utils/cli-output';
import { errorMessage } from '../../lib/utils/errors';
import { BACK, manageRuntimeSecrets } from '../../tasks/manage-runtime-secrets';
import type { MenuItem } from '../menu';
import { maskedSecret } from '../prompts/masked-secret';
import { ESCAPED, menuSelect } from '../prompts/menu-select';
import { autoAcceptDefaults, confirmOrDefault, type InfraContext } from '../shared';
import { acquireIdentityKey, acquireOperatorKey, type OperatorKey } from './operator-unlock';
import type { OwnerKey } from './owner-key';
import { printRevokeReminder } from './owner-key';
import { runStartDeploy, startBlockedTarget } from './start-deploy';

/** The runtime-secrets picks through the CLI's menu select: Esc steps back and resolves to the {@link BACK} sentinel. */
async function selectWithEscape<T extends string>(options: { message: string; choices: Array<MenuItem<T>>; default?: T }): Promise<T | typeof BACK> {
  const picked = await menuSelect({ message: options.message, items: options.choices, default: options.default, escape: 'back' });
  return picked === ESCAPED ? BACK : picked;
}

/**
 * This environment's env vars and secrets as one table, read with the observer key; a picked row is set, rotated, deleted or minted. A
 * write takes the operator key, asked for at the first one, or up front on a machine without an observer key. Minting a managed key
 * writes IAM, which takes an Owner API key, asked for when a mint is confirmed. A deploy that ended blocked, on a missing secret among
 * others, is started again at the end; else a changed value is offered a deploy.
 */
export async function runSecrets(context: InfraContext): Promise<void> {
  const { appConfig, projectId } = context;
  let operator: OperatorKey | undefined;
  const operatorKey = async () => {
    operator ??= await acquireOperatorKey(context);
    return operator;
  };
  const reader = resolveOperatorIdentity().observer ?? (await operatorKey());
  let identityKey: OwnerKey | undefined;
  let changed = false;

  try {
    ({ changed } = await manageRuntimeSecrets({
      readKey: reader.secretKey,
      writeKey: async () => (await operatorKey()).secretKey,
      identityKey: async () => {
        identityKey ??= await acquireIdentityKey(context, 'Minting a managed key creates an application, a policy and a key.');
        return identityKey;
      },
      projectId,
      region: appConfig.s3.region,
      slug: appConfig.slug,
      mode: context.environment,
      pick: Boolean(process.stdin.isTTY) && !autoAcceptDefaults(),
      prompts: { select: selectWithEscape, password: maskedSecret, confirm },
    }));
  } finally {
    await identityKey?.release();
  }
  if (identityKey) printRevokeReminder();
  const restarted = operator
    ? await startBlockedTarget(context, operator).catch((error) => {
        console.warn(`${warningMark} Could not start the blocked deploy again (${errorMessage(error)}): \`${actionCommand('start-deploy')}\` does.`);
        return false;
      })
    : false;
  if (!changed || restarted) return;
  console.info('\nA new value reaches the machines at the next deploy.');
  if (await confirmOrDefault({ message: 'Deploy now, so the machines get it?', default: false })) await runStartDeploy(context);
}
