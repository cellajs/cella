/**
 * Create (or reuse) a scoped IAM application `<slug>-ci-deploy` with a
 * least-privilege policy, then mint a fresh API key (deleting any orphans).
 * Used by bootstrap.ts and the manual rotation procedure in infra/README.md.
 * Standalone usage: SCW_SECRET_KEY + SCW_DEFAULT_PROJECT_ID required.
 */

import { fileURLToPath } from 'node:url'
import pc from 'shared/cli-utils/colors'
import { changeMark, checkMark, tildeMark } from 'shared/console'

const IAM_BASE = 'https://api.scaleway.com/iam/v1alpha1'
const ACCOUNT_BASE = 'https://api.scaleway.com/account/v3'

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
  'ContainerRegistryFullAccess', // image push
  'InstancesFullAccess', // VM lifecycle
  'LoadBalancersFullAccess', // backend/frontend re-pointing
  'EdgeServicesFullAccess', // edge pipeline tweaks
  'ObjectStorageFullAccess', // frontend bucket uploads, policy refresh
  'ObservabilityFullAccess', // log/metric source updates
  'SecretManagerFullAccess', // secret version rotation
  // Read-only — bootstrap-owned, refreshed but never mutated by CI.
  'VPCReadOnly',
  'PrivateNetworksReadOnly',
  'RelationalDatabasesReadOnly',
] as const

/** Permission sets granted at organization scope (DNS lives at org level). */
export const ORG_PERMISSION_SETS = ['DomainsDNSFullAccess'] as const

interface ScwApp {
  id: string
  name: string
}
interface ScwPolicy {
  id: string
  name: string
}
interface ScwApiKey {
  access_key: string
  secret_key: string
  application_id: string
}

export interface CiKeyResult {
  accessKey: string
  secretKey: string
  applicationId: string
  organizationId: string
}

export interface SetupCiKeyOptions {
  callerSecretKey: string
  organizationId?: string
  projectId: string
  slug: string
  /** Injected for tests; defaults to console.info. */
  log?: (msg: string) => void
}

const DEBUG = process.env.SCW_DEBUG === '1' || process.env.DEBUG === '1'

async function scw<T>(secretKey: string, method: string, url: string, body?: unknown): Promise<T> {
  if (DEBUG) process.stderr.write(`[scw] → ${method} ${url}${body ? ` body=${JSON.stringify(body)}` : ''}\n`)
  const res = await fetch(url, {
    method,
    headers: { 'X-Auth-Token': secretKey, 'Content-Type': 'application/json' },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })
  const text = await res.text()
  if (DEBUG) process.stderr.write(`[scw] ← ${res.status} ${text.slice(0, 500)}\n`)
  if (!res.ok) {
    throw new Error(`Scaleway ${method} ${url} → ${res.status}: ${text}`)
  }
  if (res.status === 204 || text === '') return undefined as T
  try {
    return JSON.parse(text) as T
  } catch {
    throw new Error(`Scaleway ${method} ${url} returned non-JSON body: ${text.slice(0, 200)}`)
  }
}

async function resolveOrgId(secretKey: string, projectId: string): Promise<string> {
  // GET /account/v3/projects/{id} returns the Project object directly, not
  // wrapped in { project: ... }.
  const project = await scw<{ organization_id?: string }>(
    secretKey,
    'GET',
    `${ACCOUNT_BASE}/projects/${projectId}`,
  )
  if (!project?.organization_id) {
    throw new Error(
      `Could not resolve organization_id from project ${projectId}. ` +
        `Response: ${JSON.stringify(project)}. ` +
        `Re-run with SCW_DEBUG=1 for full request/response traces, or pass SCW_DEFAULT_ORGANIZATION_ID explicitly.`,
    )
  }
  return project.organization_id
}

export async function setupCiKey(opts: SetupCiKeyOptions): Promise<CiKeyResult> {
  const { callerSecretKey, projectId, slug } = opts
  const log = opts.log ?? ((msg) => console.info(msg))

  const organizationId = opts.organizationId ?? (await resolveOrgId(callerSecretKey, projectId))

  const appName = `${slug}-ci-deploy`
  const policyName = `${slug}-ci-deploy-policy`

  // 1. Find or create the IAM application
  const { applications } = await scw<{ applications: ScwApp[] }>(
    callerSecretKey,
    'GET',
    `${IAM_BASE}/applications?name=${encodeURIComponent(appName)}&organization_id=${organizationId}&page_size=20`,
  )
  let app = applications.find((a) => a.name === appName)
  if (app) {
    log(`  ${checkMark} Reusing IAM application: ${app.name} (${app.id})`)
  } else {
    app = await scw<ScwApp>(callerSecretKey, 'POST', `${IAM_BASE}/applications`, {
      name: appName,
      organization_id: organizationId,
      description: 'Non-human principal for GitHub Actions CI deployments',
    })
    log(`  ${changeMark} Created IAM application: ${app.name} (${app.id})`)
  }

  // 2. Find or create the policy. Always recreate when found to ensure rules
  //    stay in sync with PROJECT_PERMISSION_SETS / ORG_PERMISSION_SETS — an
  //    existing policy silently loses new permissions if we just skip it.
  const { policies } = await scw<{ policies: ScwPolicy[] }>(
    callerSecretKey,
    'GET',
    `${IAM_BASE}/policies?application_id=${app.id}&organization_id=${organizationId}&page_size=20`,
  )
  const existingPolicy = policies.find((p) => p.name === policyName)
  if (existingPolicy) {
    await scw(callerSecretKey, 'DELETE', `${IAM_BASE}/policies/${existingPolicy.id}`)
    log(`  ${tildeMark} Removed existing policy: ${policyName} (recreating with current rules)`)
  }
  await scw<ScwPolicy>(callerSecretKey, 'POST', `${IAM_BASE}/policies`, {
    name: policyName,
    organization_id: organizationId,
    application_id: app.id,
    description: 'Least-privilege policy for CI deployments (auto-generated)',
    rules: [
      { permission_set_names: PROJECT_PERMISSION_SETS, project_ids: [projectId] },
      { permission_set_names: ORG_PERMISSION_SETS, organization_id: organizationId },
    ],
  })
  log(`  ${changeMark} Created IAM policy: ${policyName}`)

  // 3. Delete any existing API keys on this application before minting a new
  //    one. Scaleway only returns the secret_key at creation time, so any
  //    pre-existing keys are unrecoverable dead weight — purging them keeps
  //    re-runs of bootstrap from accumulating orphans.
  const { api_keys: existingKeys = [] } = await scw<{ api_keys?: Array<{ access_key: string }> }>(
    callerSecretKey,
    'GET',
    `${IAM_BASE}/api-keys?application_id=${app.id}&organization_id=${organizationId}&page_size=100`,
  )
  for (const key of existingKeys) {
    await scw(callerSecretKey, 'DELETE', `${IAM_BASE}/api-keys/${key.access_key}`)
    log(`  ${tildeMark} Removed orphan API key: ${key.access_key}`)
  }

  // 4. Mint a fresh API key
  const apiKey = await scw<ScwApiKey>(callerSecretKey, 'POST', `${IAM_BASE}/api-keys`, {
    application_id: app.id,
    description: `ci-deploy — rotated ${new Date().toISOString().slice(0, 10)}`,
    default_project_id: projectId,
  })
  log(`  ${changeMark} Created API key: ${apiKey.access_key}`)

  return {
    accessKey: apiKey.access_key,
    secretKey: apiKey.secret_key,
    applicationId: app.id,
    organizationId,
  }
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
  console.info(`${checkMark} ${pc.bold(pc.greenBright('CI key created.'))} ${pc.dim('Write these into Pulumi stack config now:')}\n`)
  console.info(`  pulumi config set --secret scaleway:accessKey ${pc.cyanBright(result.accessKey)} \\`)
  console.info('    --stack organization/infra/production')
  console.info(`  pulumi config set --secret scaleway:secretKey ${pc.cyanBright(result.secretKey)} \\`)
  console.info('    --stack organization/infra/production\n')
  console.info(`  ${pc.dim('Next:')} commit ${pc.underline('infra/Pulumi.production.yaml')}, then revoke the bootstrap key.`)
  console.info(DIVIDER)
}
