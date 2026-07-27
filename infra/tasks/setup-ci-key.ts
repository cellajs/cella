import { resolveProjectId } from '../lib/scaleway/bootstrap-scw-env'
import { isMain } from '../lib/utils/is-main'
import { resolveDnsProjectIds } from '../lib/scaleway/dns-zone-project'
import { DNS_PERMISSION_SETS, ORG_SCOPED_PERMISSION_SETS, PROJECT_PERMISSION_SETS } from '../lib/scaleway/permissions'
import { provisionScopedKey, type ProvisionScopedKeyOptions, type ScopedKeyResult } from '../lib/scaleway/scaleway-iam'
import { syncGithubEnvironment } from '../lib/github-sync'
import { pc, DIVIDER, checkMark, warningMark } from '../lib/utils/cli-output'

export interface SetupCiKeyOptions extends ProvisionScopedKeyOptions {
  /** The stack's DNS zone; scopes the DNS grant to the projects that serve it. */
  dnsZone?: string
}
export type CiKeyResult = ScopedKeyResult

/** Create the scoped CI application, least-privilege policy, and fresh key. */
export async function setupCiKey(opts: SetupCiKeyOptions): Promise<CiKeyResult> {
  // DNS is project-scoped: the app project (fresh zones land there) plus the
  // serving zone's project when records live in a shared parent zone (staging
  // on the production apex). Never org-wide: a compromised CI key must not be
  // able to rewrite unrelated zones.
  const dnsProjectIds = await resolveDnsProjectIds({ secretKey: opts.callerSecretKey }, opts.dnsZone ?? '', opts.projectId)
  return provisionScopedKey(opts, {
    suffix: 'ci-deploy',
    appDescription: 'Non-human principal for GitHub Actions CI deployments',
    policyDescription: 'Least-privilege policy for CI deployments (auto-generated)',
    buildRules: ({ projectId, organizationId }) => [
      { permission_set_names: PROJECT_PERMISSION_SETS, project_ids: [projectId] },
      // Separate rules per scope type (Scaleway rejects mixing them in one
      // rule): DNS is project-scoped, IAMReadOnly is organization-scoped.
      { permission_set_names: DNS_PERMISSION_SETS, project_ids: dnsProjectIds },
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
  const { loadEngineConfig } = await import('../config/engine-config')
  const appConfig = await loadEngineConfig()

  console.info('\n→ Setting up CI deploy key')
  const { deriveInfra } = await import('../lib/naming')
  const result = await setupCiKey({ callerSecretKey: secretKey, organizationId, projectId, slug: appConfig.slug, dnsZone: deriveInfra(appConfig).dnsZone })

  const divider = pc.dim(DIVIDER)
  console.info(`\n${divider}`)
  console.info(`${checkMark} ${pc.bold(pc.greenBright('CI key created.'))} ${pc.dim(`access key ${result.accessKey}`)}\n`)

  // The secret key must stay off stdout (terminal scrollback, CI transcripts);
  // push it straight to the GitHub Environment via gh.
  const environment = appConfig.mode === 'staging' ? 'staging' : 'production'
  const synced = await syncGithubEnvironment({
    repoRoot: process.cwd(),
    environment,
    ciKey: { accessKey: result.accessKey, secretKey: result.secretKey, projectId, organizationId: result.organizationId },
  })
  if (synced) {
    console.info(`\n${checkMark} SCW_* secrets pushed to the GitHub "${environment}" Environment. ${pc.dim('Then revoke the bootstrap key.')}`)
  } else {
    console.error(
      `\n${warningMark} Could not push secrets to GitHub (gh unauthenticated or origin is not a GitHub remote).\n` +
        `  The secret key is intentionally not printed. Run ${pc.cyanBright('gh auth login')} and re-run this task: a fresh key is minted each run.`,
    )
    process.exitCode = 1
  }
  console.info(divider)
}
