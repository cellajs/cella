/**
 * Create (or reuse) a scoped IAM application `<slug>-ci-deploy` with a
 * least-privilege policy, then mint a fresh API key (deleting any orphans).
 * Used by the bootstrap command and the manual rotation procedure in
 * infra/README.md.
 * Standalone usage: SCW_SECRET_KEY + SCW_PROJECT_ID required.
 *
 * The shared provisioning flow lives in `lib/scaleway-iam.ts`; the CI-specific
 * permission sets live in `lib/permissions.ts` (the canonical IAM manifest).
 * This file owns only the policy-rule shape that binds them.
 */

import pc from 'shared/cli-utils/colors'
import { DIVIDER } from 'shared/cli-utils/display'
import { checkMark } from 'shared/console'
import { resolveProjectId } from '../lib/scaleway/bootstrap-scw-env'
import { isMain } from '../lib/utils/is-main'
import { ORG_SCOPED_PERMISSION_SETS, ORG_WIDE_PROJECT_PERMISSION_SETS, PROJECT_PERMISSION_SETS } from '../lib/scaleway/permissions'
import { provisionScopedKey, type ProvisionScopedKeyOptions, type ScopedKeyResult } from '../lib/scaleway/scaleway-iam'

export type SetupCiKeyOptions = ProvisionScopedKeyOptions
export type CiKeyResult = ScopedKeyResult

export function setupCiKey(opts: SetupCiKeyOptions): Promise<CiKeyResult> {
  return provisionScopedKey(opts, {
    suffix: 'ci-deploy',
    appDescription: 'Non-human principal for GitHub Actions CI deployments',
    policyDescription: 'Least-privilege policy for CI deployments (auto-generated)',
    buildRules: ({ projectId, organizationId }) => [
      { permission_set_names: PROJECT_PERMISSION_SETS, project_ids: [projectId] },
      // Two org-keyed rules, one per scope type (Scaleway rejects mixing them in
      // a single rule): DNS is project-scoped (granted across all projects),
      // IAMReadOnly is organization-scoped.
      { permission_set_names: ORG_WIDE_PROJECT_PERMISSION_SETS, organization_id: organizationId },
      { permission_set_names: ORG_SCOPED_PERMISSION_SETS, organization_id: organizationId },
    ],
  })
}

// Standalone entry point.
if (isMain(import.meta.url)) {
  const secretKey = process.env.SCW_SECRET_KEY
  const projectId = resolveProjectId()
  const organizationId = process.env.SCW_DEFAULT_ORGANIZATION_ID

  if (!secretKey || !projectId) {
    process.stderr.write('Required: SCW_SECRET_KEY, SCW_PROJECT_ID\nOptional: SCW_DEFAULT_ORGANIZATION_ID\n')
    process.exit(1)
  }

  process.env.APP_MODE = process.env.APP_MODE ?? 'production'
  const { appConfig } = await import('shared')

  console.info('\n→ Setting up CI deploy key')
  const result = await setupCiKey({ callerSecretKey: secretKey, organizationId, projectId, slug: appConfig.slug })

  const divider = pc.dim(DIVIDER)
  console.info(`\n${divider}`)
  console.info(`${checkMark} ${pc.bold(pc.greenBright('CI key created.'))} ${pc.dim('Push these to the GitHub deploy environment now:')}\n`)
  console.info(`  gh secret set SCW_ACCESS_KEY --env production --body ${pc.cyanBright(result.accessKey)}`)
  console.info(`  gh secret set SCW_SECRET_KEY --env production --body ${pc.cyanBright(result.secretKey)}`)
  console.info(
    `\n  ${pc.dim('The secret key is shown only once. CI authenticates the Scaleway provider from these')} ${pc.dim('SCW_* env vars — it is no longer stored in stack config. Then revoke the bootstrap key.')}`,
  )
  console.info(divider)
}
