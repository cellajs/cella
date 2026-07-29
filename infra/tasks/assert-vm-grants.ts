import { type FetchLike, resolveFetch } from '../lib/utils/fetch-like'
import { isMain } from '../lib/utils/is-main'
import { VM_PROJECT_PERMISSION_SETS } from '../lib/scaleway/permissions'
import { scwFetch } from '../lib/scaleway/scw-fetch'
import { getFlag } from './args'

const IAM_BASE = 'https://api.scaleway.com/iam/v1alpha1'
const ACCOUNT_BASE = 'https://api.scaleway.com/account/v3'

export interface AssertVmGrantsOptions {
  secretKey: string
  /** Either an explicit id, or a name to resolve via IAM list-applications. */
  applicationId?: string
  applicationName?: string
  projectId: string
  /** Resolved from projectId when omitted. */
  organizationId?: string
  /** Permission sets the VM must hold. Defaults to the canonical VM set. */
  required?: readonly string[]
  /** Injected for tests; defaults to global fetch. */
  fetchImpl?: FetchLike
  /** Injected for tests; defaults to console.info. */
  log?: (msg: string) => void
}

export interface AssertVmGrantsResult {
  ok: boolean
  granted: string[]
  missing: string[]
  /** Permission sets granted beyond the required set: privilege drift, fails the check. */
  extra: string[]
}

function scwGet<T>(fetchImpl: FetchLike, secretKey: string, url: string): Promise<T> {
  return scwFetch<T>({ secretKey, fetchImpl }, 'GET', url)
}

async function resolveOrgId(fetchImpl: FetchLike, secretKey: string, projectId: string): Promise<string> {
  const project = await scwGet<{ organization_id?: string }>(fetchImpl, secretKey, `${ACCOUNT_BASE}/projects/${projectId}`)
  if (!project?.organization_id) {
    throw new Error(`Could not resolve organization_id from project ${projectId}. Pass --organization-id explicitly.`)
  }
  return project.organization_id
}

/** Resolve an IAM application's id from its (unique) name. Returns null when not found. */
export async function resolveApplicationIdByName(fetchImpl: FetchLike, secretKey: string, organizationId: string, name: string): Promise<string | null> {
  const { applications = [] } = await scwGet<{ applications?: Array<{ id: string; name: string }> }>(
    fetchImpl,
    secretKey,
    `${IAM_BASE}/applications?name=${encodeURIComponent(name)}&organization_id=${organizationId}&page_size=20`,
  )
  return applications.find((app) => app.name === name)?.id ?? null
}

interface IamPolicy {
  id: string
  name: string
  /** Principal bindings: a policy targets exactly one of application / user / group. */
  application_id?: string
  user_id?: string
  group_id?: string
}

/**
 * Every policy in the organization, paging past `page_size`. The list endpoint's
 * `application_id` filter is unreliable (Scaleway returns all policies regardless),
 * so callers filter by principal client-side against the `application_id` /
 * `group_id` each list item carries.
 */
async function listOrganizationPolicies(fetchImpl: FetchLike, secretKey: string, organizationId: string): Promise<IamPolicy[]> {
  const pageSize = 100
  const all: IamPolicy[] = []
  for (let page = 1; page <= 100; page++) {
    const { policies = [], total_count = 0 } = await scwGet<{ policies?: IamPolicy[]; total_count?: number }>(
      fetchImpl,
      secretKey,
      `${IAM_BASE}/policies?organization_id=${organizationId}&page=${page}&page_size=${pageSize}`,
    )
    all.push(...policies)
    if (policies.length === 0 || all.length >= total_count) break
  }
  return all
}

/** Group ids the application belongs to; a group's policies grant the app too. */
async function fetchApplicationGroupIds(fetchImpl: FetchLike, secretKey: string, organizationId: string, applicationId: string): Promise<Set<string>> {
  const ids = new Set<string>()
  for (let page = 1; page <= 100; page++) {
    const { groups = [], total_count = 0 } = await scwGet<{ groups?: Array<{ id: string; application_ids?: string[] }>; total_count?: number }>(
      fetchImpl,
      secretKey,
      `${IAM_BASE}/groups?organization_id=${organizationId}&page=${page}&page_size=100`,
    )
    for (const group of groups) if ((group.application_ids ?? []).includes(applicationId)) ids.add(group.id)
    if (groups.length === 0 || (page - 1) * 100 + groups.length >= total_count) break
  }
  return ids
}

/**
 * Union of permission set names actually granted to an application: the rules of
 * every policy whose principal is the application itself or a group it belongs to.
 * Policies bound to other principals (other applications, users, or unrelated
 * groups) are excluded, so a shared organization's policies do not leak in.
 */
export async function fetchGrantedPermissionSets(fetchImpl: FetchLike, secretKey: string, organizationId: string, applicationId: string): Promise<string[]> {
  const groupIds = await fetchApplicationGroupIds(fetchImpl, secretKey, organizationId, applicationId)
  const policies = await listOrganizationPolicies(fetchImpl, secretKey, organizationId)
  const bound = policies.filter((policy) => policy.application_id === applicationId || (policy.group_id !== undefined && groupIds.has(policy.group_id)))
  const granted = new Set<string>()
  for (const policy of bound) {
    const { rules = [] } = await scwGet<{ rules?: Array<{ permission_set_names?: string[] }> }>(
      fetchImpl,
      secretKey,
      `${IAM_BASE}/rules?policy_id=${policy.id}&page_size=100`,
    )
    for (const rule of rules) {
      for (const name of rule.permission_set_names ?? []) granted.add(name)
    }
  }
  return [...granted]
}

/**
 * Sorted union of permission set names granted to an application resolved by
 * name. Returns null when the application does not exist. Convenience wrapper
 * (resolve org → resolve app id → collect sets) for callers that only have the
 * deterministic `<slug>-<suffix>` name (e.g. the CLI's CI-policy drift check).
 */
export async function fetchAppPermissionSetsByName(opts: {
  secretKey: string
  projectId: string
  applicationName: string
  organizationId?: string
  fetchImpl?: FetchLike
}): Promise<string[] | null> {
  const fetchImpl = resolveFetch(opts.fetchImpl)
  const organizationId = opts.organizationId ?? (await resolveOrgId(fetchImpl, opts.secretKey, opts.projectId))
  const applicationId = await resolveApplicationIdByName(fetchImpl, opts.secretKey, organizationId, opts.applicationName)
  if (!applicationId) return null
  return (await fetchGrantedPermissionSets(fetchImpl, opts.secretKey, organizationId, applicationId)).sort()
}

/**
 * Collect the union of permission set names granted to an application across all
 * its IAM policies and their rules, then verify it EQUALS the required set:
 * missing sets break secret hydration, extra sets are privilege drift beyond the
 * minimal VM profile (a write grant on this key widens every VM's blast radius).
 */
export async function assertVmGrants(opts: AssertVmGrantsOptions): Promise<AssertVmGrantsResult> {
  const fetchImpl = resolveFetch(opts.fetchImpl)
  const log = opts.log ?? ((msg) => console.info(msg))
  const required = opts.required ?? VM_PROJECT_PERMISSION_SETS
  const organizationId = opts.organizationId ?? (await resolveOrgId(fetchImpl, opts.secretKey, opts.projectId))

  let applicationId = opts.applicationId
  if (!applicationId && opts.applicationName) {
    applicationId = (await resolveApplicationIdByName(fetchImpl, opts.secretKey, organizationId, opts.applicationName)) ?? undefined
    if (!applicationId) throw new Error(`IAM application '${opts.applicationName}' not found in organization ${organizationId}`)
  }
  if (!applicationId) throw new Error('assertVmGrants: provide applicationId or applicationName')

  const granted = new Set(await fetchGrantedPermissionSets(fetchImpl, opts.secretKey, organizationId, applicationId))

  const requiredSet = new Set(required)
  const missing = required.filter((r) => !granted.has(r))
  const extra = [...granted].filter((g) => !requiredSet.has(g)).sort()
  if (missing.length === 0 && extra.length === 0) {
    log(`✓ VM reader grant verified — exactly the ${required.length} required permission sets, nothing more`)
  } else {
    if (missing.length > 0) log(`✗ VM reader grant INCOMPLETE — missing: ${missing.join(', ')}`)
    if (extra.length > 0) log(`✗ VM reader grant TOO BROAD — extra: ${extra.join(', ')}`)
  }
  return { ok: missing.length === 0 && extra.length === 0, granted: [...granted].sort(), missing, extra }
}

// Standalone entry point.
export async function main(argv = process.argv.slice(2)): Promise<void> {
  const secretKey = process.env.SCW_SECRET_KEY
  const applicationId = getFlag(argv, '--application-id') ?? process.env.VM_APPLICATION_ID
  const applicationName = getFlag(argv, '--application-name') ?? process.env.VM_APPLICATION_NAME
  const projectId = getFlag(argv, '--project-id') ?? process.env.SCW_DEFAULT_PROJECT_ID
  const organizationId = getFlag(argv, '--organization-id') ?? process.env.SCW_DEFAULT_ORGANIZATION_ID

  if (!secretKey || !(applicationId || applicationName) || !projectId) {
    throw new Error('Required: SCW_SECRET_KEY, --application-id or --application-name, --project-id')
  }

  const result = await assertVmGrants({ secretKey, applicationId, applicationName, projectId, organizationId })
  if (!result.ok) {
    const problems = [
      result.missing.length > 0 ? `missing required permission sets: ${result.missing.join(', ')}` : '',
      result.extra.length > 0 ? `granted EXTRA permission sets beyond the minimal VM profile: ${result.extra.join(', ')}` : '',
    ].filter(Boolean)
    throw new Error(
      `VM reader application ${applicationId ?? applicationName} ${problems.join('; ')}. ` +
        'The Pulumi-managed policy (infra/resources/vm-iam.ts) defines the exact grant; check that `pulumi up` succeeded and remove any manually-attached policies.',
    )
  }
}

if (isMain(import.meta.url)) {
  main().catch((err) => {
    process.stderr.write(`${err instanceof Error ? err.message : String(err)}\n`)
    process.exit(1)
  })
}
