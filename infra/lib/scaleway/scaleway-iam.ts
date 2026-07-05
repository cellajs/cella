/**
 * Shared Scaleway IAM plumbing for provisioning scoped, non-human API keys.
 *
 * Both the CI deploy key (`tasks/setup-ci-key.ts`) and the VM reader key
 * (`tasks/setup-vm-key.ts`) follow the same four-step flow:
 *   1. find or create a `<slug>-<suffix>` IAM application,
 *   2. recreate its policy so permission set changes always take effect,
 *   3. purge any orphan API keys (their secret_key is unrecoverable), and
 *   4. mint a single fresh API key.
 *
 * The only things that vary between identities are the application name suffix,
 * the descriptions, and the policy rules — all supplied via `ScopedKeyConfig`.
 * The permission sets themselves live in each task file so they stay
 * independently auditable (see `tasks/permission-sets.test.ts`).
 */

import { changeMark, checkMark, tildeMark } from 'shared/console'
import { scwFetch, scwSend } from './scw-fetch'

const IAM_BASE = 'https://api.scaleway.com/iam/v1alpha1'
const ACCOUNT_BASE = 'https://api.scaleway.com/account/v3'

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

/** Per-identity differences between the CI and VM provisioning flows. */
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
   * Set `false` when the policy is declared as a Pulumi-managed resource
   * instead (so `pulumi up` reconciles its permission sets on every deploy and
   * the grant can never drift). In that case this flow provisions only the
   * application + API key and leaves the policy untouched — never deleting a
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

  // 2. Find or create the policy. Always recreate when found so the rules stay
  //    in sync with the caller's permission sets — an existing policy silently
  //    loses new permissions if we just skip it.
  //
  //    Skipped entirely when `managePolicy` is false: the policy is then owned
  //    by a Pulumi-managed `iam.Policy` resource, so this flow must not create
  //    (or delete) one — doing so would either race Pulumi or leave an orphan
  //    second policy on the application.
  if (config.managePolicy !== false) {
    if (!config.buildRules) {
      throw new Error('provisionScopedKey: buildRules is required when managePolicy is not false')
    }
    const { policies } = await scwFetch<{ policies: ScwPolicy[] }>({ secretKey: callerSecretKey },
      'GET',
      `${IAM_BASE}/policies?application_id=${app.id}&organization_id=${organizationId}&page_size=20`,
    )
    const existingPolicy = policies.find((p) => p.name === policyName)
    if (existingPolicy) {
      await scwSend({ secretKey: callerSecretKey }, 'DELETE', `${IAM_BASE}/policies/${existingPolicy.id}`)
      log(`  ${tildeMark} Removed existing policy: ${policyName} (recreating with current rules)`)
    }
    await scwFetch<ScwPolicy>({ secretKey: callerSecretKey }, 'POST', `${IAM_BASE}/policies`, {
      name: policyName,
      organization_id: organizationId,
      application_id: app.id,
      description: config.policyDescription,
      rules: config.buildRules({ projectId, organizationId }),
    })
    log(`  ${changeMark} Created IAM policy: ${policyName}`)
  } else {
    log(`  ${checkMark} Policy management delegated to Pulumi (iam.Policy resource) — skipping`)
  }

  // 3. Delete any existing API keys before minting a new one. Scaleway only
  //    returns the secret_key at creation time, so pre-existing keys are
  //    unrecoverable dead weight — purging them keeps re-runs from accumulating
  //    orphans.
  if (config.mintKey === false) {
    log(`  ${checkMark} Key minting skipped — create one in the console for ${app.name}`)
    return { accessKey: '', secretKey: '', applicationId: app.id, organizationId }
  }

  const { api_keys: existingKeys = [] } = await scwFetch<{ api_keys?: Array<{ access_key: string }> }>(
    { secretKey: callerSecretKey },
    'GET',
    `${IAM_BASE}/api-keys?application_id=${app.id}&organization_id=${organizationId}&page_size=100`,
  )
  for (const key of existingKeys) {
    await scwSend({ secretKey: callerSecretKey }, 'DELETE', `${IAM_BASE}/api-keys/${key.access_key}`)
    log(`  ${tildeMark} Removed orphan API key: ${key.access_key}`)
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
 * none matches. Used to detect a pre-existing (orphaned) policy that must be
 * adopted into Pulumi state rather than re-created.
 */
export async function findPolicyIdByName(secretKey: string, organizationId: string, name: string): Promise<string | undefined> {
  const { policies } = await scwFetch<{ policies: ScwPolicy[] }>({ secretKey },
    'GET',
    `${IAM_BASE}/policies?organization_id=${organizationId}&policy_name=${encodeURIComponent(name)}&page_size=20`,
  )
  return policies.find((p) => p.name === name)?.id
}
