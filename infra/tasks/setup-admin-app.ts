import { ADMIN_ORG_PERMISSION_SETS, ADMIN_PROJECT_PERMISSION_SETS } from '../lib/scaleway/permissions'
import { provisionScopedKey, type ProvisionScopedKeyOptions, type ScopedKeyResult } from '../lib/scaleway/scaleway-iam'
import { createSecretManagerClient } from '../lib/scaleway/scaleway-secret-manager'
import { engineSecretPath } from '../lib/scaleway/vm-reader-secret'

/** Secret Manager container name for the admin key pair. */
export const ADMIN_KEY_SECRET_NAME = 'admin-key'

export interface SetupAdminAppOptions extends ProvisionScopedKeyOptions {
  /** Deploy mode; required, since the admin app is always per-mode. */
  mode: string
  /** Scaleway region for the Secret Manager custody write. */
  region: string
}
export type AdminAppResult = ScopedKeyResult

/**
 * Provision the standing `<slug>-<mode>-admin` application WITH a real key
 * (the operator app it replaces was keyless, so out of the box no human could
 * run `pulumi` against a bootstrapped stack). Grants: Object Storage full +
 * read-only on every infra surface `pulumi preview --refresh` touches, never
 * IAM write; structural changes stay on the transient bootstrap key.
 *
 * Custody: the key pair is stored in Secret Manager (`admin-key` under the
 * stack's folder) so "Rotate keys" covers it and a later operator can retrieve
 * it with a bootstrap key. It is never printed, never in git, never a GitHub
 * secret.
 */
export async function setupAdminApp(opts: SetupAdminAppOptions): Promise<AdminAppResult> {
  const result = await provisionScopedKey(opts, {
    suffix: 'admin',
    appDescription: 'Human admin principal: bucket access + infra reads for day-2 operations (preview, teardown, recovery)',
    policyDescription: 'Admin policy: Object Storage full + read-only infra surfaces (auto-generated; no IAM write)',
    buildRules: ({ projectId, organizationId }) => [
      { permission_set_names: ADMIN_PROJECT_PERMISSION_SETS, project_ids: [projectId] },
      { permission_set_names: ADMIN_ORG_PERMISSION_SETS, organization_id: organizationId },
    ],
  })

  const client = createSecretManagerClient({ secretKey: opts.callerSecretKey, region: opts.region, projectId: opts.projectId })
  const container = await client.ensureSecret({
    name: ADMIN_KEY_SECRET_NAME,
    // Engine folder: outside the VM secret condition, so a VM must never be
    // able to read the admin key.
    path: engineSecretPath(opts.slug, opts.mode),
    description: 'Admin IAM key pair (bucket access + infra reads) — retrieve with a bootstrap key when needed',
  })
  await client.putSecretValue({
    secretId: container.id,
    value: JSON.stringify({ accessKey: result.accessKey, secretKey: result.secretKey }),
    description: 'Seeded/rotated by infra cli',
    disablePrevious: true,
  })
  return result
}
