import { useTranslation } from 'react-i18next';
import { useDialoger } from '~/modules/common/dialoger/use-dialoger';
import { Button } from '~/modules/ui/button';

export const skipOrganizationDialogId = 'skip-org-creation';

interface SkipOrganizationProps {
  onComplete: () => void;
}

export function SkipOrganization({ onComplete }: SkipOrganizationProps) {
  const { t } = useTranslation();

  const removeDialog = useDialoger((state) => state.remove);

  const skip = () => {
    removeDialog(skipOrganizationDialogId);
    onComplete();
  };

  const cancel = () => removeDialog(skipOrganizationDialogId);

  return (
    <div className="flex flex-col gap-2 sm:flex-row">
      <Button type="submit" variant="destructive" onClick={skip}>
        {t('c:skip')}
      </Button>
      <Button type="reset" variant="secondary" onClick={cancel}>
        {t('c:cancel')}
      </Button>
    </div>
  );
}
