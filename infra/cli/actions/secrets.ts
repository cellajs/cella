import { confirm, password, select } from '@inquirer/prompts'
import { manageRuntimeSecrets } from '../../tasks/manage-runtime-secrets'
import type { InfraContext } from '../shared'

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
    (await password({ message: 'Scaleway bootstrap secret key' }))

  const { appConfig } = context
  const path = `/${appConfig.slug}-${context.environment}/`

  await manageRuntimeSecrets({
    secretKey,
    projectId,
    region: appConfig.s3.region,
    path,
    prompts: { select, password, confirm },
  })
}