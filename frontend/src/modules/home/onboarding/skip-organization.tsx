import { useTranslation } from 'react-i18next';
import { useDialoger } from '~/modules/common/dialoger/use-dialoger';
import type { OnboardingStates } from '~/modules/home/onboarding/steps';
import { Button } from '~/modules/ui/button';

export const SkipOrganization = ({
  setOnboardingState,
}: {
  setOnboardingState: (newState: Exclude<OnboardingStates, 'start'>) => void;
}) => {
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
    <div className="flex sm:flex-row gap-2">
      <Button type="submit" variant="destructive" onClick={onDelete} aria-label="Skip">
        {t('common:skip')}
      </Button>
      <Button type="reset" variant="secondary" aria-label="Cancel" onClick={onCancel}>
        {t('common:cancel')}
      </Button>
    </div>
  );
};
