import { TrashIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { TKey } from '~/lib/i18n-locales';
import { ConfirmForm, type ConfirmFormProps } from '~/modules/common/confirm-form';

interface DeleteFormProps extends Pick<ConfirmFormProps, 'onCancel' | 'pending' | 'icon' | 'cancelLabel' | 'allowOffline'> {
  onDelete: () => void;
  /** E.g. `c:organization`: the act reads "Delete organization". */
  resource?: TKey;
  /** For the plural of `resource`. */
  count?: number;
  /** Interpolated with `resource`. */
  label?: TKey;
}

/** A delete confirmation whose act names what goes: "Delete organization". */
export function DeleteForm({
  onDelete,
  resource,
  count,
  label = resource ? 'c:delete_resource' : 'c:delete',
  icon = TrashIcon,
  ...props
}: DeleteFormProps) {
  const { t } = useTranslation();

  return (
    <ConfirmForm
      variant="destructive"
      label={t(label, { resource: resource && t(resource, { count }) })}
      icon={icon}
      onConfirm={onDelete}
      {...props}
    />
  );
}
