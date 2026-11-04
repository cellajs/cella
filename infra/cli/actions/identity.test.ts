import { describe, expect, it } from 'vitest';
import { type IdentityPlan, identityPlanIsEmpty, identityPlanLines } from './identity';

const names = { observer: 'app-observer' };
const asDeclared: IdentityPlan = { missingApplications: [], policies: [], extraPolicies: [], retiredApplications: [], observer: 'none' };

describe('identity plan', () => {
  it('is empty when every application exists, every policy and the uploads key are as declared and the observer is in place', () => {
    expect(identityPlanIsEmpty({ ...asDeclared, policies: [{ policy: 'a', change: 'none' }] })).toBe(true);
    expect(identityPlanIsEmpty({ ...asDeclared, missingApplications: ['app-staging-uploads'] })).toBe(false);
    expect(identityPlanIsEmpty({ ...asDeclared, uploadsKey: { application: 'app-staging-uploads', change: 'make', extra: [] } })).toBe(false);
    expect(identityPlanIsEmpty({ ...asDeclared, retiredApplications: [{ id: 'v1', name: 'app-staging-vm-backend' }] })).toBe(false);
    expect(identityPlanIsEmpty({ ...asDeclared, observer: 'key' })).toBe(false);
  });

  it('must not delete the retired admin application while a bucket policy may still need it', () => {
    const kept = { name: 'app-staging-admin', id: 'a1', removable: false };
    expect(identityPlanIsEmpty({ ...asDeclared, retiredAdmin: kept })).toBe(true);
    expect(identityPlanLines({ ...asDeclared, retiredAdmin: kept }, names)).toEqual([]);
    expect(identityPlanIsEmpty({ ...asDeclared, retiredAdmin: { ...kept, removable: true } })).toBe(false);
  });
});
