/**
 * Create (or reuse) a scoped IAM application `<slug>-vm-reader` and mint a fresh
 * API key (deleting any orphans). The application's IAM **policy** is NOT created
 * here — it is declared as a Pulumi-managed `iam.Policy` resource
 * (`infra/resources/vm-iam.ts`) so `pulumi up` reconciles the permission sets on
 * every deploy and the VM's grant can never silently drift.
 *
 * The VM reader identity is granted exactly these capabilities (by Pulumi):
 *   - ContainerRegistryReadOnly  — docker pull from the project registry
 *   - ObjectStorageReadOnly      — read deploy/<service>.tag from the deploy-tags bucket
 *   - SecretManagerReadOnly      — list/describe runtime secrets by ID
 *   - SecretManagerSecretAccess  — decrypt + read the runtime secret VALUES
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
 * only the VM-specific permission sets, which Pulumi consumes via
 * `VM_PROJECT_PERMISSION_SETS`.
 */

import { fileURLToPath } from 'node:url'
import pc from 'shared/cli-utils/colors'
import { checkMark } from 'shared/console'
import { provisionScopedKey, type ProvisionScopedKeyOptions, type ScopedKeyResult } from '../lib/scaleway-iam'
import { secretManagerPath } from '../lib/vm-reader-secret'
import { seedVmReaderKey } from './seed-vm-reader-key'

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
  // Decrypt-and-read secret VALUES. SecretManagerReadOnly is metadata-only, so
  // without this the VM's runtime-secret-sync 403s on every required secret.
  'SecretManagerSecretAccess',
] as const

export type SetupVmKeyOptions = ProvisionScopedKeyOptions
export type VmKeyResult = ScopedKeyResult

export function setupVmKey(opts: SetupVmKeyOptions): Promise<VmKeyResult> {
  return provisionScopedKey(opts, {
    suffix: 'vm-reader',
    appDescription: 'Non-human principal for deployed service VMs — read-only registry + S3 + secrets',
    policyDescription: 'Minimal read-only policy for service VMs (auto-generated)',
    // The policy is a Pulumi-managed resource (infra/resources/vm-iam.ts), so this
    // bootstrap flow provisions only the application + key. Pulumi reconciles the
    // permission sets (VM_PROJECT_PERMISSION_SETS) on every `pulumi up`, which is
    // what makes the VM grant drift-proof.
    managePolicy: false,
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

  // Store the key pair in Secret Manager (SOVRUN §3.3) — the Pulumi program
  // reads it back at `pulumi up` to bake into VM cloud-init. No stack config.
  const path = secretManagerPath(appConfig.slug, appConfig.mode)
  await seedVmReaderKey({
    secretKey,
    projectId,
    region: appConfig.s3.region,
    path,
    key: { accessKey: result.accessKey, secretKey: result.secretKey },
  })

  const DIVIDER = pc.dim('─'.repeat(60))
  console.info(`\n${DIVIDER}`)
  console.info(`${checkMark} ${pc.bold(pc.greenBright('VM key created and stored in Secret Manager.'))}`)
  console.info(pc.dim(`  secret: ${path}vm-reader-key · application id ${result.applicationId} (derived from IAM by name)\n`))
  console.info(DIVIDER)
}
