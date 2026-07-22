import { pc } from 'shared/cli-utils/colors';
import { DIVIDER } from 'shared/cli-utils/display'
import { checkMark } from 'shared/utils/console'
import { provisionScopedKey, type ProvisionScopedKeyOptions, type ScopedKeyResult } from '../lib/scaleway/scaleway-iam'
import { isMain } from '../lib/utils/is-main'
import { secretManagerPath } from '../lib/scaleway/vm-reader-secret'
import { seedVmReaderKey } from './seed-vm-reader-key'

export type SetupVmKeyOptions = ProvisionScopedKeyOptions
export type VmKeyResult = ScopedKeyResult

/** Mint the VM reader key; Pulumi owns and reconciles its read-only IAM policy. */
export function setupVmKey(opts: SetupVmKeyOptions): Promise<VmKeyResult> {
  return provisionScopedKey(opts, {
    suffix: 'vm-reader',
    appDescription: 'Non-human principal for deployed service VMs — read-only registry + S3 + secrets',
    policyDescription: 'Minimal read-only policy for service VMs (auto-generated)',
  // Bootstrap only the application and key; Pulumi owns and reconciles its policy grants.
    managePolicy: false,
  })
}

// Standalone entry point.
if (isMain(import.meta.url)) {
  const secretKey = process.env.SCW_SECRET_KEY
  const projectId = process.env.SCW_DEFAULT_PROJECT_ID
  const organizationId = process.env.SCW_DEFAULT_ORGANIZATION_ID

  if (!secretKey || !projectId) {
    process.stderr.write('Required: SCW_SECRET_KEY, SCW_DEFAULT_PROJECT_ID\nOptional: SCW_DEFAULT_ORGANIZATION_ID\n')
    process.exit(1)
  }

  process.env.APP_MODE = process.env.APP_MODE ?? 'production'
  const { appConfig } = await import('shared')

  console.info('\n→ Setting up VM reader key')
  const result = await setupVmKey({ callerSecretKey: secretKey, organizationId, projectId, slug: appConfig.slug })

  // Store the key pair in Secret Manager so the Pulumi program can read it
  // during `pulumi up` and bake it into VM cloud-init.
  const path = secretManagerPath(appConfig.slug, appConfig.mode)
  await seedVmReaderKey({
    secretKey,
    projectId,
    region: appConfig.s3.region,
    path,
    key: { accessKey: result.accessKey, secretKey: result.secretKey },
  })

  const divider = pc.dim(DIVIDER)
  console.info(`\n${divider}`)
  console.info(`${checkMark} ${pc.bold(pc.greenBright('VM key created and stored in Secret Manager.'))}`)
  console.info(pc.dim(`  secret: ${path}vm-reader-key · application id ${result.applicationId} (derived from IAM by name)\n`))
  console.info(divider)
}
