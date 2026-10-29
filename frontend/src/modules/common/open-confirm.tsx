import i18n from 'i18next';
import type { ReactNode } from 'react';
import type { TKey } from '~/lib/i18n-locales';
import { DeleteForm } from '~/modules/common/delete-form';
import { dialoger, type TriggerRef } from '~/modules/common/dialoger/use-dialoger';
import { type DropdownData, dropdowner } from '~/modules/common/dropdowner/use-dropdowner';
import type { IconComponent } from '~/modules/common/icons/types';
import { NamedText } from '~/modules/common/named-text';
import { PopConfirm } from '~/modules/common/popconfirm';

type ConfirmOptions = {
  /** Names the confirmation; pressing its trigger again closes it. */
  id: string;
  title: ReactNode;
  /** `end` by default. */
  align?: DropdownData['align'];
} & (
  | {
      /** A form whose action needs hooks, e.g. a `Delete*` component; it closes the confirmation itself. */
      content: ReactNode;
    }
  | {
      /** Runs after the confirmation closes. */
      onConfirm: () => void;
      /** What goes, e.g. `c:connection`: the act reads "Delete connection". */
      resource?: TKey;
      label?: TKey;
      cancelLabel?: TKey;
      icon?: IconComponent;
      allowOffline?: boolean;
    }
);

/** Opens a confirmation on `trigger`, a button that has no menu of its own. */
export function openConfirm(trigger: HTMLElement, options: ConfirmOptions) {
  const { create, remove } = dropdowner.getState();
  const content =
    'content' in options ? (
      options.content
    ) : (
      <DeleteForm
        resource={options.resource}
        label={options.label}
        cancelLabel={options.cancelLabel}
        icon={options.icon}
        allowOfflineDelete={options.allowOffline}
        pending={false}
        onDelete={() => {
          remove();
          options.onConfirm();
        }}
      />
    );

  create(<PopConfirm title={options.title}>{content}</PopConfirm>, {
    id: options.id,
    triggerId: options.id,
    triggerRef: { current: trigger },
    align: options.align ?? 'end',
    kind: 'menu',
    // A wide trigger, such as a tile's full-width button, gets a confirmation as wide as itself
    popupClassName: 'min-w-(--anchor-width)',
  });
}

interface DeleteDialogOptions {
  id: string;
  triggerRef: TriggerRef;
  /** What is deleted, e.g. `c:project`: the title and question count it. */
  resource: TKey;
  count: number;
  /** A `Delete*` form; it closes the dialog itself. */
  content: ReactNode;
  /** Replaces "Delete 3 projects", e.g. for a removal. */
  title?: ReactNode;
  /** Replaces the counted question, e.g. a `NamedText` that lists the items. */
  description?: ReactNode;
}

/** Opens a dialog that confirms deleting `count` items: "Delete 3 projects". From a selection bar it docks in the bar's place. */
export function openDeleteDialog({ id, triggerRef, resource, count, content, title, description }: DeleteDialogOptions) {
  const resourceName = i18n.t(resource, { count });
  const dock = triggerRef.current?.closest('[data-selection-bar]') ? 'bottom' : undefined;
  dialoger.getState().create(content, {
    id,
    triggerRef,
    dock,
    className: dock ? 'max-w-md' : 'max-w-xl',
    title: title ?? i18n.t('c:delete_resource', { resource: resourceName }),
    description: description ?? <NamedText i18nKey="c:confirm.delete_resource_counted" values={{ count, resource: resourceName }} />,
  });
}
