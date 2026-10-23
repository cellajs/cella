import { TrashIcon, XIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { TKey } from '~/lib/i18n-locales';
import { useInDropdownerDrawer } from '~/modules/common/dropdowner/drawer';
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
  /** `c:cancel` by default. */
  cancelLabel?: TKey;
  /** A trash can by default. */
  icon?: IconComponent;
}

/** A destructive choice and its way out: two buttons, or two action-sheet rows in the dropdowner's drawer. */
export function DeleteForm({
  onDelete,
  onCancel,
  pending,
  allowOfflineDelete = false,
  label = 'c:delete',
  cancelLabel = 'c:cancel',
  icon: Icon = TrashIcon,
}: DeleteFormProps) {
  const { t } = useTranslation();
  const inDrawer = useInDropdownerDrawer();

  return (
    <div className={inDrawer ? 'flex flex-col' : 'flex flex-col gap-2 sm:flex-row'}>
      <SubmitButton
        variant={inDrawer ? 'row' : 'destructive'}
        className={inDrawer ? 'text-destructive' : undefined}
        icon={<Icon />}
        allowOfflineDelete={allowOfflineDelete}
        onClick={onDelete}
        loading={pending}
      >
        {t(label)}
      </SubmitButton>
      <Button type="reset" variant={inDrawer ? 'row' : 'secondary'} data-autofocus onClick={onCancel}>
        {inDrawer && <XIcon />}
        {t(cancelLabel)}
      </Button>
    </div>
  );
}
