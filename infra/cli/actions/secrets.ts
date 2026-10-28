import { confirm } from '@inquirer/prompts';
import { actionCommand } from '../../lib/operator-actions';
import { pc, warningMark } from '../../lib/utils/cli-output';
import { errorMessage } from '../../lib/utils/errors';
import { BACK, manageRuntimeSecrets } from '../../tasks/manage-runtime-secrets';
import { maskedSecret } from '../prompts/masked-secret';
import { ESCAPED, menuSelect } from '../prompts/menu-select';
import type { InfraContext } from '../shared';
import { acquireIdentityKey, acquirePrivilegedKey } from './operator-unlock';
import type { OwnerKey } from './owner-key';
import { printRevokeReminder } from './owner-key';
import { startBlockedTarget } from './start-deploy';

type PromptOption<T extends string> = { name: string; value: T; description?: string };

/** The runtime-secrets menus through the CLI's menu select: Esc steps back and resolves to the {@link BACK} sentinel. */
async function selectWithEscape<T extends string>(options: { message: string; choices: Array<PromptOption<T>> }): Promise<T | typeof BACK> {
  const picked = await menuSelect({ message: options.message, items: options.choices, escape: 'back' });
  return picked === ESCAPED ? BACK : picked;
}

/**
 * Manage this environment's runtime secrets. Writing a secret version needs Secret Manager write, so this takes the operator key the
 * way every privileged action does. Minting a managed key writes IAM, which takes an Owner API key, asked
 * for when a mint is confirmed. A deploy that ended blocked, on a missing secret among others, is started again at the end.
 */
export async function runSecrets(context: InfraContext): Promise<void> {
  const { appConfig, projectId } = context;
  console.info(pc.dim('\n→ Manage runtime secrets writes Secret Manager: it uses your operator key.'));
  const operator = await acquirePrivilegedKey(context);
  let identityKey: OwnerKey | undefined;

  try {
    await manageRuntimeSecrets({
      secretKey: operator.secretKey,
      identityKey: async () => {
        identityKey ??= await acquireIdentityKey(context, 'Minting a managed key creates an application, a policy and a key.');
        return identityKey;
      },
      projectId,
      region: appConfig.s3.region,
      slug: appConfig.slug,
      mode: context.environment,
      path: `/${appConfig.slug}-${context.environment}/`,
      prompts: { select: selectWithEscape, password: maskedSecret, confirm },
    });
  } finally {
    await identityKey?.release();
  }
  if (identityKey) printRevokeReminder();
  await startBlockedTarget(context, operator).catch((error) =>
    console.warn(`${warningMark} Could not start the blocked deploy again (${errorMessage(error)}): \`${actionCommand('start-deploy')}\` does.`),
  );
}
