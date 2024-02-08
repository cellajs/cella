import { useTranslation } from 'react-i18next';
import { Button } from '~/modules/ui/button';

interface DeleteFormProps {
  onDelete: () => void;
  onCancel: () => void;
  pending: boolean;
}

export const DeleteForm = ({ onDelete, onCancel, pending }: DeleteFormProps) => {
  const { t } = useTranslation();

  return (
    <div className="flex flex-col-reverse sm:flex-row gap-2">
      <Button type="submit" variant="destructive" onClick={onDelete} loading={pending}>
        {t('action.delete')}
      </Button>
      <Button variant="secondary" aria-label="Cancel" onClick={onCancel}>
        {t('action.cancel')}
      </Button>
    </div>
  );
};
