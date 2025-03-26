import type { ReactNode } from 'react';
import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';

// ==== Types ====

export type DropdownData = {
  id: number | string;
  key?: number;
  triggerId?: string;
  content?: ReactNode;
  align?: 'start' | 'end';
  modal?: boolean;
};

export type ExternalDropdown = Omit<DropdownData, 'id' | 'content' | 'key'> & {
  id?: number | string;
};

interface DropdownStoreState {
  dropdown: DropdownData | null;

  create: (content: ReactNode, data?: ExternalDropdown) => string | number;
  update: (updates: Partial<DropdownData>) => void;
  remove: () => void;
  getOpen: () => DropdownData | null;
}

// ==== Defaults ====

const defaultDropdown: Omit<DropdownData, 'id' | 'content' | 'key'> = {
  align: 'start',
  modal: true,
};

// ==== Store ====

export const useDropdowner = create<DropdownStoreState>()(
  immer((set, get) => ({
    dropdown: null,

    create: (content, data) => {
      const id = data?.id ?? Date.now().toString();

      set((state) => {
        state.dropdown = {
          id,
          key: Date.now(), // Forces reactivity
          content,
          ...defaultDropdown,
          ...data,
        };
      });

      return id;
    },

    update: (updates) => {
      set((state) => {
        if (state.dropdown) {
          Object.assign(state.dropdown, updates);
        }
      });
    },

    remove: () => {
      set((state) => {
        state.dropdown = null;
      });
    },

    getOpen: () => get().dropdown,
  })),
);
