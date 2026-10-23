import { TrashIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { TKey } from '~/lib/i18n-locales';
import { SubmitButton } from '~/modules/common/form-fields/submit-button';
import type { IconComponent } from '~/modules/common/icons/types';
import { Button } from '~/modules/ui/button';

interface DeleteFormProps {
  onDelete: () => void;
  onCancel: () => void;
  pending: boolean;
  allowOfflineDelete?: boolean;
  /** The destructive button's label, `c:delete` by default. */
  label?: TKey;
  /** A trash can by default. */
  icon?: IconComponent;
}

export function DeleteForm({ onDelete, onCancel, pending, allowOfflineDelete = false, label = 'c:delete', icon: Icon = TrashIcon }: DeleteFormProps) {
  const { t } = useTranslation();

  return (
    <div className="flex flex-col gap-2 sm:flex-row">
      <SubmitButton variant="destructive" icon={<Icon />} allowOfflineDelete={allowOfflineDelete} onClick={onDelete} loading={pending}>
        {t(label)}
      </SubmitButton>
      <Button type="reset" variant="secondary" data-autofocus onClick={onCancel}>
        {t('c:cancel')}
      </Button>
    </div>
  );
}
