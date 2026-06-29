import { TrashIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button, SubmitButton } from '~/modules/ui/button';

interface DeleteFormProps {
  onDelete: () => void;
  onCancel: () => void;
  pending: boolean;
  allowOfflineDelete?: boolean;
}

export const DeleteForm = ({ onDelete, onCancel, pending, allowOfflineDelete = false }: DeleteFormProps) => {
  const { t } = useTranslation();

  return (
    <div className="flex flex-col gap-2 sm:flex-row">
      <SubmitButton
        variant="destructive"
        icon={<TrashIcon size={16} />}
        allowOfflineDelete={allowOfflineDelete}
        onClick={onDelete}
        aria-label="Delete"
        loading={pending}
      >
        {t('c:delete')}
      </SubmitButton>
      <Button type="reset" variant="secondary" aria-label="Cancel" onClick={onCancel}>
        {t('c:cancel')}
      </Button>
    </div>
  );
};
