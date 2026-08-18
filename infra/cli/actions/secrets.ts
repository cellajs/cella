import { emitKeypressEvents } from 'node:readline';
import { confirm, select } from '@inquirer/prompts';
import { pc } from '../../lib/utils/cli-output';
import { BACK, manageRuntimeSecrets } from '../../tasks/manage-runtime-secrets';
import { maskedSecret } from '../prompts/masked-secret';
import type { InfraContext } from '../shared';

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

/** Manage this environment's runtime secrets, using the project id resolved at CLI startup and a Scaleway secret key from env or prompt. */
export async function runSecrets(context: InfraContext): Promise<void> {
  const projectId = context.projectId;

  // Secret Manager access is covered by the operator or CI key, so no bootstrap key is needed; prompt only when neither is in the env.
  let secretKey = process.env.SCW_SECRET_KEY?.trim() || process.env.SCW_BOOTSTRAP_SECRET_KEY?.trim() || '';
  if (!secretKey) {
    console.info(
      pc.dim('\n→ Needs a Scaleway key with Secret Manager access (your operator or CI key, not a bootstrap key).'),
    );
    console.info(pc.dim(`  Set SCW_SECRET_KEY in infra/.env.${context.environment} to skip this prompt next time.`));
    secretKey = await maskedSecret({ message: 'Scaleway secret key' });
  }

  const { appConfig } = context;
  const path = `/${appConfig.slug}-${context.environment}/`;

  await manageRuntimeSecrets({
    secretKey,
    projectId,
    region: appConfig.s3.region,
    slug: appConfig.slug,
    mode: context.environment,
    path,
    prompts: { select: selectWithEscape, password: maskedSecret, confirm },
  });
}
