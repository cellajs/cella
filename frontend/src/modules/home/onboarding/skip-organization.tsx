import { useTranslation } from 'react-i18next';
import { useDialoger } from '~/modules/common/dialoger/use-dialoger';
import type { OnboardingStates } from '~/modules/home/onboarding/steps';
import { Button } from '~/modules/ui/button';

interface SkipOrganizationProps {
  setOnboardingState: (newState: Exclude<OnboardingStates, 'start'>) => void;
}

/**
 * Confirmation dialog content for skipping organization creation during onboarding.
 * Marks onboarding as completed or cancels the action.
 */
export const SkipOrganization = ({ setOnboardingState }: SkipOrganizationProps) => {
  const { t } = useTranslation();

  const removeDialog = useDialoger((state) => state.remove);

  const onDelete = () => {
    removeDialog('skip-org-creation');
    setOnboardingState('completed');
  };

  const onCancel = () => {
    removeDialog('skip-org-creation');
  };

  return (
    <div className="flex gap-2 sm:flex-row">
      <Button type="submit" variant="destructive" onClick={onDelete} aria-label="Skip">
        {t('c:skip')}
      </Button>
      <Button type="reset" variant="secondary" aria-label="Cancel" onClick={onCancel}>
        {t('c:cancel')}
      </Button>
    </div>
  );
};
