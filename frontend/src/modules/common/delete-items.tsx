import { useTranslation } from 'react-i18next';
import type { TKey } from '~/lib/i18n-locales';
import type { CallbackArgs } from '~/modules/common/data-table/types';
import { DeleteForm } from '~/modules/common/delete-form';
import { useOverlayClose } from '~/modules/common/overlay-close';
import { toaster } from '~/modules/common/toaster/toaster';

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
  /** The default steps back and leaves `callback` unreported, so a selection survives. */
  onCancel?: () => void;
  /** For a delete that queues offline: finish right after `mutate`, and allow the press offline. Without it, an offline press is refused. */
  optimistic?: boolean;
}

/** Delete confirmation for a list of items: on success it closes its dropdown or dialog and reports the items to `callback`. */
export function DeleteItems<TItem, TVariables>(props: DeleteItemsProps<TItem, TVariables>) {
  const { items, callback, mutation, resource, label, onCancel } = props;
  const { t } = useTranslation();
  const overlay = useOverlayClose();

  const handleDelete = () => {
    const succeed = () => {
      if (resource && !props.optimistic) {
        const count = items.length;
        toaster.success(
          count === 1
            ? t('c:success.delete_resource', { resource: t(resource) })
            : t('c:success.delete_resource_counted', { count, resource: t(resource, { count }) }),
        );
      }
      overlay?.close();
      callback?.({ data: items, status: 'success' });
    };
    mutation.mutate(props.toVariables(items), props.optimistic ? undefined : { onSuccess: succeed });
    if (props.optimistic) succeed();
  };

  return (
    <DeleteForm
      {...{ resource, label, onCancel }}
      count={items.length}
      allowOffline={props.optimistic}
      onDelete={handleDelete}
      pending={mutation.isPending}
    />
  );
}
