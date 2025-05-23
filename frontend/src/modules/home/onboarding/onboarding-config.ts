import i18n from 'i18next';
import type { StepItem } from '~/modules/common/stepper/types';
import { useDraftStore } from '~/store/draft';

/**
 * Define the onboarding steps
 */
export const onboardingSteps: StepItem[] = [
  { id: 'profile', label: i18n.t('common:tune_profile'), optional: true },
  { id: 'organization', label: i18n.t('common:create_resource', { resource: i18n.t('common:organization').toLowerCase() }), optional: true },
  { id: 'invitation', label: i18n.t('common:invite_others'), optional: true },
];

// Add the options you want to execute when onboarding is finished
export const onboardingFinishCallback = () => {
  // For example, clears all draft forms
  useDraftStore.setState({ forms: {} });
};
