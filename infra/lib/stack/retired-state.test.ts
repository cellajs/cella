import { describe, expect, it } from 'vitest';
import { isRetired, retiredUrns, withoutUrns } from './retired-state';

const urn = (type: string, name: string) => `urn:pulumi:staging::infra::${type}::${name}`;
const backendPolicy = urn('scaleway:iam/policy:Policy', 'vm-backend-policy');
const bootPolicy = urn('scaleway:iam/policy:Policy', 'vm-boot-policy');
const vm = urn('scaleway:instance/server:Server', 'vm-backend-abc');
const bucketPolicy = urn('scaleway:object/bucketPolicy:BucketPolicy', 'state-bucket-policy');
const cookieVersion = urn('scaleway:secrets/version:Version', 'secret-version-cookie-secret@backend');
const cookieRandom = urn('random:index/randomPassword:RandomPassword', 'generated-cookie-secret');
const caVersion = urn('scaleway:secrets/version:Version', 'secret-version-database-ssl-ca@backend');
const generated = new Set(['cookie-secret']);

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

describe('retiredUrns', () => {
  it('finds the machine policies, and no other policy', () => {
    expect(retiredUrns(exported, generated)).toEqual([backendPolicy, bootPolicy]);
  });

  it('finds the versions and random values of generated secrets, under the old name and the copy name alike', () => {
    expect(isRetired(cookieVersion, generated)).toBe(true);
    expect(isRetired(urn('scaleway:secrets/version:Version', 'secret-version-cookie-secret'), generated)).toBe(true);
    expect(isRetired(cookieRandom, generated)).toBe(true);
  });

  it('must not take out a version the program still writes: deleting a version deletes its value', () => {
    expect(isRetired(caVersion, generated)).toBe(false);
  });

  it('refuses a document that is no stack export', () => {
    expect(() => retiredUrns({}, generated)).toThrow('not a pulumi stack export');
  });
});

describe('withoutUrns', () => {
  it('drops the resources and every mention of them, and keeps the rest as exported', () => {
    const next = withoutUrns(exported, [backendPolicy, bootPolicy]) as typeof exported;
    expect(next.version).toBe(3);
    expect(next.deployment.manifest).toEqual({ time: 't' });
    expect(next.deployment.resources.map((resource) => resource.urn)).toEqual([bucketPolicy, vm]);
    const machine = next.deployment.resources[1] as (typeof exported.deployment.resources)[3];
    expect(machine.dependencies).toEqual([bucketPolicy]);
    expect(machine.propertyDependencies).toEqual({ cloudInit: [bucketPolicy] });
  });

  it('leaves a state without them as it is', () => {
    const once = withoutUrns(exported, retiredUrns(exported, generated));
    expect(withoutUrns(once, retiredUrns(once, generated))).toEqual(once);
    expect(retiredUrns(once, generated)).toEqual([]);
  });
});
