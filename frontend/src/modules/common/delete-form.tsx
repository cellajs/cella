import { TrashIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { SubmitButton } from '~/modules/common/form-fields/submit-button';
import { Button } from '~/modules/ui/button';

interface DeleteFormProps {
  onDelete: () => void;
  onCancel: () => void;
  pending: boolean;
  allowOfflineDelete?: boolean;
}

export function DeleteForm({ onDelete, onCancel, pending, allowOfflineDelete = false }: DeleteFormProps) {
  const { t } = useTranslation();

  return (
    <div className="flex flex-col gap-2 sm:flex-row">
      <SubmitButton variant="destructive" icon={<TrashIcon />} allowOfflineDelete={allowOfflineDelete} onClick={onDelete} loading={pending}>
        {t('c:delete')}
      </SubmitButton>
      <Button type="reset" variant="secondary" data-autofocus onClick={onCancel}>
        {t('c:cancel')}
      </Button>
    </div>
  );
}
