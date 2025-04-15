import type { ReactNode, RefObject } from 'react';
import { create } from 'zustand';

type TriggerRef = RefObject<HTMLButtonElement | HTMLAnchorElement | null>;

export type SheetData = {
  id: string;
  triggerRef: TriggerRef;
  side: 'bottom' | 'top' | 'right' | 'left';
  title?: string | ReactNode;
  titleContent?: string | ReactNode;
  description?: ReactNode;
  className?: string;
  hideClose?: boolean;
  scrollableOverlay?: boolean;
  closeSheetOnEsc?: boolean;
  modal?: boolean;
  onClose?: () => void;
};

export type InternalSheet = SheetData & {
  key: number;
  content: ReactNode;
  open?: boolean;
  refocus?: boolean;
};

interface SheetStoreState {
  sheets: InternalSheet[];

  create(content: ReactNode, data: SheetData): string;
  update(id: string, updates: Partial<InternalSheet>): void;
  remove(id?: string, options?: { excludeId?: string; refocus?: boolean }): void;
  get(id: string): InternalSheet | undefined;

  triggerRefs: Record<string, TriggerRef | null>;

  setTriggerRef: (id: string, ref: TriggerRef) => void;
  getTriggerRef: (id: string) => TriggerRef | null;
}

/**
 * A hook to manage one or multiple sheets (on mobile it renders drawers.)
 */
export const useSheeter = create<SheetStoreState>()((set, get) => ({
  sheets: [],
  triggerRefs: {},

  create: (content, data) => {
    // Add defaults and a key for reactivity
    const defaults = { drawerOnMobile: true, hideClose: false, open: true, modal: true, key: Date.now(), refocus: true };

    set((state) => ({
      sheets: [...state.sheets.filter((s) => s.id !== data.id), { ...defaults, ...data, content }],
    }));
    return data.id;
  },

  update: (id, updates) => {
    set((state) => ({
      sheets: state.sheets.map((sheet) => (sheet.id === id ? { ...sheet, ...updates } : sheet)),
    }));
  },

  remove: (id, options) => {
    set((state) => {
      let removedSheets: InternalSheet[] = [];

      // Remove by id or remove all and optionally exlude one
      if (id) {
        removedSheets = state.sheets.filter((sheet) => sheet.id === id);
      } else {
        removedSheets = options?.excludeId ? state.sheets.filter((sheet) => sheet.id !== options.excludeId) : state.sheets;
      }

      // Apply refocus option before onClose and filtering
      const sheetsWithRefocus = state.sheets.map((sheet) => {
        if (removedSheets.some((removed) => removed.id === sheet.id)) {
          return { ...sheet, refocus: options?.refocus ?? true };
        }
        return sheet;
      });

      // Call onClose hooks
      for (const sheet of removedSheets) sheet.onClose?.();

      // Filter them out
      const sheets = sheetsWithRefocus.filter((sheet) => !removedSheets.some((removed) => removed.id === sheet.id));

      return { sheets };
    });
  },

  get: (id) => get().sheets.find((sheet) => sheet.id === id),

  setTriggerRef: (id, ref) => {
    set((state) => ({
      triggerRefs: { ...state.triggerRefs, [id]: ref },
    }));
  },

  getTriggerRef: (id) => {
    return get().triggerRefs[id] ?? null;
  },
}));
