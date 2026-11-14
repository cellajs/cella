import { describe, expect, it } from 'vitest';
import { urnsOf, withoutUrns } from './stack-export';

const urn = (type: string, name: string) => `urn:pulumi:staging::infra::${type}::${name}`;
const uploadsPolicy = urn('scaleway:object/bucketPolicy:BucketPolicy', 'public-uploads-policy');
const bootDiagPolicy = urn('scaleway:object/bucketPolicy:BucketPolicy', 'boot-diag-policy');
const statePolicy = urn('scaleway:object/bucketPolicy:BucketPolicy', 'state-bucket-policy');
const job = urn('scaleway:jobs/definition:Definition', 'main-job');

const exported = {
  version: 3,
  deployment: {
    manifest: { time: 't' },
    resources: [
      { urn: uploadsPolicy },
      { urn: bootDiagPolicy },
      { urn: statePolicy },
      { urn: job, dependencies: [uploadsPolicy, bootDiagPolicy, statePolicy], propertyDependencies: { env: [bootDiagPolicy, statePolicy] } },
    ],
  },
};

describe('withoutUrns', () => {
  it('drops the resources and every mention of them, and keeps the rest as exported: an import refuses a dependency the state lacks', () => {
    const next = withoutUrns(exported, [uploadsPolicy, bootDiagPolicy]) as typeof exported;
    expect(next.version).toBe(3);
    expect(next.deployment.manifest).toEqual({ time: 't' });
    expect(urnsOf(next)).toEqual([statePolicy, job]);
    const definition = next.deployment.resources[1] as (typeof exported.deployment.resources)[3];
    expect(definition.dependencies).toEqual([statePolicy]);
    expect(definition.propertyDependencies).toEqual({ env: [statePolicy] });
  });

  it('refuses a document that is no stack export', () => {
    expect(() => withoutUrns({}, [])).toThrow('not a pulumi stack export');
  });
});
