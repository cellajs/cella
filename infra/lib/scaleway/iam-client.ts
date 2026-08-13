import type { FetchLike } from '../utils/fetch-like';
import { resolveFetch } from '../utils/fetch-like';
import { scwFetch, scwSend } from './scw-fetch';

/**
 * The shared IAM read/key client: app resolution, policy/rule collection, and
 * api-key CRUD, deduplicated from assert-vm-grants, mint-generation-keys, and
 * the CLI's drift check (IAM backlog item 5/8). Bootstrap provisioning flows
 * (scaleway-iam.ts) keep their own interwoven helpers on purpose — their
 * error handling and pagination needs differ per ritual step.
 *
 * Every function takes the same auth shape scwFetch does ({secretKey,
 * fetchImpl?}), so callers that inject a fetch for tests and callers that
 * mock the scw-fetch module both keep working.
 */

export const IAM_BASE = 'https://api.scaleway.com/iam/v1alpha1';
const ACCOUNT_BASE = 'https://api.scaleway.com/account/v3';

export interface IamAuth {
  secretKey: string;
  fetchImpl?: FetchLike;
}

export interface GrantedRule {
  policyName: string;
  permissionSets: string[];
  condition: string;
}

export interface ScwApiKey {
  access_key: string;
  secret_key: string;
  created_at?: string;
}

/** Resolve the organization id owning a project (the api-key-free path). */
export async function resolveOrganizationIdViaProject(auth: IamAuth, projectId: string): Promise<string> {
  const project = await scwFetch<{ organization_id?: string }>(auth, 'GET', `${ACCOUNT_BASE}/projects/${projectId}`);
  if (!project?.organization_id) {
    throw new Error(`Could not resolve organization_id from project ${projectId}. Pass --organization-id explicitly.`);
  }
  return project.organization_id;
}

/** Resolve an IAM application's id from its (unique) name. Returns null when not found. */
export async function resolveApplicationIdByName(
  auth: IamAuth,
  organizationId: string,
  name: string,
): Promise<string | null> {
  const { applications = [] } = await scwFetch<{ applications?: Array<{ id: string; name: string }> }>(
    auth,
    'GET',
    `${IAM_BASE}/applications?name=${encodeURIComponent(name)}&organization_id=${organizationId}&page_size=20`,
  );
  return applications.find((app) => app.name === name)?.id ?? null;
}

interface IamPolicy {
  id: string;
  name: string;
  /** Principal bindings: a policy targets exactly one of application / user / group. */
  application_id?: string;
  user_id?: string;
  group_id?: string;
}

/**
 * Every policy in the organization, paging past `page_size`. The list endpoint's
 * `application_id` filter is unreliable (Scaleway returns all policies regardless),
 * so callers filter by principal client-side against the `application_id` /
 * `group_id` each list item carries.
 */
async function listOrganizationPolicies(auth: IamAuth, organizationId: string): Promise<IamPolicy[]> {
  const pageSize = 100;
  const all: IamPolicy[] = [];
  for (let page = 1; page <= 100; page++) {
    const { policies = [], total_count = 0 } = await scwFetch<{ policies?: IamPolicy[]; total_count?: number }>(
      auth,
      'GET',
      `${IAM_BASE}/policies?organization_id=${organizationId}&page=${page}&page_size=${pageSize}`,
    );
    all.push(...policies);
    if (policies.length === 0 || all.length >= total_count) break;
  }
  return all;
}

/** Group ids the application belongs to; a group's policies grant the app too. */
async function fetchApplicationGroupIds(
  auth: IamAuth,
  organizationId: string,
  applicationId: string,
): Promise<Set<string>> {
  const ids = new Set<string>();
  for (let page = 1; page <= 100; page++) {
    const { groups = [], total_count = 0 } = await scwFetch<{
      groups?: Array<{ id: string; application_ids?: string[] }>;
      total_count?: number;
    }>(auth, 'GET', `${IAM_BASE}/groups?organization_id=${organizationId}&page=${page}&page_size=100`);
    for (const group of groups) if ((group.application_ids ?? []).includes(applicationId)) ids.add(group.id);
    if (groups.length === 0 || (page - 1) * 100 + groups.length >= total_count) break;
  }
  return ids;
}

/** Every rule (permission sets + condition) granted to an application across its policies. */
export async function fetchGrantedRules(
  auth: IamAuth,
  organizationId: string,
  applicationId: string,
): Promise<GrantedRule[]> {
  const groupIds = await fetchApplicationGroupIds(auth, organizationId, applicationId);
  const policies = await listOrganizationPolicies(auth, organizationId);
  const bound = policies.filter(
    (policy) =>
      policy.application_id === applicationId || (policy.group_id !== undefined && groupIds.has(policy.group_id)),
  );
  const collected: GrantedRule[] = [];
  for (const policy of bound) {
    const { rules = [] } = await scwFetch<{ rules?: Array<{ permission_set_names?: string[]; condition?: string }> }>(
      auth,
      'GET',
      `${IAM_BASE}/rules?policy_id=${policy.id}&page_size=100`,
    );
    for (const rule of rules) {
      collected.push({
        policyName: policy.name,
        permissionSets: rule.permission_set_names ?? [],
        condition: rule.condition ?? '',
      });
    }
  }
  return collected;
}

/**
 * Every rule granted to an application resolved by name. Returns null when the
 * application does not exist. Convenience wrapper (resolve org → resolve app
 * id → collect rules) for callers that only have the deterministic
 * `<slug>-<suffix>` name (the CLI's per-rule CI-policy drift check).
 */
export async function fetchAppRulesByName(opts: {
  secretKey: string;
  projectId: string;
  applicationName: string;
  organizationId?: string;
  fetchImpl?: FetchLike;
}): Promise<GrantedRule[] | null> {
  const auth: IamAuth = { secretKey: opts.secretKey, fetchImpl: resolveFetch(opts.fetchImpl) };
  const organizationId = opts.organizationId ?? (await resolveOrganizationIdViaProject(auth, opts.projectId));
  const applicationId = await resolveApplicationIdByName(auth, organizationId, opts.applicationName);
  if (!applicationId) return null;
  return fetchGrantedRules(auth, organizationId, applicationId);
}

/** All api keys on an application (one page of 100 — the fleet keeps ≤2 per app). */
export async function listApiKeys(auth: IamAuth, organizationId: string, applicationId: string): Promise<ScwApiKey[]> {
  const { api_keys = [] } = await scwFetch<{ api_keys?: ScwApiKey[] }>(
    auth,
    'GET',
    `${IAM_BASE}/api-keys?application_id=${applicationId}&organization_id=${organizationId}&page_size=100`,
  );
  return api_keys;
}

/** Mint a fresh api key on an application. */
export async function createApiKey(
  auth: IamAuth,
  opts: { applicationId: string; description: string; defaultProjectId: string },
): Promise<ScwApiKey> {
  return scwFetch<ScwApiKey>(auth, 'POST', `${IAM_BASE}/api-keys`, {
    application_id: opts.applicationId,
    description: opts.description,
    default_project_id: opts.defaultProjectId,
  });
}

/** Delete one api key by access key. */
export async function deleteApiKey(auth: IamAuth, accessKey: string): Promise<void> {
  await scwSend(auth, 'DELETE', `${IAM_BASE}/api-keys/${accessKey}`);
}
