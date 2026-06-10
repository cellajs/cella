import { confirm, input, password, select } from '@inquirer/prompts'
import { extractProjectId } from '../lib/bootstrap-stack-state.js'
import { manageRuntimeSecrets } from '../tasks/manage-runtime-secrets.js'
import type { BootstrapContext } from './shared.js'

export async function runSecretsMode(context: BootstrapContext): Promise<void> {
  const projectId =
    process.env.SCW_PROJECT_ID ||
    process.env.SCW_DEFAULT_PROJECT_ID ||
    extractProjectId(context.stackYaml ?? '') ||
    (await input({ message: 'Scaleway project ID', validate: (value) => !!value.trim() || '(required)' }))
  const secretKey =
    process.env.SCW_SECRET_KEY ||
    process.env.SCW_BOOTSTRAP_SECRET_KEY ||
    (await password({ message: 'Scaleway secret key with Secret Manager access' }))

  process.env.APP_MODE = process.env.APP_MODE ?? context.stackShort
  const { appConfig } = await import('shared')
  const path = `/${appConfig.slug}-${context.stackShort}/`

  await manageRuntimeSecrets({
    secretKey,
    projectId,
    region: appConfig.s3.region,
    path,
    prompts: { select, password, confirm },
  })
}