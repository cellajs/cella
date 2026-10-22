import { onlineManager } from '@tanstack/react-query';
import type { CallbackArgs } from '~/modules/common/data-table/types';
import { DeleteForm } from '~/modules/common/delete-form';
import { useDialoger } from '~/modules/common/dialoger/use-dialoger';
import { toastOffline } from '~/modules/common/toaster/toaster';

export interface DeleteItemsProps<TItem, TVariables> {
  items: TItem[];
  /** The delete mutation, created by the caller inside the dropdowner or dialog content that renders this form. */
  mutation: { mutate: (variables: TVariables, options?: { onSuccess: () => void }) => void; isPending: boolean };
  toVariables: (items: TItem[]) => TVariables;
  dialog?: boolean;
  callback?: (args: CallbackArgs<TItem[]>) => void;
  /** Warn and send nothing while offline. */
  onlineOnly?: boolean;
  /** Report to `callback` before closing the dialog; by default the dialog closes first. */
  callbackFirst?: boolean;
  /** Replaces the default cancel, which settles `callback` and closes a dialog. */
  onCancel?: () => void;
  /** For a delete that is optimistic and queues offline: finish right after `mutate`, and let the press through offline. */
  optimistic?: boolean;
}

/** Delete confirmation for a list of items: on success it closes a dialog and reports the items to `callback`. */
export function DeleteItems<TItem, TVariables>(props: DeleteItemsProps<TItem, TVariables>) {
  const { items, callback, callbackFirst, mutation } = props;
  const removeDialog = useDialoger((state) => state.remove);

  const finish = (args: CallbackArgs<TItem[]>) => {
    if (callbackFirst) callback?.(args);
    if (props.dialog) removeDialog();
    if (!callbackFirst) callback?.(args);
  };

  const handleDelete = () => {
    if (props.onlineOnly && !onlineManager.isOnline()) return toastOffline();
    const succeed = () => finish({ data: items, status: 'success' });
    mutation.mutate(props.toVariables(items), props.optimistic ? undefined : { onSuccess: succeed });
    if (props.optimistic) succeed();
  };

  const handleCancel = props.onCancel ?? (() => finish({ status: 'settle' }));
  return <DeleteForm allowOfflineDelete={props.optimistic} onDelete={handleDelete} onCancel={handleCancel} pending={mutation.isPending} />;
}
