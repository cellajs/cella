import type { ReactNode, RefObject } from 'react';
import { create } from 'zustand';
import { blurAndStashTrigger, removeAndNotify, type TriggerRef, updateById, withDefaults } from '~/modules/common/overlay-store-helpers';

export type { TriggerRef } from '~/modules/common/overlay-store-helpers';

type DialogContainerOptions = { ref: RefObject<HTMLDivElement | null>; overlay?: boolean };

export type DialogData = {
  id: number | string;
  triggerRef: TriggerRef;
  description?: ReactNode;
  drawerOnMobile?: boolean;
  /**
   * A search dialog: below `sm` it sits at the top, inset on every side so the page shows around it, and grows down
   * from its field to the keyboard's edge. Its content renders a `SearchDialogBar`, whose Cancel closes it.
   */
  searchLayout?: boolean;
  outsideScroll?: boolean;
  /** Remove immediately on dismissal so externally owned open state cannot flash the dialog back. */
  instantClose?: boolean;
  className?: string;
  headerClassName?: string;
  container?: DialogContainerOptions;
  title?: ReactNode;
  titleContent?: ReactNode;
  onClose?: (isCleanup?: boolean) => void;
};

export type InternalDialog = DialogData & { open?: boolean; content: ReactNode };

interface DialogStoreState {
  dialogs: InternalDialog[];

  create: (content: ReactNode, data: DialogData) => string | number;
  update: (id: number | string, updates: Partial<InternalDialog>) => void;
  remove: (id?: number | string, opts?: { isCleanup?: boolean }) => void;
  get: (id: number | string) => InternalDialog | undefined;
  scrollToTop: (id: number | string) => void;
}

/** Store of the open dialogs, which `Dialoger` renders. */
export const useDialoger = create<DialogStoreState>((set, get) => ({
  dialogs: [],

  create: (content, data) => {
    blurAndStashTrigger();

    const defaults = { drawerOnMobile: true, headerClassName: 'with-close-btn', open: true };

    set((state) => ({
      dialogs: [...state.dialogs.filter((dialog) => dialog.id !== data.id), { ...withDefaults(defaults, data), content }],
    }));

    return data.id;
  },

  update: (id, updates) => set((state) => ({ dialogs: updateById(state.dialogs, id, updates) })),

  remove: (id, opts) => {
    const { dialogs } = get();
    const toRemove = id === undefined ? dialogs : dialogs.filter((dialog) => dialog.id === id);
    removeAndNotify((remaining) => set({ dialogs: remaining }), dialogs, toRemove, opts);
  },

  get: (id) => get().dialogs.find((dialog) => dialog.id === id),

  scrollToTop: (id) => {
    const popup = document.getElementById(String(id));
    popup?.closest('[data-slot="dialog-viewport"]')?.scrollTo({ top: 0 });
  },
}));

export { useDialoger as dialoger };
