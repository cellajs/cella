import i18n from 'i18next';
import type { StepItem } from '~/modules/common/stepper/types';

/** What onboarding knows about the user when it picks steps. */
export interface OnboardingContext {
  hasOrganizations: boolean;
  hasInvitations: boolean;
}

interface OnboardingStep extends StepItem {
  when: (ctx: OnboardingContext) => boolean;
}

/** Someone with no organization and no invitation waiting: the one who sets up an organization for others. */
const isFounder = ({ hasOrganizations, hasInvitations }: OnboardingContext) => !hasOrganizations && !hasInvitations;

/**
 * The steps that fit this user: an invited user answers invitations instead of creating an organization.
 * Call at render time: the labels use `i18n.t`, which returns undefined until i18next has loaded its namespaces.
 */
export function getOnboardingSteps(ctx: OnboardingContext): StepItem[] {
  const steps: OnboardingStep[] = [
    {
      id: 'invitations',
      label: i18n.t('c:pending_invitations'),
      optional: true,
      when: ({ hasInvitations }) => hasInvitations,
    },
    { id: 'profile', label: i18n.t('c:tune_profile'), optional: true, when: () => true },
    {
      id: 'organization',
      label: i18n.t('c:create_resource', { resource: i18n.t('c:organization').toLowerCase() }),
      optional: true,
      when: isFounder,
    },
    { id: 'invitation', label: i18n.t('c:invite_others'), optional: true, when: isFounder },
  ];

  return steps.filter(({ when }) => when(ctx)).map(({ when: _when, ...step }) => step);
}
