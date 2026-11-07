import { onlineManager } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import type { TKey } from '~/lib/i18n-locales';
import type { CallbackArgs } from '~/modules/common/data-table/types';
import { DeleteForm } from '~/modules/common/delete-form';
import { useOverlayClose } from '~/modules/common/overlay-close';
import { toaster, toastOffline } from '~/modules/common/toaster/toaster';

export interface DeleteItemsProps<TItem, TVariables> {
  items: TItem[];
  /** Created inside the dropdowner or dialog content that renders this form. */
  mutation: { mutate: (variables: TVariables, options?: { onSuccess: () => void }) => void; isPending: boolean };
  toVariables: (items: TItem[]) => TVariables;
  callback?: (args: CallbackArgs<TItem[]>) => void;
  /** E.g. `c:project`: names the act ("Delete projects") and, unless `optimistic`, the success toast. */
  resource?: TKey;
  /** Interpolated with `resource`, e.g. `c:remove_resource`. */
  label?: TKey;
  onlineOnly?: boolean;
  /** Report to `callback` before closing. */
  callbackFirst?: boolean;
  /** The default steps back and leaves `callback` unreported, so a selection survives. */
  onCancel?: () => void;
  /** For a delete that queues offline: finish right after `mutate`, and allow the press offline. */
  optimistic?: boolean;
}

/** Delete confirmation for a list of items: on success it closes its dropdown or dialog and reports the items to `callback`. */
export function DeleteItems<TItem, TVariables>(props: DeleteItemsProps<TItem, TVariables>) {
  const { items, callback, callbackFirst, mutation, resource, label, onCancel } = props;
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
      if (resource && !props.optimistic) {
        const count = items.length;
        toaster.success(
          count === 1
            ? t('c:success.delete_resource', { resource: t(resource) })
            : t('c:success.delete_resource_counted', { count, resource: t(resource, { count }) }),
        );
      }
      finish({ data: items, status: 'success' });
    };
    mutation.mutate(props.toVariables(items), props.optimistic ? undefined : { onSuccess: succeed });
    if (props.optimistic) succeed();
  };

  return (
    <DeleteForm
      {...{ resource, label, onCancel }}
      count={items.length}
      allowOfflineDelete={props.optimistic}
      onDelete={handleDelete}
      pending={mutation.isPending}
    />
  );
}
