import { describe, expect, it } from 'vitest';
import { owedWork, owedWorkLines, type PrivilegedFootprint } from './privileged-footprint';

const footprint = (over: Partial<PrivilegedFootprint> = {}): PrivilegedFootprint => ({
  environment: 'staging',
  identities: {
    applications: ['cella-staging-vm-backend', 'cella-staging-boot'],
    policies: [
      {
        name: 'cella-vm-backend-policy',
        applicationName: 'cella-staging-vm-backend',
        description: 'd',
        rules: [{ permission_set_names: ['A'] }],
        tags: [],
      },
    ],
  },
  resources: [{ type: 'scaleway:object/bucket:Bucket', name: 'public', inputs: { name: 'cella-staging-public', cors: [{ origins: ['a'] }] } }],
  ...over,
});

describe('owedWork', () => {
  it('owes nothing when the two declare the same, whatever the order of their keys', () => {
    const head = footprint({
      resources: [{ type: 'scaleway:object/bucket:Bucket', name: 'public', inputs: { cors: [{ origins: ['a'] }], name: 'cella-staging-public' } }],
    });
    expect(owedWork(footprint(), head)).toEqual({ environment: 'staging', ownerMoment: [], apply: [] });
    expect(owedWorkLines(owedWork(footprint(), head))).toEqual(['**staging:** nothing only an operator writes changes.']);
  });

  it('owes an Owner moment for a new service: its application and its policy', () => {
    const base = footprint();
    const head = footprint({
      identities: {
        applications: [...base.identities.applications, 'cella-staging-vm-mcp'],
        policies: [
          ...base.identities.policies,
          { ...base.identities.policies[0]!, name: 'cella-vm-mcp-policy', applicationName: 'cella-staging-vm-mcp' },
        ],
      },
    });
    expect(owedWork(base, head).ownerMoment).toEqual(['+ application cella-staging-vm-mcp', '+ policy cella-vm-mcp-policy']);
  });

  it('owes an apply for a changed, a new and a removed privileged resource', () => {
    const base = footprint({
      resources: [...footprint().resources, { type: 'scaleway:domain/record:Record', name: 'old', inputs: {} }],
    });
    const head = footprint({
      resources: [
        { type: 'scaleway:object/bucket:Bucket', name: 'public', inputs: { name: 'cella-staging-public', cors: [{ origins: ['b'] }] } },
        { type: 'scaleway:secrets/secret:Secret', name: 'new', inputs: {} },
      ],
    });
    expect(owedWork(base, head).apply).toEqual([
      '- scaleway:domain/record:Record old',
      '~ scaleway:object/bucket:Bucket public',
      '+ scaleway:secrets/secret:Secret new',
    ]);
  });

  it('owes an Owner moment for a policy whose rules changed', () => {
    const base = footprint();
    const policy = { ...base.identities.policies[0]!, rules: [{ permission_set_names: ['A', 'B'] }] };
    expect(owedWork(base, footprint({ identities: { ...base.identities, policies: [policy] } })).ownerMoment).toEqual([
      '~ policy cella-vm-backend-policy',
    ]);
  });
});
