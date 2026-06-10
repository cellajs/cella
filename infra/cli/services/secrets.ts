import { confirm, input, password, select } from '@inquirer/prompts'
import { extractProjectId } from '../../lib/bootstrap-stack-state'
import { manageRuntimeSecrets } from '../../tasks/manage-runtime-secrets'
import type { InfraContext } from '../shared'

/**
 * Runs the secrets management mode for Scaleway infrastructure.
 * 
 * Retrieves or prompts for Scaleway project ID and secret key, then manages
 * runtime secrets for the specified environment.
 * 
 * @param context - Infra CLI context containing stack configuration
 * @returns Promise that resolves when secrets management is complete
 */
export async function runSecrets(context: InfraContext): Promise<void> {
  // The stack file is the authoritative project for this stack and is always present in `secrets` mode;
  // SCW_DEFAULT_PROJECT_ID only fills in when a fork stores projectId encrypted instead of plaintext.
  const projectId =
    extractProjectId(context.stackYaml ?? '') ||
    process.env.SCW_DEFAULT_PROJECT_ID ||
    (await input({ message: 'Scaleway project ID', validate: (value) => !!value.trim() || '(required)' }))
  const secretKey =
    process.env.SCW_SECRET_KEY ||
    process.env.SCW_BOOTSTRAP_SECRET_KEY ||
    (await password({ message: 'Scaleway secret key with Secret Manager access' }))

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