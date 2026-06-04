import i18n from 'i18next';
import type { StepItem } from '~/modules/common/stepper/types';

/**
 * Ordered list of onboarding steps shown by the welcome stepper.
 * All steps are optional so users can skip ahead at any point.
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
