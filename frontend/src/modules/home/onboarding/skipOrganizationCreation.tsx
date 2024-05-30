import { useNavigate } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { dialog } from '~/modules/common/dialoger/state';
import { Button } from '~/modules/ui/button';
import { useAlertStore } from '~/store/alert';

export const SkipOrganizationCreation = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();

  const { alertsSeen, resetAlertSeen } = useAlertStore();

  const onDelete = () => {
    resetAlertSeen(alertsSeen.filter((el) => el !== 'skip_org_creation'));
    dialog.remove(true, 'skip_org_creation');
    navigate({
      to: '/home',
      replace: true,
    });
  };
  const onCancel = () => {
    dialog.remove(true, 'skip_org_creation');
  };

  return (
    <div className="flex flex-col-reverse sm:flex-row gap-2">
      <Button type="submit" variant="destructive" onClick={onDelete} aria-label="Skip">
        {t('common:skip')}
      </Button>
      <Button type="reset" variant="secondary" aria-label="Cancel" onClick={onCancel}>
        {t('common:cancel')}
      </Button>
    </div>
  );
};
