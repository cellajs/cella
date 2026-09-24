import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { makeFetch } from '../../tests/helpers/fake-fetch';
import { createProject, listProjects, resolveOrganizationIdFromKey } from './scaleway-account';

/** Fetch mock matching by (method, url-substring); mirrors scaleway-iam.test.ts. */

const ORG_ENV_NAMES = ['SCW_DEFAULT_ORGANIZATION_ID', 'SCW_ORGANIZATION_ID'] as const;
const savedOrgEnv = Object.fromEntries(ORG_ENV_NAMES.map((name) => [name, process.env[name]]));

beforeEach(() => {
  for (const name of ORG_ENV_NAMES) delete process.env[name];
});

afterEach(() => {
  for (const name of ORG_ENV_NAMES) {
    if (savedOrgEnv[name] === undefined) delete process.env[name];
    else process.env[name] = savedOrgEnv[name];
  }
  vi.unstubAllGlobals();
});

describe('resolveOrganizationIdFromKey', () => {
  it('prefers SCW_DEFAULT_ORGANIZATION_ID from the environment', async () => {
    process.env.SCW_DEFAULT_ORGANIZATION_ID = 'org-env';
    const { fn } = makeFetch([]);
    vi.stubGlobal('fetch', fn);
    await expect(resolveOrganizationIdFromKey('secret', 'SCWKEY')).resolves.toBe('org-env');
    expect(fn).not.toHaveBeenCalled();
  });

  it('accepts the repository name SCW_ORGANIZATION_ID too (backend/.env)', async () => {
    process.env.SCW_ORGANIZATION_ID = 'org-repo';
    const { fn } = makeFetch([]);
    vi.stubGlobal('fetch', fn);
    await expect(resolveOrganizationIdFromKey('secret', 'SCWKEY')).resolves.toBe('org-repo');
    expect(fn).not.toHaveBeenCalled();
  });

  it("walks api-key default_project_id to the project's organization", async () => {
    const { fn, calls } = makeFetch([
      {
        method: 'GET',
        match: '/iam/v1alpha1/api-keys/SCWKEY',
        body: { access_key: 'SCWKEY', default_project_id: 'proj-default' },
      },
      {
        method: 'GET',
        match: '/account/v3/projects/proj-default',
        body: { id: 'proj-default', organization_id: 'org-1' },
      },
    ]);
    vi.stubGlobal('fetch', fn);
    await expect(resolveOrganizationIdFromKey('secret', 'SCWKEY')).resolves.toBe('org-1');
    expect(calls.map((c) => c.url)).toEqual([
      'https://api.scaleway.com/iam/v1alpha1/api-keys/SCWKEY',
      'https://api.scaleway.com/account/v3/projects/proj-default',
    ]);
  });

  it('fails with guidance when the key has no default project', async () => {
    const { fn } = makeFetch([
      { method: 'GET', match: '/iam/v1alpha1/api-keys/SCWKEY', body: { access_key: 'SCWKEY' } },
    ]);
    vi.stubGlobal('fetch', fn);
    await expect(resolveOrganizationIdFromKey('secret', 'SCWKEY')).rejects.toThrow(/SCW_DEFAULT_ORGANIZATION_ID/);
  });
});

describe('listProjects', () => {
  it('lists the organization projects', async () => {
    const projects = [{ id: 'p1', name: 'default', organization_id: 'org-1' }];
    const { fn, calls } = makeFetch([
      { method: 'GET', match: '/account/v3/projects?organization_id=org-1', body: { projects } },
    ]);
    vi.stubGlobal('fetch', fn);
    await expect(listProjects('secret', 'org-1')).resolves.toEqual(projects);
    expect(calls[0]!.url).toContain('page_size=100');
  });
});

describe('createProject', () => {
  it('creates a project in the organization and returns it', async () => {
    const { fn, calls } = makeFetch([
      { method: 'POST', match: '/account/v3/projects', body: { id: 'p-new', name: 'demo', organization_id: 'org-1' } },
    ]);
    vi.stubGlobal('fetch', fn);
    const project = await createProject('secret', { organizationId: 'org-1', name: 'demo', description: 'wizard' });
    expect(project.id).toBe('p-new');
    expect(JSON.parse(String(calls[0]!.init.body))).toEqual({
      name: 'demo',
      organization_id: 'org-1',
      description: 'wizard',
    });
  });
});
