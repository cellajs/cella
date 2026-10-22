import { beforeEach, describe, expect, it, vi } from 'vitest';
import { resolveDnsProjectIds } from '../lib/scaleway/dns-zone-project';
import { provisionScopedKey } from '../lib/scaleway/scaleway-iam';
import { operatorPolicyReach, operatorRules, setupOperatorApp } from './setup-operator-app';

vi.mock('../lib/scaleway/scaleway-iam', () => ({ provisionScopedKey: vi.fn() }));
vi.mock('../lib/scaleway/dns-zone-project', () => ({ resolveDnsProjectIds: vi.fn() }));

const base = {
  callerSecretKey: 'owner-secret',
  organizationId: 'org-1',
  projectId: 'proj',
  projectIds: ['proj', 'proj-staging'],
  slug: 'cella',
  dnsZone: 'cellajs.com',
};
const lock = "request.ip in ['203.0.113.7']";

beforeEach(() => {
  vi.mocked(provisionScopedKey).mockReset();
  vi.mocked(provisionScopedKey).mockResolvedValue({ applicationId: 'app-1', accessKey: 'SCWOP', secretKey: 'op-secret', organizationId: 'org-1' });
  vi.mocked(resolveDnsProjectIds).mockReset();
  vi.mocked(resolveDnsProjectIds).mockResolvedValue(['proj']);
});

describe('operatorRules', () => {
  it('must not grant anything without the IP condition: every rule carries it', () => {
    const rules = operatorRules({ projectIds: ['proj'], organizationId: 'org-1', dnsProjectIds: ['proj', 'zone-proj'], cidrs: ['203.0.113.7/32'] });
    expect(rules).toHaveLength(3);
    for (const rule of rules) expect(rule.condition).toBe(lock);
  });

  it("grants every product of the app's projects, and IAM read in the organization", () => {
    expect(
      operatorRules({ projectIds: ['proj', 'proj-staging'], organizationId: 'org-1', dnsProjectIds: ['proj'], cidrs: ['203.0.113.7/32'] }),
    ).toEqual([
      { permission_set_names: ['AllProductsFullAccess'], project_ids: ['proj', 'proj-staging'], condition: lock },
      { permission_set_names: ['IAMReadOnly'], organization_id: 'org-1', condition: lock },
    ]);
  });

  it('must not write IAM: no rule holds a set that writes applications, policies or keys', () => {
    const rules = operatorRules({ projectIds: ['proj'], organizationId: 'org-1', dnsProjectIds: ['proj', 'zone-proj'], cidrs: ['203.0.113.7/32'] });
    const sets = rules.flatMap((rule) => rule.permission_set_names);
    expect(sets.filter((set) => set.startsWith('IAM'))).toEqual(['IAMReadOnly']);
    expect(sets).not.toContain('OrganizationManager');
  });

  it('must not hand over a project outside the app: a zone served elsewhere gets DNS only', () => {
    const rules = operatorRules({
      projectIds: ['proj', 'proj-staging'],
      organizationId: 'org-1',
      dnsProjectIds: ['proj', 'zone-proj'],
      cidrs: ['203.0.113.7/32'],
    });
    expect(rules[1]).toEqual({ permission_set_names: ['DomainsDNSFullAccess'], project_ids: ['zone-proj'], condition: lock });
    expect(rules.filter((rule) => rule.permission_set_names.includes('AllProductsFullAccess')).flatMap((rule) => rule.project_ids)).toEqual([
      'proj',
      'proj-staging',
    ]);
  });
});

describe('setupOperatorApp', () => {
  it('provisions one operator application for the app, with a policy and a key, under the rules above', async () => {
    const result = await setupOperatorApp({ ...base, cidrs: ['203.0.113.7/32'] });

    expect(result.secretKey).toBe('op-secret');
    const [opts, config] = vi.mocked(provisionScopedKey).mock.calls[0] ?? [];
    expect(opts).toMatchObject({ slug: 'cella', projectId: 'proj' });
    // No mode: the application is named `cella-operator` and joins no environment's group, so tearing one environment down leaves it.
    expect((opts as { mode?: string } | undefined)?.mode).toBeUndefined();
    expect(config?.suffix).toBe('operator');
    expect(config?.buildRules?.({ projectId: 'proj', organizationId: 'org-1' })).toEqual(
      operatorRules({ projectIds: ['proj', 'proj-staging'], organizationId: 'org-1', dnsProjectIds: ['proj'], cidrs: ['203.0.113.7/32'] }),
    );
  });

  it('must not make a key for a project outside its own reach', async () => {
    await expect(setupOperatorApp({ ...base, projectId: 'elsewhere', cidrs: ['203.0.113.7/32'] })).rejects.toThrow(/not among the app's projects/);
    expect(provisionScopedKey).not.toHaveBeenCalled();
  });

  it('must not create an application before the address list is known to be valid', async () => {
    await expect(setupOperatorApp({ ...base, cidrs: [] })).rejects.toThrow(/without its condition/);
    await expect(setupOperatorApp({ ...base, cidrs: ['not-an-address'] })).rejects.toThrow(/not an IPv4 CIDR/);
    expect(provisionScopedKey).not.toHaveBeenCalled();
    expect(resolveDnsProjectIds).not.toHaveBeenCalled();
  });
});

describe('operatorPolicyReach', () => {
  it('reads the projects the products rule covers and the one address list every rule carries', () => {
    const rules = operatorRules({
      projectIds: ['proj', 'proj-staging'],
      organizationId: 'org-1',
      dnsProjectIds: ['zone-proj'],
      cidrs: ['203.0.113.7/32'],
    });
    expect(operatorPolicyReach(rules)).toEqual({ projectIds: ['proj', 'proj-staging'], cidrs: ['203.0.113.7/32'] });
  });

  it('must not read an address list when one rule carries another condition or none', () => {
    const rules = operatorRules({ projectIds: ['proj'], organizationId: 'org-1', dnsProjectIds: ['proj'], cidrs: ['203.0.113.7/32'] });
    expect(operatorPolicyReach([...rules, { permission_set_names: ['X'], condition: '' }]).cidrs).toEqual([]);
  });
});
