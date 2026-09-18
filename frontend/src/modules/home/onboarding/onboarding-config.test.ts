import { describe, expect, it, vi } from 'vitest';

// Labels are not under test, and i18next has no namespaces loaded here.
vi.mock('i18next', () => ({ default: { t: (key: string) => key } }));

import { getOnboardingSteps } from '~/modules/home/onboarding/onboarding-config';

const stepIds = (ctx: Parameters<typeof getOnboardingSteps>[0]) => getOnboardingSteps(ctx).map(({ id }) => id);

describe('getOnboardingSteps', () => {
  it('gives a user with no organization and no invitation the founder steps', () => {
    expect(stepIds({ hasOrganizations: false, hasInvitations: false })).toEqual([
      'profile',
      'organization',
      'invitation',
    ]);
  });

  it('lets an invited user answer invitations instead of creating an organization', () => {
    expect(stepIds({ hasOrganizations: false, hasInvitations: true })).toEqual(['invitations', 'profile']);
  });

  it('keeps the invitations step for a member with another invitation waiting', () => {
    expect(stepIds({ hasOrganizations: true, hasInvitations: true })).toEqual(['invitations', 'profile']);
  });

  it('gives a member without invitations the profile step only', () => {
    expect(stepIds({ hasOrganizations: true, hasInvitations: false })).toEqual(['profile']);
  });
});
