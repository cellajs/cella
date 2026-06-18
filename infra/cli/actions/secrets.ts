import { emitKeypressEvents } from 'node:readline'
import { confirm, select } from '@inquirer/prompts'
import { BACK, manageRuntimeSecrets } from '../../tasks/manage-runtime-secrets'
import { maskedSecret } from '../prompts/masked-secret'
import type { InfraContext } from '../shared'

type PromptOption<T extends string> = { name: string; value: T; description?: string }

/**
 * `select` that also resolves the {@link BACK} sentinel when the operator presses
 * Esc, so selection prompts can return to the previous menu instead of forcing a
 * choice. Inquirer's select has no native Esc handling, so we abort it via an
 * AbortController driven by a keypress listener on stdin (Inquirer's own readline
 * emits the events while the prompt is active).
 */
function selectWithEscape<T extends string>(options: { message: string; choices: Array<PromptOption<T>> }): Promise<T | typeof BACK> {
  const controller = new AbortController()
  const onKeypress = (_chunk: unknown, key?: { name?: string }) => {
    if (key?.name === 'escape') controller.abort()
  }
  emitKeypressEvents(process.stdin)
  process.stdin.on('keypress', onKeypress)
  return select<T>(options, { signal: controller.signal })
    .then(
      (value): T | typeof BACK => value,
      (error: unknown): T | typeof BACK => {
        // An aborted prompt is the operator stepping back, not a failure.
        if (error instanceof Error && error.name === 'AbortPromptError') return BACK
        throw error
      },
    )
    .finally(() => {
      process.stdin.removeListener('keypress', onKeypress)
    })
}

/**
 * Runs the secrets management mode for Scaleway infrastructure.
 *
 * Uses the project id resolved at CLI startup and a Scaleway secret key (from
 * env or prompt), then manages runtime secrets for the specified environment.
 *
 * @param context - Infra CLI context containing stack configuration
 * @returns Promise that resolves when secrets management is complete
 */
export async function runSecrets(context: InfraContext): Promise<void> {
  // The project id is resolved once at CLI startup (required), so reuse it.
  const projectId = context.projectId
  const secretKey =
    process.env.SCW_SECRET_KEY ||
    process.env.SCW_BOOTSTRAP_SECRET_KEY ||
    (await maskedSecret({ message: 'Scaleway bootstrap secret key' }))

  const { appConfig } = context
  const path = `/${appConfig.slug}-${context.environment}/`

  await manageRuntimeSecrets({
    secretKey,
    projectId,
    region: appConfig.s3.region,
    path,
    prompts: { select: selectWithEscape, password: maskedSecret, confirm },
  })
}