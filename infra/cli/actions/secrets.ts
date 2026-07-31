import { emitKeypressEvents } from 'node:readline'
import { confirm, select } from '@inquirer/prompts'
import { BACK, manageRuntimeSecrets } from '../../tasks/manage-runtime-secrets'
import { maskedSecret } from '../prompts/masked-secret'
import type { InfraContext } from '../shared'
import { pc } from '../../lib/utils/cli-output'

type PromptOption<T extends string> = { name: string; value: T; description?: string }

/**
 * `select` that also resolves the {@link BACK} sentinel when the operator presses
 * Esc, so selection prompts can return to the previous menu without forcing a
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

  // Managing runtime secrets reads/writes Secret Manager, which the operator or
  // CI key already covers (no bootstrap key needed). Reuse one from the env when
  // present; only prompt when none is loaded, and say how to skip the prompt.
  let secretKey = process.env.SCW_SECRET_KEY?.trim() || process.env.SCW_BOOTSTRAP_SECRET_KEY?.trim() || ''
  if (!secretKey) {
    console.info(pc.dim('\n→ Needs a Scaleway key with Secret Manager access (your operator or CI key, not a bootstrap key).'))
    console.info(pc.dim(`  Set SCW_SECRET_KEY in infra/.env.${context.environment} to skip this prompt next time.`))
    secretKey = await maskedSecret({ message: 'Scaleway secret key' })
  }

  const { appConfig } = context
  const path = `/${appConfig.slug}-${context.environment}/`

  await manageRuntimeSecrets({
    secretKey,
    projectId,
    region: appConfig.s3.region,
    slug: appConfig.slug,
    mode: context.environment,
    path,
    prompts: { select: selectWithEscape, password: maskedSecret, confirm },
  })
}
