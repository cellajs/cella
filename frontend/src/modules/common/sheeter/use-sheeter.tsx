import type { ReactNode } from 'react';
import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';

export type SheetData = {
  id: string;
  title?: string | ReactNode;
  titleContent?: string | ReactNode;
  description?: ReactNode;
  className?: string;
  content?: ReactNode;
  hideClose?: boolean;
  open?: boolean;
  scrollableOverlay?: boolean;
  modal?: boolean;
  side?: 'bottom' | 'top' | 'right' | 'left';
  removeCallback?: () => void;
};

interface SheetStoreState {
  sheets: SheetData[];

  create(content: ReactNode, data?: Omit<SheetData, 'content'>): string;
  update(id: string, updates: Partial<SheetData>, leavePrevData?: boolean): void;
  remove(id?: string, excludeId?: string): void;
  get(id: string): SheetData | undefined;
}

/**
 * A hook to manage one or multiple sheets (on mobile it renders drawers.)
 */
export const useSheeter = create<SheetStoreState>()(
  immer((set, get) => ({
    sheets: [],

    create: (content, data) => {
      const id = data?.id || Date.now().toString();
      set((state) => {
        state.sheets = [...state.sheets.filter((s) => s.id !== id), { id, modal: data?.modal ?? true, content, open: data?.open ?? true, ...data }];
      });
      return id;
    },
    update: (id, updates, leavePrevData = true) => {
      set((state) => {
        const existingSheet = leavePrevData ? get().get(id) : undefined;
        state.sheets = [...state.sheets.filter((s) => s.id !== id), { id, ...(existingSheet ? { ...existingSheet, ...updates } : updates) }];
      });
    },
    remove: (id, excludeId) => {
      set((state) => {
        if (id) {
          state.sheets = state.sheets.filter((sheet) => sheet.id !== id);
        } else {
          state.sheets = excludeId ? state.sheets.filter((sheet) => sheet.id === excludeId) : [];
        }
      });
    },
    get: (id) => get().sheets.find((sheet) => sheet.id === id),
  })),
);
