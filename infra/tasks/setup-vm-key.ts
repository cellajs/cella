/**
 * Create (or reuse) a scoped IAM application `<slug>-vm-reader` with a
 * minimal read-only policy, then mint a fresh API key (deleting any orphans).
 *
 * The VM reader identity has exactly three capabilities:
 *   - ContainerRegistryReadOnly  — docker pull from the project registry
 *   - ObjectStorageReadOnly      — read deploy/<service>.tag from the deploy-tags bucket
 *   - SecretManagerReadOnly      — runtime-secret-sync reads secrets by ID
 *
 * It intentionally has NO write access to anything — not instances, not the LB,
 * not IAM. A compromised container can exfiltrate its own secrets but cannot
 * provision infrastructure or escalate privileges.
 *
 * Used by the bootstrap command inside the "Rotate CI" path so both the CI key
 * and the VM key are provisioned atomically with a single IAM bootstrap credential.
 * Standalone usage: SCW_SECRET_KEY + SCW_DEFAULT_PROJECT_ID required.
 *
 * The shared provisioning flow lives in `lib/scaleway-iam.ts`; this file owns
 * only the VM-specific permission sets and policy rules.
 */

import { fileURLToPath } from 'node:url'
import pc from 'shared/cli-utils/colors'
import { checkMark } from 'shared/console'
import { provisionScopedKey, type ProvisionScopedKeyOptions, type ScopedKeyResult } from '../lib/scaleway-iam'

/**
 * Permission sets granted to the VM reader key at project scope.
 *
 * Deliberately minimal: VMs only need to pull images, read their own deploy tag,
 * and fetch runtime secrets. Any wider grant is lateral-movement surface area.
 */
export const VM_PROJECT_PERMISSION_SETS = [
  'ContainerRegistryReadOnly',
  'ObjectStorageReadOnly',
  'SecretManagerReadOnly',
] as const

export type SetupVmKeyOptions = ProvisionScopedKeyOptions
export type VmKeyResult = ScopedKeyResult

export function setupVmKey(opts: SetupVmKeyOptions): Promise<VmKeyResult> {
  return provisionScopedKey(opts, {
    suffix: 'vm-reader',
    appDescription: 'Non-human principal for deployed service VMs — read-only registry + S3 + secrets',
    policyDescription: 'Minimal read-only policy for service VMs (auto-generated)',
    buildRules: ({ projectId }) => [{ permission_set_names: VM_PROJECT_PERMISSION_SETS, project_ids: [projectId] }],
  })
}

// Standalone entry point.
if (process.argv[1] === fileURLToPath(import.meta.url)) {
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

  const DIVIDER = pc.dim('─'.repeat(60))
  console.info(`\n${DIVIDER}`)
  console.info(`${checkMark} ${pc.bold(pc.greenBright('VM key created.'))} ${pc.dim('Write these into Pulumi stack config now:')}\n`)
  console.info(`  pulumi config set infra:vmApplicationId ${pc.cyanBright(result.applicationId)} \\`)
  console.info('    --stack organization/infra/production')
  console.info(`  pulumi config set --secret infra:vmAccessKey ${pc.cyanBright(result.accessKey)} \\`)
  console.info('    --stack organization/infra/production')
  console.info(`  pulumi config set --secret infra:vmSecretKey ${pc.cyanBright(result.secretKey)} \\`)
  console.info('    --stack organization/infra/production\n')
  console.info(DIVIDER)
}
