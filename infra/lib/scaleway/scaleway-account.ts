import { ACCOUNT_BASE, getApiKey } from './iam-client';
import { resolveOrganizationIdFromEnv } from './provider-env';
import { resolveOrganizationId } from './scaleway-iam';
import { scwFetch } from './scw-fetch';

/** A Scaleway project as returned by the Account API. */
export interface ScwProject {
  id: string;
  name: string;
  organization_id: string;
}

/**
 * Resolve the organization id from a bare API key, before any project id is
 * known. Every API key carries a `default_project_id` (a personal key gets the
 * organization's default project), which the Account API maps to its
 * organization. SCW_ORGANIZATION_ID / SCW_DEFAULT_ORGANIZATION_ID in the environment win.
 */
export async function resolveOrganizationIdFromKey(secretKey: string, accessKey: string): Promise<string> {
  const fromEnv = resolveOrganizationIdFromEnv();
  if (fromEnv) return fromEnv;
  const key = await getApiKey({ secretKey }, accessKey);
  if (!key.default_project_id) {
    throw new Error(`API key ${accessKey} has no default_project_id; pass SCW_DEFAULT_ORGANIZATION_ID explicitly.`);
  }
  return resolveOrganizationId(secretKey, key.default_project_id);
}

/** List the organization's projects (first 100; ample for an org console). */
export async function listProjects(secretKey: string, organizationId: string): Promise<ScwProject[]> {
  const { projects } = await scwFetch<{ projects: ScwProject[] }>(
    { secretKey },
    'GET',
    `${ACCOUNT_BASE}/projects?organization_id=${organizationId}&page_size=100`,
  );
  return projects;
}

/** Create a project in the organization and return it. */
export async function createProject(
  secretKey: string,
  opts: { organizationId: string; name: string; description?: string },
): Promise<ScwProject> {
  return scwFetch<ScwProject>({ secretKey }, 'POST', `${ACCOUNT_BASE}/projects`, {
    name: opts.name,
    organization_id: opts.organizationId,
    ...(opts.description ? { description: opts.description } : {}),
  });
}
