/**
 * Create (or reuse) a scoped IAM application `<slug>-ci-deploy` with a
 * least-privilege policy, then mint a fresh API key (deleting any orphans).
 * Used by the bootstrap command and the manual rotation procedure in
 * infra/README.md.
 * Standalone usage: SCW_SECRET_KEY + SCW_DEFAULT_PROJECT_ID required.
 *
 * The shared provisioning flow lives in `lib/scaleway-iam.ts`; this file owns
 * only the CI-specific permission sets and policy rules.
 */

import { fileURLToPath } from 'node:url'
import pc from 'shared/cli-utils/colors'
import { checkMark } from 'shared/console'
import { provisionScopedKey, type ProvisionScopedKeyOptions, type ScopedKeyResult } from '../lib/scaleway-iam'

/**
 * Permission sets granted to the CI deploy key at project scope.
 *
 * Split into "write at steady state" and "read-only at steady state". The
 * read-only sets cover create-once resources (VPC, private network, RDB)
 * that are provisioned at bootstrap and never touched by routine CI deploys.
 * Pulumi still needs to *refresh* them on every `pulumi up`, so we grant
 * ReadOnly rather than removing them entirely. Any structural change to those
 * modules — new database, new private network, RDB user/privilege change —
 * must be applied via a local `pulumi up` using the bootstrap key.
 */
export const PROJECT_PERMISSION_SETS = [
  // Write — touched by routine CI deploys.
  'BlockStorageFullAccess', // block volumes attached to instances (split from InstancesFullAccess upstream)
  'ContainerRegistryFullAccess', // image push
  'IPAMFullAccess', // reserve + attach stable private IPAM IPs for VMs
  'InstancesFullAccess', // VM lifecycle
  'LoadBalancersFullAccess', // backend/frontend re-pointing
  'EdgeServicesFullAccess', // edge pipeline tweaks
  'ObjectStorageFullAccess', // frontend bucket uploads, policy refresh
  'ObservabilityFullAccess', // log/metric source updates
  'PrivateNetworksFullAccess', // VM PN attachments (write required by InstancesFullAccess replacements)
  'SecretManagerFullAccess', // secret version rotation
  // Read-only — bootstrap-owned, refreshed but never mutated by CI.
  'VPCReadOnly',
  'RelationalDatabasesReadOnly',
] as const

/** Permission sets granted at organization scope (DNS lives at org level). */
export const ORG_PERMISSION_SETS = [
  'DomainsDNSFullAccess',
  // Read-only. `pulumi up` derives the CI/VM application ids from the IAM API at
  // runtime (SOVRUN §3.3, helpers.ts getApplicationOutput) and the deploy's
  // "Verify VM reader IAM grant" step lists the VM reader's policies — both are
  // org-scoped IAM reads, so the CI key needs IAMReadOnly. (Self-introspection
  // via getApiKey works without it, but listing other applications does not.)
  'IAMReadOnly',
] as const

export type SetupCiKeyOptions = ProvisionScopedKeyOptions
export type CiKeyResult = ScopedKeyResult

export function setupCiKey(opts: SetupCiKeyOptions): Promise<CiKeyResult> {
  return provisionScopedKey(opts, {
    suffix: 'ci-deploy',
    appDescription: 'Non-human principal for GitHub Actions CI deployments',
    policyDescription: 'Least-privilege policy for CI deployments (auto-generated)',
    buildRules: ({ projectId, organizationId }) => [
      { permission_set_names: PROJECT_PERMISSION_SETS, project_ids: [projectId] },
      { permission_set_names: ORG_PERMISSION_SETS, organization_id: organizationId },
    ],
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

  console.info('\n→ Setting up CI deploy key')
  const result = await setupCiKey({ callerSecretKey: secretKey, organizationId, projectId, slug: appConfig.slug })

  const DIVIDER = pc.dim('─'.repeat(60))
  console.info(`\n${DIVIDER}`)
  console.info(`${checkMark} ${pc.bold(pc.greenBright('CI key created.'))} ${pc.dim('Push these to the GitHub deploy environment now:')}\n`)
  console.info(`  gh secret set SCW_ACCESS_KEY --env production --body ${pc.cyanBright(result.accessKey)}`)
  console.info(`  gh secret set SCW_SECRET_KEY --env production --body ${pc.cyanBright(result.secretKey)}`)
  console.info(
    `\n  ${pc.dim('The secret key is shown only once. CI authenticates the Scaleway provider from these')} ${pc.dim('SCW_* env vars — it is no longer stored in stack config. Then revoke the bootstrap key.')}`,
  )
  console.info(DIVIDER)
}
