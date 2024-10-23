import { useNavigate } from '@tanstack/react-router';
import { config } from 'config';
import { useTranslation } from 'react-i18next';
import { dialog } from '~/modules/common/dialoger/state';
import { Button } from '~/modules/ui/button';

export const SkipOrganizationCreation = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();

  const onDelete = () => {
    dialog.remove(true, 'skip_org_creation');
    navigate({
      to: config.defaultRedirectPath,
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
