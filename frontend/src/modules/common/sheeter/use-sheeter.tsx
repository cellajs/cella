import type { ReactNode, RefObject } from 'react';
import { create } from 'zustand';
import { blurAndStashTrigger, removeAndNotify } from '~/modules/common/overlay-store-helpers';

/** Element focus returns to on close; read when the sheet closes, so a ref may resolve to a later DOM node. */
export type TriggerRef = RefObject<HTMLElement | null>;

type SheetContainerOptions = {
  ref: RefObject<HTMLDivElement | null>;
};

export type SheetData = {
  id: string;
  triggerRef: TriggerRef;
  side: 'bottom' | 'top' | 'right' | 'left';
  title?: string | ReactNode;
  titleContent?: string | ReactNode;
  description?: ReactNode;
  className?: string;
  headerClassName?: string;
  closeSheetOnEsc?: boolean;
  modal?: boolean | 'trap-focus';
  disablePointerDismissal?: boolean;
  closeSheetOnRouteChange?: boolean;
  container?: SheetContainerOptions;
  skipAnimation?: boolean;
  /** Key to identify content for animated transitions (used with AnimatePresence). */
  contentKey?: string;
  /** Enable auto-scrolling when dragging elements near edges. */
  autoScrollOnDrag?: boolean | 'vertical' | 'horizontal';
  onClose?: (isCleanup?: boolean) => void;
};

export type InternalSheet = SheetData & {
  content: ReactNode;
  open?: boolean;
};

interface SheetStoreState {
  sheets: InternalSheet[];

  create(content: ReactNode, data: SheetData): string;
  replace(content: ReactNode, data: SheetData): string;
  update(id: string, updates: Partial<InternalSheet>): void;
  remove(id?: string, opts?: { isCleanup?: boolean }): void;
  removeOnRouteChange: (opts?: { isCleanup?: boolean }) => void;
  get(id: string): InternalSheet | undefined;

  /** @deprecated No-op: focus returns through `triggerRef` or the focus fallback. Removed in the next release. */
  setTriggerRef: (id: string, ref: TriggerRef) => void;
}

// Manages one or multiple sheets; on mobile they render as drawers.
export const useSheeter = create<SheetStoreState>()((set, get) => ({
  sheets: [],

  create: (content, data) => {
    blurAndStashTrigger();

    const defaults = { open: true, modal: true };
    // An explicit undefined keeps the default, which the provider and removeOnRouteChange both read as true.
    const closeSheetOnRouteChange = data.closeSheetOnRouteChange ?? true;

    set((state) => ({
      sheets: [
        ...state.sheets.filter((s) => s.id !== data.id),
        { ...defaults, ...data, closeSheetOnRouteChange, content },
      ],
    }));
    return data.id;
  },

  replace: (content, data) => {
    const existing = get().sheets.find((s) => s.id === data.id);
    if (!existing) return get().create(content, data);

    set((state) => ({
      sheets: state.sheets.map((s) => (s.id === data.id ? { ...s, ...data, content, open: true } : s)),
    }));
    return data.id;
  },

  update: (id, updates) => {
    set((state) => ({
      sheets: state.sheets.map((sheet) => (sheet.id === id ? { ...sheet, ...updates } : sheet)),
    }));
  },

  remove: (id, opts) => {
    const { sheets } = get();
    const toRemove = id === undefined ? sheets : sheets.filter((sheet) => sheet.id === id);
    removeAndNotify((remaining) => set({ sheets: remaining }), sheets, toRemove, opts);
  },

  removeOnRouteChange: (opts) => {
    const { sheets } = get();
    const toRemove = sheets.filter((sheet) => sheet.closeSheetOnRouteChange !== false);
    removeAndNotify((remaining) => set({ sheets: remaining }), sheets, toRemove, opts);
  },

  get: (id) => get().sheets.find((sheet) => sheet.id === id),

  setTriggerRef: () => {},
}));

// Non-hook alias for use outside React components, e.g. sheeter.getState()
export { useSheeter as sheeter };
