import { Trash } from 'lucide-react';
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
    <div className="flex flex-col sm:flex-row gap-2">
      <SubmitButton variant="destructive" allowOfflineDelete={allowOfflineDelete} onClick={onDelete} aria-label="Delete" loading={pending}>
        <Trash size={16} className="mr-1" />
        {t('common:delete')}
      </SubmitButton>
      <Button type="reset" variant="secondary" aria-label="Cancel" onClick={onCancel}>
        {t('common:cancel')}
      </Button>
    </div>
  );
};
