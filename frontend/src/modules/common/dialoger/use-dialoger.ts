import type { ReactNode, RefObject } from 'react';
import { create } from 'zustand';
import { blurAndStashTrigger, removeAndNotify, type TriggerRef, updateById, withDefaults } from '~/modules/common/overlay-store-helpers';

export type { TriggerRef } from '~/modules/common/overlay-store-helpers';

type DialogContainerOptions = {
  ref: RefObject<HTMLDivElement | null>;
  /** Dims the page and its navigation (in a sheet: that sheet) through the spotlight, which lifts the dialog above the dim and closes it on a backdrop click. */
  overlay?: boolean;
};

export type DialogData = {
  id: number | string;
  triggerRef: TriggerRef;
  description?: ReactNode;
  drawerOnMobile?: boolean;
  /**
   * A search dialog: below `sm` it sits at the top, inset on every side so the page shows around it, and reaches down
   * to the keyboard's edge, also while its results are empty. Its content renders a `SearchDialogBar`, whose close X ends it.
   */
  searchLayout?: boolean;
  /**
   * At the bottom edge, where the selection bar sits, its header centered and without a close X: of the sheet its trigger is in,
   * else of the screen. A phone shows the drawer.
   */
  dock?: 'bottom';
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
