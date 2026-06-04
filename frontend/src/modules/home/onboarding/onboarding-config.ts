import i18n from 'i18next';
import type { StepItem } from '~/modules/common/stepper/types';

/**
 * Define the onboarding steps
 */
export const onboardingSteps: StepItem[] = [
  { id: 'profile', label: i18n.t('c:tune_profile'), optional: true },
  {
    id: 'organization',
    label: i18n.t('c:create_resource', { resource: i18n.t('c:organization').toLowerCase() }),
    optional: true,
  },
  { id: 'invitation', label: i18n.t('c:invite_others'), optional: true },
];

// Add the options you want to execute when onboarding is finished
export const onboardingFinishCallback = () => {};
