import type { StepItem } from '~/modules/common/stepper/types';
import { useDraftStore } from '~/store/draft';

/**
 * Define the onboarding steps
 */
export const onboardingSteps: StepItem[] = [
  { id: 'profile', label: 'Tune your profile', optional: true },
  { id: 'organization', label: 'Create organization', optional: true },
  { id: 'invitation', label: 'Invite others', optional: true },
];

// Add the options you want to execute when onboarding is finished
export const onboardingFinishCallback = () => {
  // For example, clears all draft forms
  useDraftStore.setState({ forms: {} });
};
