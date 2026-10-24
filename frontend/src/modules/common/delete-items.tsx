import { onlineManager } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import type { TKey } from '~/lib/i18n-locales';
import type { CallbackArgs } from '~/modules/common/data-table/types';
import { DeleteForm } from '~/modules/common/delete-form';
import { useOverlayClose } from '~/modules/common/overlay-close';
import { toaster, toastOffline } from '~/modules/common/toaster/toaster';

export interface DeleteItemsProps<TItem, TVariables> {
  items: TItem[];
  /** The delete mutation, created by the caller inside the dropdowner or dialog content that renders this form. */
  mutation: { mutate: (variables: TVariables, options?: { onSuccess: () => void }) => void; isPending: boolean };
  toVariables: (items: TItem[]) => TVariables;
  callback?: (args: CallbackArgs<TItem[]>) => void;
  /** Names the items in a success toast, e.g. `c:project`. */
  resource?: TKey;
  /** Warn and send nothing while offline. */
  onlineOnly?: boolean;
  /** Report to `callback` before closing; by default the confirmation closes first. */
  callbackFirst?: boolean;
  /** Replaces the default cancel, which steps back out of the confirmation and settles `callback`. */
  onCancel?: () => void;
  /** For a delete that is optimistic and queues offline: finish right after `mutate`, and let the press through offline. */
  optimistic?: boolean;
}

/** Delete confirmation for a list of items: on success it closes its dropdown or dialog and reports the items to `callback`. */
export function DeleteItems<TItem, TVariables>(props: DeleteItemsProps<TItem, TVariables>) {
  const { items, callback, callbackFirst, mutation, resource } = props;
  const { t } = useTranslation();
  const overlay = useOverlayClose();

  const finish = (args: CallbackArgs<TItem[]>) => {
    if (callbackFirst) callback?.(args);
    overlay?.close();
    if (!callbackFirst) callback?.(args);
  };

  const handleDelete = () => {
    if (props.onlineOnly && !onlineManager.isOnline()) return toastOffline();
    const succeed = () => {
      if (resource) {
        const count = items.length;
        toaster.success(
          count === 1
            ? t('c:success.delete_resource', { resource: t(resource) })
            : t('c:success.delete_counted_resources', { count, resources: t(resource, { count }).toLowerCase() }),
        );
      }
      finish({ data: items, status: 'success' });
    };
    mutation.mutate(props.toVariables(items), props.optimistic ? undefined : { onSuccess: succeed });
    if (props.optimistic) succeed();
  };

  const handleCancel =
    props.onCancel ??
    (() => {
      overlay?.back();
      callback?.({ status: 'settle' });
    });

  return <DeleteForm allowOfflineDelete={props.optimistic} onDelete={handleDelete} onCancel={handleCancel} pending={mutation.isPending} />;
}
