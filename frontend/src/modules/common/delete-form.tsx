import { TrashIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { TKey } from '~/lib/i18n-locales';
import { ConfirmForm, type ConfirmFormProps } from '~/modules/common/confirm-form';

interface DeleteFormProps extends Pick<ConfirmFormProps, 'onCancel' | 'pending' | 'icon' | 'cancelLabel'> {
  onDelete: () => void;
  allowOfflineDelete?: boolean;
  /** What goes, e.g. `c:organization`: the act reads "Delete organization". */
  resource?: TKey;
  /** How many `resource`s go, for its plural. */
  count?: number;
  /** The act, interpolated with `resource`: `c:delete_resource`, or `c:delete` without a resource. */
  label?: TKey;
}

/** A delete confirmation whose act names what goes, "Delete organization"; a trash can unless `icon` says otherwise. */
export function DeleteForm({
  onDelete,
  allowOfflineDelete = false,
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
      allowOffline={allowOfflineDelete}
      onConfirm={onDelete}
      {...props}
    />
  );
}
