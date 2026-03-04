import type { DropdownMenuContentProps } from '@radix-ui/react-dropdown-menu';
import type { ReactNode, RefObject } from 'react';
import { create } from 'zustand';

export type DropdownData = {
  id: number | string;
  triggerId: string;
  triggerRef: RefObject<HTMLButtonElement | null>;
  align?: DropdownMenuContentProps['align'];
  modal?: boolean;
};

export type InternalDropdown = DropdownData & {
  key: number;
  content: ReactNode;
  align: DropdownMenuContentProps['align'];
  modal: boolean;
};

interface DropdownStoreState {
  dropdown: InternalDropdown | null;

  create: (content: ReactNode, data: DropdownData) => string | number;
  update: (updates: Partial<InternalDropdown>) => void;
  remove: () => void;
  get: () => InternalDropdown | null;
}

export const useDropdowner = create<DropdownStoreState>((set, get) => ({
  dropdown: null,

  create: (content, data) => {
    const current = get().dropdown;

    // Remove active styling from previous trigger
    current?.triggerRef.current?.removeAttribute('data-dropdowner-active');

    // Close dropdown if it's already open
    if (current?.triggerId === data.triggerId) {
      set({ dropdown: null });
      return data.id;
    }

    // Mark new trigger as active
    data.triggerRef.current?.setAttribute('data-dropdowner-active', '');

    // Blur active element to prevent aria-hidden conflict when modal sets aria-hidden on ancestors
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();

    set({
      dropdown: { content, align: 'start', modal: true, ...data, key: Date.now() },
    });

    return data.id;
  },

  update: (updates) => {
    const current = get().dropdown;
    if (!current) return;

    set({
      dropdown: { ...current, ...updates },
    });
  },

  remove: () => {
    get().dropdown?.triggerRef.current?.removeAttribute('data-dropdowner-active');
    set({ dropdown: null });
  },

  get: () => get().dropdown,
}));
