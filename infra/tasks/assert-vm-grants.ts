/**
 * Assert the live `<slug>-vm-reader` IAM application actually grants the
 * permission sets the VMs depend on — a cheap, read-only verification run in CI
 * right after `pulumi up`.
 *
 * Why this exists: a VM whose key cannot decrypt runtime secrets boots into a
 * crash-loop behind a 502 with no automatic recovery (the failure that took
 * cellajs.com down). `resources/vm-iam.ts` makes the grant drift-proof by
 * declaring it as a Pulumi resource, but this task is the belt-and-suspenders
 * check that the reconcile actually took effect on the live policy BEFORE the
 * deploy proceeds to roll/replace VMs that rely on it. If a grant is missing it
 * fails the deploy loudly (with the exact missing permission sets) instead of
 * letting a fleet-wide 502 surface only after rollout.
 *
 * Read-only: lists the application's IAM policies and their rules and checks
 * that the union of granted permission sets covers VM_PROJECT_PERMISSION_SETS.
 *
 * Usage:
 *   tsx infra/tasks/assert-vm-grants.ts \
 *     --application-id <vm-app-id> --project-id <project-id> [--organization-id <org>]
 *   (SCW_SECRET_KEY in env)
 */
import { isMain } from '../lib/is-main'
import { VM_PROJECT_PERMISSION_SETS } from '../lib/permissions'
import { getFlag } from './args'

const IAM_BASE = 'https://api.scaleway.com/iam/v1alpha1'
const ACCOUNT_BASE = 'https://api.scaleway.com/account/v3'

/** Minimal fetch surface so the assertion logic is unit-testable. */
export type FetchLike = (url: string, init?: { method?: string; headers?: Record<string, string> }) => Promise<{
  ok: boolean
  status: number
  text: () => Promise<string>
}>

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
}

async function scwGet<T>(fetchImpl: FetchLike, secretKey: string, url: string): Promise<T> {
  const res = await fetchImpl(url, { method: 'GET', headers: { 'X-Auth-Token': secretKey } })
  const text = await res.text()
  if (!res.ok) throw new Error(`Scaleway GET ${url} → ${res.status}: ${text}`)
  return (text === '' ? {} : JSON.parse(text)) as T
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

/** Union of permission set names granted to an application across all its policies' rules. */
export async function fetchGrantedPermissionSets(fetchImpl: FetchLike, secretKey: string, organizationId: string, applicationId: string): Promise<string[]> {
  const { policies = [] } = await scwGet<{ policies?: Array<{ id: string; name: string }> }>(
    fetchImpl,
    secretKey,
    `${IAM_BASE}/policies?application_id=${applicationId}&organization_id=${organizationId}&page_size=100`,
  )
  const granted = new Set<string>()
  for (const policy of policies) {
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
  const fetchImpl = opts.fetchImpl ?? (globalThis.fetch as unknown as FetchLike)
  const organizationId = opts.organizationId ?? (await resolveOrgId(fetchImpl, opts.secretKey, opts.projectId))
  const applicationId = await resolveApplicationIdByName(fetchImpl, opts.secretKey, organizationId, opts.applicationName)
  if (!applicationId) return null
  return (await fetchGrantedPermissionSets(fetchImpl, opts.secretKey, organizationId, applicationId)).sort()
}

/**
 * Collect the union of permission set names granted to an application across all
 * its IAM policies and their rules, then compute which required sets are missing.
 */
export async function assertVmGrants(opts: AssertVmGrantsOptions): Promise<AssertVmGrantsResult> {
  const fetchImpl = opts.fetchImpl ?? (globalThis.fetch as unknown as FetchLike)
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

  const missing = required.filter((r) => !granted.has(r))
  if (missing.length === 0) {
    log(`✓ VM reader grant verified — all ${required.length} required permission sets present`)
  } else {
    log(`✗ VM reader grant INCOMPLETE — missing: ${missing.join(', ')}`)
  }
  return { ok: missing.length === 0, granted: [...granted].sort(), missing }
}

// Standalone entry point.
if (isMain(import.meta.url)) {
  const secretKey = process.env.SCW_SECRET_KEY
  const applicationId = getFlag(process.argv, '--application-id') ?? process.env.VM_APPLICATION_ID
  const applicationName = getFlag(process.argv, '--application-name') ?? process.env.VM_APPLICATION_NAME
  const projectId = getFlag(process.argv, '--project-id') ?? process.env.SCW_DEFAULT_PROJECT_ID
  const organizationId = getFlag(process.argv, '--organization-id') ?? process.env.SCW_DEFAULT_ORGANIZATION_ID

  if (!secretKey || !(applicationId || applicationName) || !projectId) {
    process.stderr.write('Required: SCW_SECRET_KEY, --application-id or --application-name, --project-id\n')
    process.exit(2)
  }

  const result = await assertVmGrants({ secretKey, applicationId, applicationName, projectId, organizationId })
  if (!result.ok) {
    process.stderr.write(
      `VM reader application ${applicationId ?? applicationName} is missing required permission sets: ${result.missing.join(', ')}.\n` +
        'The Pulumi-managed policy (infra/resources/vm-iam.ts) should grant these — check that `pulumi up` succeeded.\n',
    )
    process.exit(1)
  }
}
