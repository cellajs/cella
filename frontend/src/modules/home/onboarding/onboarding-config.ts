import i18n from 'i18next';
import type { StepItem } from '~/modules/common/stepper/types';

/** Call at render time: the labels use `i18n.t`, which returns undefined until i18next has loaded its namespaces. */
export function getOnboardingSteps(): StepItem[] {
  return [
    { id: 'profile', label: i18n.t('c:tune_profile'), optional: true },
    {
      id: 'organization',
      label: i18n.t('c:create_resource', { resource: i18n.t('c:organization').toLowerCase() }),
      optional: true,
    },
    { id: 'invitation', label: i18n.t('c:invite_others'), optional: true },
  ];
}
