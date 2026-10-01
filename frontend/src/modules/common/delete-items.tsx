import { onlineManager } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import type { CallbackArgs } from '~/modules/common/data-table/types';
import { DeleteForm } from '~/modules/common/delete-form';
import { useDialoger } from '~/modules/common/dialoger/use-dialoger';
import { toaster } from '~/modules/common/toaster/toaster';

export interface DeleteItemsProps<TItem, TVariables> {
  items: TItem[];
  /** The delete mutation, created by the caller inside the dropdowner or dialog content that renders this form. */
  mutation: { mutate: (variables: TVariables, options: { onSuccess: () => void }) => void; isPending: boolean };
  toVariables: (items: TItem[]) => TVariables;
  dialog?: boolean;
  callback?: (args: CallbackArgs<TItem[]>) => void;
  /** Warn and send nothing while offline. */
  onlineOnly?: boolean;
  /** Report to `callback` before closing the dialog; by default the dialog closes first. */
  callbackFirst?: boolean;
  /** Replaces the default cancel, which settles `callback` and closes a dialog. */
  onCancel?: () => void;
}

/** Delete confirmation for a list of items: on success it closes a dialog and reports the items to `callback`. */
export function DeleteItems<TItem, TVariables>(props: DeleteItemsProps<TItem, TVariables>) {
  const { items, callback, callbackFirst, mutation } = props;
  const { t } = useTranslation();
  const removeDialog = useDialoger((state) => state.remove);

  const finish = (args: CallbackArgs<TItem[]>) => {
    if (callbackFirst) callback?.(args);
    if (props.dialog) removeDialog();
    if (!callbackFirst) callback?.(args);
  };

  const onDelete = () => {
    if (props.onlineOnly && !onlineManager.isOnline()) return toaster.warning(t('c:action.offline.text'));
    mutation.mutate(props.toVariables(items), { onSuccess: () => finish({ data: items, status: 'success' }) });
  };

  const onCancel = props.onCancel ?? (() => finish({ status: 'settle' }));
  return <DeleteForm onDelete={onDelete} onCancel={onCancel} pending={mutation.isPending} />;
}
