import type { ReactNode } from 'react';
import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';

type DialogContainerOptions = {
  id: string;
  overlay?: boolean;
};

export type DialogData = {
  id: number | string;
  title?: string | ReactNode;
  description?: ReactNode;
  drawerOnMobile?: boolean;
  className?: string;
  headerClassName?: string;
  hideClose?: boolean;
  container?: DialogContainerOptions;
  content?: ReactNode;
  titleContent?: string | ReactNode;
  open?: boolean;
  removeCallback?: () => void;
  reset?: boolean;
};

// TODO CAn we get rid of this?
export type ExternalDialog = Omit<DialogData, 'id' | 'content'> & {
  id?: number | string;
};

interface DialogStoreState {
  dialogs: DialogData[];

  create: (content: ReactNode, data?: ExternalDialog) => string | number;
  update: (id: number | string, updates: Partial<DialogData>) => void;
  remove: (id?: number | string) => void;
  get: (id: number | string) => DialogData | undefined;
  reset: (id?: number | string) => void;
}

export const useDialoger = create<DialogStoreState>()(
  immer((set, get) => ({
    dialogs: [],

    create: (content, data) => {
      const id = data?.id || Date.now().toString();

      set((state) => {
        state.dialogs = [
          ...state.dialogs.filter((d) => d.id !== id),
          {
            id,
            content,
            drawerOnMobile: true,
            hideClose: false,
            open: true,
            ...data,
          },
        ];
      });
      return id;
    },

    update: (id, updates) => {
      set((state) => {
        const existingDialog = state.dialogs.find((d) => d.id === id);
        if (existingDialog) {
          Object.assign(existingDialog, updates);
        }
      });
    },

    remove: (id) => {
      set((state) => {
        if (id) {
          const dialog = state.dialogs.find((d) => d.id === id);
          dialog?.removeCallback?.();
          state.dialogs = state.dialogs.filter((d) => d.id !== id);
          return;
        }
        for (const d of state.dialogs) {
          d.removeCallback?.();
        }
        state.dialogs = [];
      });
    },

    reset: (id) => {
      set((state) => {
        if (id) {
          const dialog = state.dialogs.find((d) => d.id === id);
          if (dialog) dialog.reset = true;
          return;
        }
        for (const d of state.dialogs) {
          d.reset = true;
        }
      });
    },

    get: (id) => get().dialogs.find((d) => d.id === id),
  })),
);
