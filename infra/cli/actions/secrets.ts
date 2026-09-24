import { emitKeypressEvents } from 'node:readline';
import { confirm, select } from '@inquirer/prompts';
import { resolveOperatorIdentity } from '../../lib/scaleway/operator-identity';
import { principalNames } from '../../lib/scaleway/principals';
import { pc } from '../../lib/utils/cli-output';
import { BACK, manageRuntimeSecrets } from '../../tasks/manage-runtime-secrets';
import { maskedSecret } from '../prompts/masked-secret';
import type { InfraContext } from '../shared';
import { acquireOwnerKey, printRevokeReminder } from './owner-key';

type PromptOption<T extends string> = { name: string; value: T; description?: string };

/**
 * `select` that also resolves the {@link BACK} sentinel on Esc, so a prompt can return to the previous menu without forcing a choice.
 * Inquirer's select has no native Esc handling, so it is aborted via an AbortController driven by a stdin keypress listener.
 */
function selectWithEscape<T extends string>(options: {
  message: string;
  choices: Array<PromptOption<T>>;
}): Promise<T | typeof BACK> {
  const controller = new AbortController();
  const onKeypress = (_chunk: unknown, key?: { name?: string }) => {
    if (key?.name === 'escape') controller.abort();
  };
  emitKeypressEvents(process.stdin);
  process.stdin.on('keypress', onKeypress);
  return select<T>(options, { signal: controller.signal })
    .then(
      (value): T | typeof BACK => value,
      (error: unknown): T | typeof BACK => {
        // An aborted prompt is the operator stepping back, not a failure.
        if (error instanceof Error && error.name === 'AbortPromptError') return BACK;
        throw error;
      },
    )
    .finally(() => {
      process.stdin.removeListener('keypress', onKeypress);
    });
}

/**
 * Manage this environment's runtime secrets. Writing a secret version or minting a managed key needs Secret Manager write and IAMManager, which
 * the admin application key lacks, so this takes the Owner API key the way every privileged action does (SCW_OWNER_*, else a prompt).
 */
export async function runSecrets(context: InfraContext): Promise<void> {
  const { appConfig, projectId } = context;
  console.info(
    pc.dim(
      '\n→ Manage runtime secrets writes Secret Manager, which the admin application key cannot: it uses your Owner API key.',
    ),
  );
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
