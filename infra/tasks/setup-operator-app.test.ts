import { beforeEach, describe, expect, it, vi } from 'vitest';
import { resolveDnsProjectIds } from '../lib/scaleway/dns-zone-project';
import { provisionScopedKey } from '../lib/scaleway/scaleway-iam';
import { operatorRules, setupOperatorApp } from './setup-operator-app';

vi.mock('../lib/scaleway/scaleway-iam', () => ({ provisionScopedKey: vi.fn() }));
vi.mock('../lib/scaleway/dns-zone-project', () => ({ resolveDnsProjectIds: vi.fn() }));

const base = { callerSecretKey: 'owner-secret', projectId: 'proj', slug: 'cella', mode: 'production', dnsZone: 'cellajs.com' };
const lock = "request.ip in ['203.0.113.7']";

beforeEach(() => {
  vi.mocked(provisionScopedKey).mockReset();
  vi.mocked(provisionScopedKey).mockResolvedValue({ applicationId: 'app-1', accessKey: 'SCWOP', secretKey: 'op-secret', organizationId: 'org-1' });
  vi.mocked(resolveDnsProjectIds).mockReset();
  vi.mocked(resolveDnsProjectIds).mockResolvedValue(['proj']);
});

describe('operatorRules', () => {
  it('must not grant anything without the IP condition: every rule carries it', () => {
    const rules = operatorRules({ projectId: 'proj', organizationId: 'org-1', dnsProjectIds: ['proj', 'zone-proj'], cidrs: ['203.0.113.7/32'] });
    expect(rules).toHaveLength(3);
    for (const rule of rules) expect(rule.condition).toBe(lock);
  });

  it('grants every product of the app project, and IAM write with IAM read in the organization', () => {
    expect(operatorRules({ projectId: 'proj', organizationId: 'org-1', dnsProjectIds: ['proj'], cidrs: ['203.0.113.7/32'] })).toEqual([
      { permission_set_names: ['AllProductsFullAccess'], project_ids: ['proj'], condition: lock },
      { permission_set_names: ['IAMManager', 'IAMReadOnly'], organization_id: 'org-1', condition: lock },
    ]);
  });

  it('must not hand over another project: a zone served elsewhere gets DNS only', () => {
    const rules = operatorRules({ projectId: 'proj', organizationId: 'org-1', dnsProjectIds: ['proj', 'zone-proj'], cidrs: ['203.0.113.7/32'] });
    expect(rules[1]).toEqual({ permission_set_names: ['DomainsDNSFullAccess'], project_ids: ['zone-proj'], condition: lock });
    expect(rules.filter((rule) => rule.permission_set_names.includes('AllProductsFullAccess')).flatMap((rule) => rule.project_ids)).toEqual(['proj']);
  });
});

describe('setupOperatorApp', () => {
  it('provisions the operator application with a policy and a key, under the rules above', async () => {
    const result = await setupOperatorApp({ ...base, cidrs: ['203.0.113.7/32'] });

    expect(result.secretKey).toBe('op-secret');
    const [opts, config] = vi.mocked(provisionScopedKey).mock.calls[0] ?? [];
    expect(opts).toMatchObject({ slug: 'cella', mode: 'production' });
    expect(config?.suffix).toBe('operator');
    expect(config?.managePolicy).toBeUndefined();
    expect(config?.mintKey).toBeUndefined();
    expect(config?.buildRules?.({ projectId: 'proj', organizationId: 'org-1' })).toEqual(
      operatorRules({ projectId: 'proj', organizationId: 'org-1', dnsProjectIds: ['proj'], cidrs: ['203.0.113.7/32'] }),
    );
  });

  it('must not create an application before the address list is known to be valid', async () => {
    await expect(setupOperatorApp({ ...base, cidrs: [] })).rejects.toThrow(/without its condition/);
    await expect(setupOperatorApp({ ...base, cidrs: ['not-an-address'] })).rejects.toThrow(/not an IPv4 CIDR/);
    expect(provisionScopedKey).not.toHaveBeenCalled();
    expect(resolveDnsProjectIds).not.toHaveBeenCalled();
  });
});
