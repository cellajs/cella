import type { ReactNode, RefObject } from 'react';
import { create } from 'zustand';

export type DropdownKind = 'menu' | 'panel';

export type DropdownData = {
  id: number | string;
  triggerId: string;
  triggerRef: RefObject<HTMLButtonElement | null>;
  align?: 'start' | 'center' | 'end';
  modal?: boolean;
  /**
   * 'menu' uses Base UI's Menu primitive (roving focus, arrow keys, typeahead).
   * 'panel' uses a Popover with a focus trap for arbitrary content (forms,
   * comboboxes, date pickers). Defaults to 'panel'.
   */
  kind?: DropdownKind;
  /**
   * Bypass the 300ms "reopen with same triggerId" guard. Set this for
   * programmatic openers (e.g. data-grid edit cells) where there's no race
   * between a button onClick and a popover dismiss to debounce.
   */
  programmatic?: boolean;
};

export type InternalDropdown = DropdownData & {
  key: number;
  content: ReactNode;
  align: 'start' | 'center' | 'end';
  modal: boolean;
  kind: DropdownKind;
};

interface DropdownStoreState {
  dropdown: InternalDropdown | null;
  lastRemovedTriggerId: string | null;
  lastRemovedAt: number;

  create: (content: ReactNode, data: DropdownData) => string | number;
  update: (updates: Partial<InternalDropdown>) => void;
  remove: () => void;
  get: () => InternalDropdown | null;
}

export const useDropdowner = create<DropdownStoreState>((set, get) => ({
  dropdown: null,
  lastRemovedTriggerId: null,
  lastRemovedAt: 0,

  create: (content, data) => {
    const current = get().dropdown;

    // Remove active styling from previous trigger
    current?.triggerRef.current?.removeAttribute('data-dropdowner-active');

    // Close dropdown if it's already open
    if (current?.triggerId === data.triggerId) {
      set({ dropdown: null, lastRemovedTriggerId: data.triggerId, lastRemovedAt: Date.now() });
      return data.id;
    }

    // Skip reopening if same trigger was just closed (popover dismiss raced with button onClick).
    // Programmatic openers opt out; they don't have a click-to-toggle race to debounce, and the
    // guard otherwise breaks them under React StrictMode (mount → cleanup → mount runs `create`
    // twice with the same id within the 300ms window).
    if (!data.programmatic) {
      const { lastRemovedTriggerId, lastRemovedAt } = get();
      if (lastRemovedTriggerId === data.triggerId && Date.now() - lastRemovedAt < 300) {
        set({ lastRemovedTriggerId: null });
        return data.id;
      }
    }

    // Mark new trigger as active
    data.triggerRef.current?.setAttribute('data-dropdowner-active', '');

    // Blur active element to prevent aria-hidden conflict when modal sets aria-hidden on ancestors
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();

    set({
      dropdown: { content, align: 'start', modal: true, kind: 'panel', ...data, key: Date.now() },
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
    const current = get().dropdown;
    current?.triggerRef.current?.removeAttribute('data-dropdowner-active');
    set({ dropdown: null, lastRemovedTriggerId: current?.triggerId ?? null, lastRemovedAt: Date.now() });
  },

  get: () => get().dropdown,
}));
