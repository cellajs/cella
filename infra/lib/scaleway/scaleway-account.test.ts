import { afterEach, describe, expect, it, vi } from 'vitest';
import { clearOrganizationEnv, makeFetch } from '../../tests/helpers/fake-fetch';
import { createProject, listProjects } from './scaleway-account';

clearOrganizationEnv();

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('listProjects', () => {
  it('lists the organization projects', async () => {
    const projects = [{ id: 'p1', name: 'default', organization_id: 'org-1' }];
    const { fn, calls } = makeFetch([{ method: 'GET', match: '/account/v3/projects?organization_id=org-1', body: { projects } }]);
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
    expect(JSON.parse(String(calls[0]!.init.body))).toEqual({ name: 'demo', organization_id: 'org-1', description: 'wizard' });
  });
});
