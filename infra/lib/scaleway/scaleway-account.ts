import { ACCOUNT_BASE } from './iam-client';
import { scwFetch } from './scw-fetch';

/** A Scaleway project as returned by the Account API. */
export interface ScwProject {
  id: string;
  name: string;
  organization_id: string;
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
export async function createProject(secretKey: string, opts: { organizationId: string; name: string; description?: string }): Promise<ScwProject> {
  return scwFetch<ScwProject>({ secretKey }, 'POST', `${ACCOUNT_BASE}/projects`, {
    name: opts.name,
    organization_id: opts.organizationId,
    ...(opts.description ? { description: opts.description } : {}),
  });
}
