import { describe, expect, it } from 'vitest';
import { type IdentityPlan, identityPlanIsEmpty } from './identity';

const asDeclared: IdentityPlan = { missingApplications: [], policies: [], extraPolicies: [], observer: 'none' };

describe('identity plan', () => {
  it('is empty when every application exists, every policy and the uploads key are as declared and the observer is in place', () => {
    expect(identityPlanIsEmpty({ ...asDeclared, policies: [{ policy: 'a', change: 'none' }] })).toBe(true);
    expect(identityPlanIsEmpty({ ...asDeclared, missingApplications: ['app-staging-uploads'] })).toBe(false);
    expect(identityPlanIsEmpty({ ...asDeclared, uploadsKey: { application: 'app-staging-uploads', change: 'make', extra: [] } })).toBe(false);
    expect(identityPlanIsEmpty({ ...asDeclared, observer: 'key' })).toBe(false);
  });
});
