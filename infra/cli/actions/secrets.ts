import { confirm } from '@inquirer/prompts';
import { resolveOperatorIdentity } from '../../lib/scaleway/operator-identity';
import { principalNames } from '../../lib/scaleway/principals';
import { pc } from '../../lib/utils/cli-output';
import { BACK, manageRuntimeSecrets } from '../../tasks/manage-runtime-secrets';
import { maskedSecret } from '../prompts/masked-secret';
import { ESCAPED, menuSelect } from '../prompts/menu-select';
import type { InfraContext } from '../shared';
import { acquireOwnerKey, printRevokeReminder } from './owner-key';

type PromptOption<T extends string> = { name: string; value: T; description?: string };

/** The runtime-secrets menus through the CLI's menu select: Esc steps back and resolves to the {@link BACK} sentinel. */
async function selectWithEscape<T extends string>(options: { message: string; choices: Array<PromptOption<T>> }): Promise<T | typeof BACK> {
  const picked = await menuSelect({ message: options.message, items: options.choices, escape: 'back' });
  return picked === ESCAPED ? BACK : picked;
}

/**
 * Manage this environment's runtime secrets. Writing a secret version or minting a managed key needs Secret Manager write and IAMManager, which
 * the admin application key lacks, so this takes the Owner API key the way every privileged action does (SCW_OWNER_*, else a prompt).
 */
export async function runSecrets(context: InfraContext): Promise<void> {
  const { appConfig, projectId } = context;
  console.info(pc.dim('\n→ Manage runtime secrets writes Secret Manager, which the admin application key cannot: it uses your Owner API key.'));
  const ownerKey = await acquireOwnerKey({
    identity: resolveOperatorIdentity(),
    names: principalNames(appConfig.slug, context.environment),
    projectId,
    slug: appConfig.slug,
    mode: context.environment,
  });

  try {
    await manageRuntimeSecrets({
      secretKey: ownerKey.secretKey,
      projectId,
      region: appConfig.s3.region,
      slug: appConfig.slug,
      mode: context.environment,
      path: `/${appConfig.slug}-${context.environment}/`,
      prompts: { select: selectWithEscape, password: maskedSecret, confirm },
    });
  } finally {
    await ownerKey.release();
  }
  if (ownerKey.pasted) printRevokeReminder();
}
