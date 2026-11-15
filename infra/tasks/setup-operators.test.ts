import { beforeEach, describe, expect, it, vi } from 'vitest';
import { resolveDnsProjectIds } from '../lib/scaleway/dns-zone-project';
import { addApplicationToGroup, ensureApplication, ensureGroup } from '../lib/scaleway/scaleway-iam';
import { scwFetch, scwSend } from '../lib/scaleway/scw-fetch';
import { OPERATOR_POLICY_DESCRIPTION as DESCRIPTION, operatorPolicyReach, operatorRules, setupOperators } from './setup-operators';

vi.mock('../lib/scaleway/scaleway-iam', () => ({ addApplicationToGroup: vi.fn(), ensureApplication: vi.fn(), ensureGroup: vi.fn() }));
vi.mock('../lib/scaleway/dns-zone-project', () => ({ resolveDnsProjectIds: vi.fn() }));
vi.mock('../lib/scaleway/scw-fetch', () => ({ scwFetch: vi.fn(), scwSend: vi.fn() }));

const base = {
  callerSecretKey: 'owner-secret',
  organizationId: 'org-1',
  projectId: 'proj',
  projectIds: ['proj', 'proj-staging'],
  slug: 'cella',
  dnsZone: 'cellajs.com',
  log: () => {},
};

/** The policies IAM lists by name, with their rules; a name absent here is a policy that does not exist. */
const live = new Map<string, { id: string; application_id?: string; group_id?: string; description?: string; rules: unknown[] }>();

beforeEach(() => {
  vi.mocked(ensureApplication).mockReset().mockResolvedValue({ id: 'app-1', name: 'cella-operator' });
  vi.mocked(ensureGroup).mockReset().mockResolvedValue({ id: 'group-1', name: 'cella-operators' });
  vi.mocked(addApplicationToGroup).mockReset().mockResolvedValue(true);
  vi.mocked(resolveDnsProjectIds).mockReset().mockResolvedValue(['proj']);
  vi.mocked(scwSend).mockReset().mockResolvedValue(undefined);
  live.clear();
  vi.mocked(scwFetch)
    .mockReset()
    .mockImplementation(async (_auth, method, url) => {
      const { pathname, searchParams } = new URL(url);
      if (method === 'GET' && pathname.endsWith('/policies')) {
        const name = searchParams.get('policy_name') ?? '';
        const policy = live.get(name);
        return {
          policies: policy
            ? [{ id: policy.id, name, application_id: policy.application_id, group_id: policy.group_id, description: policy.description }]
            : [],
        };
      }
      if (method === 'GET' && pathname.endsWith('/rules')) {
        const policy = [...live.values()].find((candidate) => candidate.id === searchParams.get('policy_id'));
        return { rules: policy?.rules ?? [] };
      }
      if (method === 'POST' && pathname.endsWith('/policies')) return { id: 'pol-new' };
      throw new Error(`no fake for ${method} ${pathname}`);
    });
});

const posted = () => vi.mocked(scwFetch).mock.calls.filter(([, method, url]) => method === 'POST' && url.endsWith('/policies'));

describe('operatorRules', () => {
  it('must not hold a key to an address: no rule carries a condition', () => {
    const rules = operatorRules({ projectIds: ['proj'], organizationId: 'org-1', dnsProjectIds: ['proj', 'zone-proj'] });
    expect(rules).toHaveLength(3);
    for (const rule of rules) expect(rule.condition).toBeUndefined();
  });

  it('must not write IAM: no rule holds a set that writes applications, policies or keys', () => {
    const rules = operatorRules({ projectIds: ['proj'], organizationId: 'org-1', dnsProjectIds: ['proj', 'zone-proj'] });
    const sets = rules.flatMap((rule) => rule.permission_set_names);
    expect(sets.filter((set) => set.startsWith('IAM'))).toEqual(['IAMReadOnly']);
    expect(sets).not.toContain('OrganizationManager');
  });

  it('must not hand over a project outside the app: a zone served elsewhere gets DNS only', () => {
    const rules = operatorRules({ projectIds: ['proj', 'proj-staging'], organizationId: 'org-1', dnsProjectIds: ['proj', 'zone-proj'] });
    expect(rules[1]).toEqual({ permission_set_names: ['DomainsDNSFullAccess'], project_ids: ['zone-proj'] });
    expect(rules.filter((rule) => rule.permission_set_names.includes('AllProductsFullAccess')).flatMap((rule) => rule.project_ids)).toEqual([
      'proj',
      'proj-staging',
    ]);
  });
});

describe('setupOperators', () => {
  const rules = operatorRules({ projectIds: ['proj', 'proj-staging'], organizationId: 'org-1', dnsProjectIds: ['proj'] });

  it("grants through the group's policy alone: its rules are replaced in place, the application joins the group, and only then is the application's own policy deleted, saying when a condition went with it", async () => {
    live.set('cella-operator-policy', {
      id: 'pol-app',
      application_id: 'app-1',
      description: 'conditioned on the dedicated IP address',
      rules: [{ ...rules[0], condition: "request.ip in ['203.0.113.7']" }],
    });
    live.set('cella-operators-policy', { id: 'pol-group', group_id: 'group-1', description: DESCRIPTION, rules: [rules[0]] });

    const result = await setupOperators(base);

    expect(result).toEqual({ policy: 'updated', applicationPolicyDeleted: true, conditionDropped: true });
    expect(posted()).toEqual([]);
    expect(vi.mocked(scwSend).mock.calls).toEqual([
      [expect.anything(), 'PUT', expect.stringMatching(/\/rules$/), { policy_id: 'pol-group', rules }],
      [expect.anything(), 'DELETE', expect.stringMatching(/\/policies\/pol-app$/)],
    ]);
    // A key of the application keeps its rights in between: it is a member before its own policy goes.
    expect(addApplicationToGroup).toHaveBeenCalledWith('owner-secret', { id: 'group-1', name: 'cella-operators' }, 'app-1');
    const [joined] = vi.mocked(addApplicationToGroup).mock.invocationCallOrder;
    const [, deleted] = vi.mocked(scwSend).mock.invocationCallOrder;
    expect(joined).toBeLessThan(deleted ?? 0);
  });

  it('must not take over or delete a policy bound to another principal', async () => {
    live.set('cella-operators-policy', { id: 'pol-group', group_id: 'someone-else', rules });
    await expect(setupOperators(base)).rejects.toThrow(/another principal/);
    expect(scwSend).not.toHaveBeenCalled();

    // Nor does such a policy add a project of its own to what the operators reach.
    live.set('cella-operators-policy', { id: 'pol-group', group_id: 'group-1', description: DESCRIPTION, rules });
    live.set('cella-operator-policy', {
      id: 'pol-app',
      application_id: 'someone-else',
      rules: [{ permission_set_names: ['AllProductsFullAccess'], project_ids: ['proj-of-another-app'] }],
    });
    expect(await setupOperators(base)).toEqual({ policy: 'unchanged', applicationPolicyDeleted: false, conditionDropped: false });
    expect(scwSend).not.toHaveBeenCalled();
  });

  it('must not set up operators for a project outside their own reach', async () => {
    await expect(setupOperators({ ...base, projectId: 'elsewhere' })).rejects.toThrow(/not among the app's projects/);
    expect(ensureApplication).not.toHaveBeenCalled();
  });
});

describe('operatorPolicyReach', () => {
  it('reads the projects the products rule covers', () => {
    const rules = operatorRules({ projectIds: ['proj', 'proj-staging'], organizationId: 'org-1', dnsProjectIds: ['zone-proj'] });
    expect(operatorPolicyReach(rules)).toEqual({ projectIds: ['proj', 'proj-staging'] });
  });
});
