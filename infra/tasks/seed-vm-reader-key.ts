import { createSecretManagerClient } from '../lib/scaleway-secret-manager'
import { VM_READER_SECRET_NAME, type VmReaderKeyPayload } from '../lib/vm-reader-secret'

export interface SeedVmReaderKeyOptions {
  secretKey: string
  projectId: string
  region: string
  /** Secret Manager folder, e.g. `/cella-production/`. */
  path: string
  /** The freshly minted VM reader key pair to store. */
  key: VmReaderKeyPayload
  log?: (message: string) => void
}

const defaultLog = (message: string) => console.info(message)

/**
 * Store the `<slug>-vm-reader` key pair in Scaleway Secret Manager during
 * bootstrap. The Pulumi program reads it back during `pulumi up` and bakes it
 * into VM cloud-init.
 *
 * Idempotent: ensures the container exists and always writes a fresh version
 * (`disablePrevious: true`) so a re-mint/rotate immediately invalidates the
 * previous value rather than leaving two live versions.
 */
export async function seedVmReaderKey(options: SeedVmReaderKeyOptions): Promise<void> {
  const log = options.log ?? defaultLog
  const client = createSecretManagerClient({
    secretKey: options.secretKey,
    region: options.region,
    projectId: options.projectId,
  })

  const container = await client.ensureSecret({
    name: VM_READER_SECRET_NAME,
    path: options.path,
    description: 'VM reader IAM key pair (registry pull, Secret Manager access)',
  })
  await client.putSecretValue({
    secretId: container.id,
    value: JSON.stringify(options.key),
    description: 'Seeded/rotated by infra cli',
    disablePrevious: true,
  })
  log(`seed ${VM_READER_SECRET_NAME}`)
}
