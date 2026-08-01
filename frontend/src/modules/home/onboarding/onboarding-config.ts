import i18n from 'i18next';
import type { StepItem } from '~/modules/common/stepper/types';

/**
 * Ordered onboarding steps shown by the welcome stepper. All steps are optional
 * so users can skip ahead at any point.
 *
 * Built lazily (a function, not a module-scope const) because the labels call
 * `i18n.t(...)`: evaluating those at module load — before i18next has
 * initialized its namespaces — returns `undefined`, and
 * `i18n.t('c:organization').toLowerCase()` then throws and white-screens the
 * app. Call this at render time, when i18next is ready.
 */
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
