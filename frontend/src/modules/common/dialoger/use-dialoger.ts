import type { ReactNode, RefObject } from 'react';
import { create } from 'zustand';
import { blurAndStashTrigger, removeAndNotify, withDefaults } from '~/modules/common/overlay-store-helpers';

type DialogContainerOptions = { ref: RefObject<HTMLDivElement | null>; overlay?: boolean; overlayRef?: RefObject<HTMLDivElement | null> };

export type TriggerRef = RefObject<HTMLButtonElement | HTMLAnchorElement | null>;

export type DialogData = {
  id: number | string;
  triggerRef: TriggerRef;
  description?: ReactNode;
  drawerOnMobile?: boolean;
  outsideScroll?: boolean;
  /** Remove immediately on dismissal so externally owned open state cannot flash the dialog back. */
  instantClose?: boolean;
  className?: string;
  headerClassName?: string;
  container?: DialogContainerOptions;
  title?: string | ReactNode;
  titleContent?: string | ReactNode;
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

  /** @deprecated No-op: focus returns through `triggerRef` or the focus fallback. Removed in the next release. */
  setTriggerRef: (id: string, ref: TriggerRef) => void;
}

// Manages one or multiple dialogs; on mobile they render as drawers.
export const useDialoger = create<DialogStoreState>((set, get) => ({
  dialogs: [],

  create: (content, data) => {
    blurAndStashTrigger();

    const defaults = { drawerOnMobile: true, headerClassName: 'with-close-btn', open: true };

    set((state) => ({
      dialogs: [...state.dialogs.filter((d) => d.id !== data.id), { ...withDefaults(defaults, data), content }],
    }));

    return data.id;
  },

  update: (id, updates) => {
    set((state) => ({ dialogs: state.dialogs.map((dialog) => (dialog.id === id ? { ...dialog, ...updates } : dialog)) }));
  },

  remove: (id, opts) => {
    const { dialogs } = get();
    const toRemove = id === undefined ? dialogs : dialogs.filter((d) => d.id === id);
    removeAndNotify((remaining) => set({ dialogs: remaining }), dialogs, toRemove, opts);
  },

  get: (id) => get().dialogs.find((d) => d.id === id),

  scrollToTop: (id) => {
    const popup = document.getElementById(String(id));
    popup?.closest('[data-slot="dialog-viewport"]')?.scrollTo({ top: 0 });
  },

  setTriggerRef: () => {},
}));
