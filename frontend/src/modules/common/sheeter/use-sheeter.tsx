import type { ReactNode, RefObject } from 'react';
import { create } from 'zustand';
import { fallbackContentRef } from '~/utils/fallback-content-ref';

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
  key: number;
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

  triggerRefs: Record<string, TriggerRef | null>;

  setTriggerRef: (id: string, ref: TriggerRef) => void;
  getTriggerRef: (id: string) => TriggerRef | null;
}

// Manages one or multiple sheets; on mobile they render as drawers.
export const useSheeter = create<SheetStoreState>()((set, get) => ({
  sheets: [],
  triggerRefs: {},

  create: (content, data) => {
    if (document.activeElement instanceof HTMLButtonElement || document.activeElement instanceof HTMLAnchorElement) {
      fallbackContentRef.current = document.activeElement;
      document.activeElement.blur();
    }

    const defaults = {
      drawerOnMobile: true,
      open: true,
      modal: true,
      key: Date.now(),
      closeSheetOnRouteChange: true,
    };

    set((state) => ({
      sheets: [...state.sheets.filter((s) => s.id !== data.id), { ...defaults, ...data, content }],
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
    set((state) => {
      let removeSheets = state.sheets;

      if (id) removeSheets = state.sheets.filter((sheet) => sheet.id === id);

      if (!removeSheets.length) return { sheets: state.sheets };

      for (const sheet of removeSheets) sheet.onClose?.(opts?.isCleanup);

      const sheets = state.sheets.filter((sheet) => !removeSheets.some((s) => s.id === sheet.id));

      return { sheets };
    });
  },

  removeOnRouteChange: (opts) => {
    set((state) => {
      const removeSheets = state.sheets.filter((sheet) => sheet.closeSheetOnRouteChange);
      if (!removeSheets.length) return { sheets: state.sheets };

      for (const sheet of removeSheets) sheet.onClose?.(opts?.isCleanup);

      const sheets = state.sheets.filter((sheet) => !removeSheets.some((s) => s.id === sheet.id));

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

// Non-hook alias for use outside React components, e.g. sheeter.getState()
export { useSheeter as sheeter };
