import type { FetchLike } from '../utils/fetch-like';
import { scwFetch, scwSend } from './scw-fetch';

export const IAM_BASE = 'https://api.scaleway.com/iam/v1alpha1';
export const ACCOUNT_BASE = 'https://api.scaleway.com/account/v3';

/** Auth shape shared with scwFetch, so callers injecting a fetch and callers mocking the scw-fetch module both work. */
export interface IamAuth {
  secretKey: string;
  fetchImpl?: FetchLike;
}

export interface ScwApiKey {
  access_key: string;
  secret_key: string;
  created_at?: string;
}

/** An api key as IAM describes it (no secret): its bearer is exactly one of `user_id` / `application_id`. */
export interface ScwApiKeyRecord {
  access_key: string;
  description?: string;
  expires_at?: string | null;
  application_id?: string | null;
  user_id?: string | null;
  default_project_id?: string;
}

/** Describe one api key. A key may describe itself, so this is the self-inspection every principal can perform. */
export async function getApiKey(auth: IamAuth, accessKey: string): Promise<ScwApiKeyRecord> {
  return scwFetch<ScwApiKeyRecord>(auth, 'GET', `${IAM_BASE}/api-keys/${accessKey}`);
}

/** Resolve the organization id owning a project (the api-key-free path). */
export async function resolveOrganizationIdViaProject(auth: IamAuth, projectId: string): Promise<string> {
  const project = await scwFetch<{ organization_id?: string }>(auth, 'GET', `${ACCOUNT_BASE}/projects/${projectId}`);
  if (!project?.organization_id) {
    throw new Error(`Could not resolve organization_id from project ${projectId}: set SCW_DEFAULT_ORGANIZATION_ID (or pass --organization-id).`);
  }
  return project.organization_id;
}

/** Resolve an IAM application's id from its (unique) name. Returns null when not found. */
export async function resolveApplicationIdByName(auth: IamAuth, organizationId: string, name: string): Promise<string | null> {
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

/** Every policy in the organization, paged. The list endpoint's `application_id` filter is unreliable, so callers filter by principal client-side. */
export async function listOrganizationPolicies(auth: IamAuth, organizationId: string): Promise<IamPolicy[]> {
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

/** All api keys on an application (one page of 100; a machine identity holds its standing key only). */
export async function listApiKeys(auth: IamAuth, organizationId: string, applicationId: string): Promise<ScwApiKey[]> {
  const { api_keys = [] } = await scwFetch<{ api_keys?: ScwApiKey[] }>(
    auth,
    'GET',
    `${IAM_BASE}/api-keys?application_id=${applicationId}&organization_id=${organizationId}&page_size=100`,
  );
  return api_keys;
}

/** Mint a fresh api key on an application or a user, optionally expiring (RFC 3339). */
export async function createApiKey(
  auth: IamAuth,
  opts: { applicationId?: string; userId?: string; description: string; defaultProjectId: string; expiresAt?: string },
): Promise<ScwApiKey> {
  return scwFetch<ScwApiKey>(auth, 'POST', `${IAM_BASE}/api-keys`, {
    ...(opts.applicationId ? { application_id: opts.applicationId } : {}),
    ...(opts.userId ? { user_id: opts.userId } : {}),
    description: opts.description,
    default_project_id: opts.defaultProjectId,
    ...(opts.expiresAt ? { expires_at: opts.expiresAt } : {}),
  });
}

export async function deleteApiKey(auth: IamAuth, accessKey: string): Promise<void> {
  await scwSend(auth, 'DELETE', `${IAM_BASE}/api-keys/${accessKey}`);
}
