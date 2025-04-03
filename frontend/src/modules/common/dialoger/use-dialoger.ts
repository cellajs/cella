import type { ReactNode, RefObject } from 'react';
import { create } from 'zustand';

type DialogContainerOptions = {
  id: string;
  overlay?: boolean;
};

type TriggerRef = RefObject<HTMLButtonElement | HTMLAnchorElement | null>;

export type DialogData = {
  id: number | string;
  triggerRef: TriggerRef;
  description?: ReactNode;
  drawerOnMobile?: boolean;
  className?: string;
  headerClassName?: string;
  hideClose?: boolean;
  container?: DialogContainerOptions;
  title?: string | ReactNode;
  titleContent?: string | ReactNode;
  onClose?: () => void;
};

export type InternalDialog = DialogData & {
  key: number;
  open?: boolean;
  content: ReactNode;
};

interface DialogStoreState {
  dialogs: InternalDialog[];

  create: (content: ReactNode, data: DialogData) => string | number;
  update: (id: number | string, updates: Partial<InternalDialog>) => void;
  remove: (id?: number | string) => void;
  get: (id: number | string) => InternalDialog | undefined;

  triggerRefs: Record<string, TriggerRef | null>;

  setTriggerRef: (id: string, ref: TriggerRef) => void;
  getTriggerRef: (id: string) => TriggerRef | null;
}

/**
 * A hook to manage one or multiple dialogs (on mobile it renders drawers.)
 */
export const useDialoger = create<DialogStoreState>((set, get) => ({
  dialogs: [],
  triggerRefs: {},

  create: (content, data) => {
    // Add defaults and a key for reactivity
    const defaults = { drawerOnMobile: true, hideClose: false, open: true, modal: true, key: Date.now() };

    set((state) => ({
      dialogs: [...state.dialogs.filter((d) => d.id !== data.id), { ...defaults, ...data, content }],
    }));

    return data.id;
  },

  update: (id, updates) => {
    set((state) => ({
      dialogs: state.dialogs.map((dialog) => (dialog.id === id ? { ...dialog, ...updates } : dialog)),
    }));
  },

  remove: (id) => {
    set((state) => {
      const dialogsToRemove = id ? state.dialogs.filter((d) => d.id === id) : state.dialogs;

      for (const dialog of dialogsToRemove) dialog.onClose?.();

      const dialogs = state.dialogs.filter(({ id }) => !dialogsToRemove.some(({ id: removedId }) => removedId === id));

      return { dialogs };
    });
  },

  get: (id) => get().dialogs.find((d) => d.id === id),

  setTriggerRef: (id, ref) => {
    set((state) => ({
      triggerRefs: { ...state.triggerRefs, [id]: ref },
    }));
  },

  getTriggerRef: (id) => {
    return get().triggerRefs[id] ?? null;
  },
}));
