import { describe, expect, it } from 'vitest';
import { identityPlanIsEmpty, identityPlanLines } from './identity';

const names = { observer: 'app-observer' };

describe('identity plan', () => {
  it('is empty when every application exists, every policy is as declared and the observer is in place', () => {
    expect(
      identityPlanIsEmpty({ missingApplications: [], policies: [{ policy: 'a', change: 'none' }], keys: [], extraPolicies: [], observer: 'none' }),
    ).toBe(true);
    expect(identityPlanIsEmpty({ missingApplications: ['app-vm-oauth'], policies: [], keys: [], extraPolicies: [], observer: 'none' })).toBe(false);
    expect(
      identityPlanIsEmpty({ missingApplications: [], policies: [{ policy: 'a', change: 'update' }], keys: [], extraPolicies: [], observer: 'none' }),
    ).toBe(false);
    expect(identityPlanIsEmpty({ missingApplications: [], policies: [], keys: [], extraPolicies: [], observer: 'key' })).toBe(false);
  });

  it('must not delete the retired admin application while a bucket policy may still need it', () => {
    const kept = { name: 'app-staging-admin', id: 'a1', removable: false };
    expect(identityPlanIsEmpty({ missingApplications: [], policies: [], keys: [], extraPolicies: [], observer: 'none', retiredAdmin: kept })).toBe(
      true,
    );
    expect(
      identityPlanLines({ missingApplications: [], policies: [], keys: [], extraPolicies: [], observer: 'none', retiredAdmin: kept }, names),
    ).toEqual([]);
    const removable = { ...kept, removable: true };
    expect(
      identityPlanIsEmpty({ missingApplications: [], policies: [], keys: [], extraPolicies: [], observer: 'none', retiredAdmin: removable }),
    ).toBe(false);
  });

  it('lists what changes, and leaves out what is as declared', () => {
    expect(
      identityPlanLines(
        {
          missingApplications: ['app-staging-vm-oauth'],
          policies: [
            { policy: 'app-vm-backend-policy', change: 'update' },
            { policy: 'app-vm-boot-policy', change: 'none' },
            { policy: 'app-vm-oauth-policy', change: 'missing-application' },
            { policy: 'app-observer-policy', change: 'update' },
          ],
          keys: [
            { principal: 'cdc', application: 'app-staging-vm-cdc', change: 'make', extra: ['SCWOLD'] },
            { principal: 'boot', application: 'app-staging-boot', change: 'prune', extra: ['SCWX1', 'SCWX2'] },
            { principal: 'jobs', application: 'app-staging-vm-jobs', change: 'none', extra: [] },
          ],
          extraPolicies: [{ id: 'p1', name: 'app-vm-cdc-policy', application: 'app-staging-vm-cdc' }],
          observer: 'key',
          retiredAdmin: { name: 'app-staging-admin', id: 'a1', removable: true },
        },
        names,
      ),
    ).toEqual([
      'application app-staging-vm-oauth: to create',
      'policy app-vm-backend-policy: rules to replace',
      'policy app-vm-oauth-policy: to create once its application exists',
      'policy app-observer-policy: rules to replace',
      'standing key of app-staging-vm-cdc: to make, its 1 other key(s) deleted',
      'standing key of app-staging-boot: 2 key(s) beside it to delete',
      'policy app-vm-cdc-policy on app-staging-vm-cdc: beside the declared one, to delete',
      'observer app-observer: a key for this machine',
      'application app-staging-admin: retired, to delete with its keys and its custody secret',
    ]);
  });
});
