import { describe, expect, it } from 'vitest';
import { identityPlanIsEmpty, identityPlanLines } from './identity';

describe('identity plan', () => {
  it('is empty when every application exists and every policy is as declared', () => {
    expect(identityPlanIsEmpty({ missingApplications: [], policies: [{ policy: 'a', change: 'none' }] })).toBe(true);
    expect(identityPlanIsEmpty({ missingApplications: ['app-vm-oauth'], policies: [] })).toBe(false);
    expect(identityPlanIsEmpty({ missingApplications: [], policies: [{ policy: 'a', change: 'update' }] })).toBe(false);
  });

  it('lists what changes, and leaves out what is as declared', () => {
    expect(
      identityPlanLines({
        missingApplications: ['app-staging-vm-oauth'],
        policies: [
          { policy: 'app-vm-backend-policy', change: 'update' },
          { policy: 'app-vm-boot-policy', change: 'none' },
          { policy: 'app-vm-oauth-policy', change: 'missing-application' },
        ],
      }),
    ).toEqual([
      'application app-staging-vm-oauth: to create',
      'policy app-vm-backend-policy: rules to replace',
      'policy app-vm-oauth-policy: to create once its application exists',
    ]);
  });
});
