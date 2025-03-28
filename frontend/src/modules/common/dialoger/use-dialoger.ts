import type { ReactNode, RefObject } from 'react';
import { create } from 'zustand';

type DialogContainerOptions = {
  id: string;
  overlay?: boolean;
};

export type DialogData = {
  id: number | string;
  triggerRef: RefObject<HTMLButtonElement | null>;
  description?: ReactNode;
  drawerOnMobile?: boolean;
  className?: string;
  headerClassName?: string;
  hideClose?: boolean;
  container?: DialogContainerOptions;
  title?: string | ReactNode;
  titleContent?: string | ReactNode;
  open?: boolean;
  removeCallback?: () => void;
  reset?: boolean;
};

export type InternalDialog = DialogData & {
  key: number;
  content: ReactNode;
};

interface DialogStoreState {
  dialogs: InternalDialog[];

  create: (content: ReactNode, data: DialogData) => string | number;
  update: (id: number | string, updates: Partial<InternalDialog>) => void;
  remove: (id?: number | string) => void;
  get: (id: number | string) => InternalDialog | undefined;
  reset: (id?: number | string) => void;
}

export const useDialoger = create<DialogStoreState>((set, get) => ({
  dialogs: [],

  create: (content, data) => {
    set((state) => ({
      dialogs: [
        ...state.dialogs.filter((d) => d.id !== data.id),
        {
          ...data,
          content,
          drawerOnMobile: true,
          hideClose: false,
          open: true,
          key: Date.now(),
        },
      ],
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

      for (const d of dialogsToRemove) {
        d.removeCallback?.();
      }

      return {
        dialogs: id ? state.dialogs.filter((d) => d.id !== id) : [],
      };
    });
  },

  reset: (id) => {
    set((state) => ({
      dialogs: state.dialogs.map((dialog) => (id && dialog.id !== id ? dialog : { ...dialog, reset: true })),
    }));
  },

  get: (id) => get().dialogs.find((d) => d.id === id),
}));
