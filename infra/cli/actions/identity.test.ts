import { describe, expect, it } from 'vitest';
import { identityPlanIsEmpty, identityPlanLines } from './identity';

const names = { observer: 'app-observer' };

describe('identity plan', () => {
  it('is empty when every application exists, every policy is as declared and the observer is in place', () => {
    expect(identityPlanIsEmpty({ missingApplications: [], policies: [{ policy: 'a', change: 'none' }], observer: 'none' })).toBe(true);
    expect(identityPlanIsEmpty({ missingApplications: ['app-vm-oauth'], policies: [], observer: 'none' })).toBe(false);
    expect(identityPlanIsEmpty({ missingApplications: [], policies: [{ policy: 'a', change: 'update' }], observer: 'none' })).toBe(false);
    expect(identityPlanIsEmpty({ missingApplications: [], policies: [], observer: 'key' })).toBe(false);
  });

  it('must not delete the retired admin application while a bucket policy may still need it', () => {
    const kept = { name: 'app-staging-admin', id: 'a1', removable: false };
    expect(identityPlanIsEmpty({ missingApplications: [], policies: [], observer: 'none', retiredAdmin: kept })).toBe(true);
    expect(identityPlanLines({ missingApplications: [], policies: [], observer: 'none', retiredAdmin: kept }, names)).toEqual([]);
    const removable = { ...kept, removable: true };
    expect(identityPlanIsEmpty({ missingApplications: [], policies: [], observer: 'none', retiredAdmin: removable })).toBe(false);
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
          ],
          observer: 'reach',
          retiredAdmin: { name: 'app-staging-admin', id: 'a1', removable: true },
        },
        names,
      ),
    ).toEqual([
      'application app-staging-vm-oauth: to create',
      'policy app-vm-backend-policy: rules to replace',
      'policy app-vm-oauth-policy: to create once its application exists',
      'observer app-observer: to reach this environment, and its key written to this machine',
      'application app-staging-admin: retired, to delete with its keys and its custody secret',
    ]);
  });
});
