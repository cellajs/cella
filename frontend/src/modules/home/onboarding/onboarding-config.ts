import { config } from 'config';
import { t } from 'i18next';
import type { StepItem } from '~/modules/common/stepper/types';
import { useNavigationStore } from '~/store/navigation';
import { useUserStore } from '~/store/user';

export const onDefaultBoardingSteps: StepItem[] = [
  {
    id: 'profile',
    label: 'Tune your profile',
    optional: true,
    description: t('common:onboarding_step1', { name: useUserStore.getState().user.name }),
  },
  { id: 'organization', label: 'Create organization', optional: true, description: t('common:onboarding_step2') },
  {
    id: 'invitation',
    label: 'Invite others',
    optional: true,
    description: t('common:onboarding_step3', { appName: config.name }),
  },
];

// Add the options you want to execute when onboarding is finished
export const onBoardingFinishCallback = () => {
  // For example, in this callback, the onboarding state is set to 'finished' for the current user
  useNavigationStore.setState({ finishedOnboarding: true });
};
