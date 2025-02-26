import { config } from 'config';
import { t } from 'i18next';
import type { StepItem } from '~/modules/common/stepper/types';
import { useDraftStore } from '~/store/draft';
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
  // For example, clears all draft forms
  useDraftStore.setState({ forms: {} });
};
