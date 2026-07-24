import { scwFetch, scwSend } from './scw-fetch'
import { ORG_WIDE_PROJECT_PERMISSION_SETS } from './permissions'
import { changeMark, checkMark, tildeMark } from '../utils/cli-output'

const IAM_BASE = 'https://api.scaleway.com/iam/v1alpha1'
const ACCOUNT_BASE = 'https://api.scaleway.com/account/v3'

/** A Scaleway permissions_denied error (403), regardless of resource. */
function isPermissionDenied(error: unknown): boolean {
  return error instanceof Error && /permissions_denied|→ 403/.test(error.message)
}

/** A Scaleway already-exists conflict (409 / duplicate name). */
function isAlreadyExists(error: unknown): boolean {
  return error instanceof Error && /already.?exists|→ 409|duplicate/i.test(error.message)
}

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

/** A single IAM policy rule, scoped to either a project or the organization. */
export interface PolicyRule {
  permission_set_names: readonly string[]
  project_ids?: string[]
  organization_id?: string
}

/** Per-identity differences in the scoped IAM application, policy, and API key flow. */
export interface ScopedKeyConfig {
  /** Application/policy name suffix and API-key description prefix, e.g. `ci-deploy`. */
  suffix: string
  /** Human-readable IAM application description. */
  appDescription: string
  /** Human-readable IAM policy description. */
  policyDescription: string
  /** Builds the policy rules once the organization id is known. Required unless `managePolicy` is false. */
  buildRules?: (ctx: { projectId: string; organizationId: string }) => PolicyRule[]
  /**
   * Whether this flow owns the identity's IAM policy. Defaults to `true`.
   *
   * Set `false` when the policy is declared as a Pulumi-managed resource,
   * so `pulumi up` reconciles its permission sets on every deploy and
   * the grant can never drift). In that case this flow provisions only the
   * application + API key and leaves the policy untouched, without deleting a
   * policy it does not own.
   */
  managePolicy?: boolean
  /**
   * Whether to mint an API key. Defaults to `true`. Set `false` to provision
   * only the application + policy and let a human mint a key in the console
   * (operator app). The result's accessKey/secretKey are empty strings then. */
  mintKey?: boolean
}

export interface ProvisionScopedKeyOptions {
  callerSecretKey: string
  organizationId?: string
  projectId: string
  slug: string
  /** Injected for tests; defaults to console.info. */
  log?: (msg: string) => void
}

export interface ScopedKeyResult {
  accessKey: string
  secretKey: string
  applicationId: string
  organizationId: string
}

/**
 * Resolve the organization id from a project id via the Account API. Also used
 * by callers outside the provisioning flow (e.g. the apply CLI, which needs the
 * org id to look up an existing IAM policy). Throws with guidance when it
 * cannot be resolved.
 */
export async function resolveOrganizationId(secretKey: string, projectId: string): Promise<string> {
  // Env-provided id wins: a project-scoped bootstrap key (staging) may lack
  // the Account read that the API fallback below needs.
  const fromEnv = process.env.SCW_DEFAULT_ORGANIZATION_ID?.trim()
  if (fromEnv) return fromEnv
  // GET /account/v3/projects/{id} returns the Project object directly, not
  // wrapped in { project: ... }.
  const project = await scwFetch<{ organization_id?: string }>({ secretKey }, 'GET', `${ACCOUNT_BASE}/projects/${projectId}`)
  if (!project?.organization_id) {
    throw new Error(
      `Could not resolve organization_id from project ${projectId}. ` +
        `Response: ${JSON.stringify(project)}. ` +
        `Re-run with SCW_DEBUG=1 for full request/response traces, or pass SCW_DEFAULT_ORGANIZATION_ID explicitly.`,
    )
  }
  return project.organization_id
}

/**
 * Provision (or rotate) a scoped IAM application + policy + API key.
 * Returns the freshly minted credentials; Scaleway only reveals `secret_key`
 * at creation time, so the caller must persist it immediately.
 */
export async function provisionScopedKey(opts: ProvisionScopedKeyOptions, config: ScopedKeyConfig): Promise<ScopedKeyResult> {
  const { callerSecretKey, projectId, slug } = opts
  const log = opts.log ?? ((msg) => console.info(msg))

  const organizationId = opts.organizationId ?? (await resolveOrganizationId(callerSecretKey, projectId))

  const appName = `${slug}-${config.suffix}`
  const policyName = `${appName}-policy`

  // 1. Find or create the IAM application.
  const { applications } = await scwFetch<{ applications: ScwApp[] }>({ secretKey: callerSecretKey },
    'GET',
    `${IAM_BASE}/applications?name=${encodeURIComponent(appName)}&organization_id=${organizationId}&page_size=20`,
  )
  let app = applications.find((a) => a.name === appName)
  if (app) {
    log(`  ${checkMark} Reusing IAM application: ${app.name} (${app.id})`)
  } else {
    app = await scwFetch<ScwApp>({ secretKey: callerSecretKey }, 'POST', `${IAM_BASE}/applications`, {
      name: appName,
      organization_id: organizationId,
      description: config.appDescription,
    })
    log(`  ${changeMark} Created IAM application: ${app.name} (${app.id})`)
  }

  // Recreate managed policies so rules match current permissions.
  // When Pulumi owns the policy, skip it here to avoid races and duplicate policies.
  // Scaleway splits IAM rights: IAMManager writes but cannot read (that needs
  // IAMReadOnly). A write-only bootstrap key skips the recreate-check and
  // creates directly, tolerating an already-exists conflict.
  if (config.managePolicy !== false) {
    if (!config.buildRules) {
      throw new Error('provisionScopedKey: buildRules is required when managePolicy is not false')
    }
    try {
      const { policies } = await scwFetch<{ policies: ScwPolicy[] }>({ secretKey: callerSecretKey },
        'GET',
        `${IAM_BASE}/policies?application_id=${app.id}&organization_id=${organizationId}&page_size=20`,
      )
      const existingPolicy = policies.find((p) => p.name === policyName)
      if (existingPolicy) {
        await scwSend({ secretKey: callerSecretKey }, 'DELETE', `${IAM_BASE}/policies/${existingPolicy.id}`)
        log(`  ${tildeMark} Removed existing policy: ${policyName} (recreating with current rules)`)
      }
    } catch (error) {
      if (!isPermissionDenied(error)) throw error
      log(`  ${tildeMark} Cannot list policies (IAMManager without IAMReadOnly) — creating '${policyName}' directly`)
    }
    try {
      await scwFetch<ScwPolicy>({ secretKey: callerSecretKey }, 'POST', `${IAM_BASE}/policies`, {
        name: policyName,
        organization_id: organizationId,
        application_id: app.id,
        description: config.policyDescription,
        rules: config.buildRules({ projectId, organizationId }),
      })
      log(`  ${changeMark} Created IAM policy: ${policyName}`)
    } catch (error) {
      if (!isAlreadyExists(error)) throw error
      log(`  ${checkMark} Policy ${policyName} already exists — kept as-is (rules refresh needs IAMReadOnly)`)
    }
  } else {
    log(`  ${checkMark} Policy management delegated to Pulumi (iam.Policy resource) — skipping`)
  }

  // 3. Replace existing API keys because Scaleway reveals each secret only at creation.
  //    Purging first prevents reruns from accumulating unusable keys.
  if (config.mintKey === false) {
    log(`  ${checkMark} Key minting skipped — create one in the console for ${app.name}`)
    return { accessKey: '', secretKey: '', applicationId: app.id, organizationId }
  }

  try {
    const { api_keys: existingKeys = [] } = await scwFetch<{ api_keys?: Array<{ access_key: string }> }>(
      { secretKey: callerSecretKey },
      'GET',
      `${IAM_BASE}/api-keys?application_id=${app.id}&organization_id=${organizationId}&page_size=100`,
    )
    for (const key of existingKeys) {
      await scwSend({ secretKey: callerSecretKey }, 'DELETE', `${IAM_BASE}/api-keys/${key.access_key}`)
      log(`  ${tildeMark} Removed orphan API key: ${key.access_key}`)
    }
  } catch (error) {
    if (!isPermissionDenied(error)) throw error
    log(`  ${tildeMark} Cannot list API keys (IAMManager without IAMReadOnly) — skipping the orphan purge`)
  }

  // 4. Mint a fresh API key.
  const apiKey = await scwFetch<ScwApiKey>({ secretKey: callerSecretKey }, 'POST', `${IAM_BASE}/api-keys`, {
    application_id: app.id,
    description: `${config.suffix} — rotated ${new Date().toISOString().slice(0, 10)}`,
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

/**
 * Find an IAM policy id by exact name within an organization, or undefined when
 * none matches. Detects a pre-existing (orphaned) policy that must be
 * adopted into Pulumi state and preserved.
 */
export async function findPolicyIdByName(secretKey: string, organizationId: string, name: string): Promise<string | undefined> {
  const { policies } = await scwFetch<{ policies: ScwPolicy[] }>({ secretKey },
    'GET',
    `${IAM_BASE}/policies?organization_id=${organizationId}&policy_name=${encodeURIComponent(name)}&page_size=20`,
  )
  return policies.find((p) => p.name === name)?.id
}

/**
 * Ensure the bootstrap key's own IAM application carries org-wide DNS. Needed
 * when the zone lives in a sibling project (a staging stack reusing the
 * production apex): the first provisioning `pulumi up` runs with the bootstrap
 * key and must create records in that shared zone. No-ops for user-owned keys
 * (Owner-level rights already include DNS) and when the policy already exists.
 * The grant is removed with the bootstrap application when the key is revoked.
 */
export async function ensureBootstrapDnsGrant(opts: {
  callerSecretKey: string
  accessKey: string
  organizationId: string
  slug: string
  log?: (msg: string) => void
}): Promise<boolean> {
  const log = opts.log ?? ((msg) => console.info(msg))
  const key = await scwFetch<{ application_id?: string | null }>(
    { secretKey: opts.callerSecretKey },
    'GET',
    `${IAM_BASE}/api-keys/${opts.accessKey}`,
  )
  if (!key.application_id) return false

  const policyName = `${opts.slug}-bootstrap-dns`
  try {
    const existing = await findPolicyIdByName(opts.callerSecretKey, opts.organizationId, policyName)
    if (existing) {
      log(`  Bootstrap DNS grant '${policyName}' already present`)
      return true
    }
  } catch (error) {
    if (!isPermissionDenied(error)) throw error
  }
  try {
    await scwFetch<ScwPolicy>({ secretKey: opts.callerSecretKey }, 'POST', `${IAM_BASE}/policies`, {
      name: policyName,
      organization_id: opts.organizationId,
      application_id: key.application_id,
      description: 'Org-wide DNS for the bootstrap key: first provisioning up writes records in the org-shared zone (auto-generated; revoke with the bootstrap key)',
      rules: [{ permission_set_names: [...ORG_WIDE_PROJECT_PERMISSION_SETS], organization_id: opts.organizationId }],
    })
    log(`  Created bootstrap DNS grant '${policyName}' (org-wide DomainsDNSFullAccess)`)
  } catch (error) {
    if (!isAlreadyExists(error)) throw error
    log(`  Bootstrap DNS grant '${policyName}' already present`)
  }
  return true
}
