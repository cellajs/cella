import { describe, expect, it } from 'vitest';
import { machinePolicyUrns, withoutMachinePolicies } from './machine-policy-state';

const urn = (type: string, name: string) => `urn:pulumi:staging::infra::${type}::${name}`;
const backendPolicy = urn('scaleway:iam/policy:Policy', 'vm-backend-policy');
const bootPolicy = urn('scaleway:iam/policy:Policy', 'vm-boot-policy');
const vm = urn('scaleway:instance/server:Server', 'vm-backend-abc');
const bucketPolicy = urn('scaleway:object/bucketPolicy:BucketPolicy', 'state-bucket-policy');

const exported = {
  version: 3,
  deployment: {
    manifest: { time: 't' },
    resources: [
      { urn: backendPolicy, type: 'scaleway:iam/policy:Policy' },
      { urn: bootPolicy, type: 'scaleway:iam/policy:Policy' },
      { urn: bucketPolicy, type: 'scaleway:object/bucketPolicy:BucketPolicy' },
      {
        urn: vm,
        type: 'scaleway:instance/server:Server',
        dependencies: [backendPolicy, bootPolicy, bucketPolicy],
        propertyDependencies: { cloudInit: [bootPolicy, bucketPolicy] },
      },
    ],
  },
};

describe('machinePolicyUrns', () => {
  it('finds the machine policies, and no other policy', () => {
    expect(machinePolicyUrns(exported)).toEqual([backendPolicy, bootPolicy]);
  });

  it('refuses a document that is no stack export', () => {
    expect(() => machinePolicyUrns({})).toThrow('not a pulumi stack export');
  });
});

describe('withoutMachinePolicies', () => {
  it('drops the machine policies and every mention of them, and keeps the rest as exported', () => {
    const next = withoutMachinePolicies(exported) as typeof exported;
    expect(next.version).toBe(3);
    expect(next.deployment.manifest).toEqual({ time: 't' });
    expect(next.deployment.resources.map((resource) => resource.urn)).toEqual([bucketPolicy, vm]);
    const machine = next.deployment.resources[1] as (typeof exported.deployment.resources)[3];
    expect(machine.dependencies).toEqual([bucketPolicy]);
    expect(machine.propertyDependencies).toEqual({ cloudInit: [bucketPolicy] });
  });

  it('leaves a state without machine policies as it is', () => {
    const clean = withoutMachinePolicies(withoutMachinePolicies(exported));
    expect(clean).toEqual(withoutMachinePolicies(exported));
    expect(machinePolicyUrns(clean)).toEqual([]);
  });
});
