import type { ReactNode, RefObject } from 'react';
import { create } from 'zustand';
import { blurAndStashTrigger, removeAndNotify, withDefaults } from '~/modules/common/overlay-store-helpers';

/** Element focus returns to on close; read when the sheet closes, so a ref may resolve to a later DOM node. */
export type TriggerRef = RefObject<HTMLElement | null>;

type SheetContainerOptions = { ref: RefObject<HTMLDivElement | null> };

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
  /** Key to identify content for animated transitions (used with AnimatePresence). */
  contentKey?: string;
  /** Enable auto-scrolling when dragging elements near edges. */
  autoScrollOnDrag?: boolean | 'vertical' | 'horizontal';
  /** Closing hides the sheet without unmounting it until `unmount`, so a later `create` with its id reopens it without a mount. */
  keepMounted?: boolean;
  onClose?: (isCleanup?: boolean) => void;
};

export type InternalSheet = SheetData & { content: ReactNode; open?: boolean };

type CloseOptions = { isCleanup?: boolean };

/** Closes sheets: a keepMounted sheet stays in the list with `open: false`, the others leave it. */
function closeAndNotify(set: (state: { sheets: InternalSheet[] }) => void, sheets: InternalSheet[], toClose: InternalSheet[], opts?: CloseOptions) {
  // A closed keepMounted sheet has nothing left to close
  const closing = toClose.filter((sheet) => !sheet.keepMounted || sheet.open !== false);
  const remaining = sheets.flatMap((sheet) => {
    if (!closing.includes(sheet)) return [sheet];
    return sheet.keepMounted ? [{ ...sheet, open: false }] : [];
  });
  removeAndNotify(() => set({ sheets: remaining }), sheets, closing, opts);
}

/** The sheet the nav bars open; the sheeter keeps it open through outside presses and route changes while the nav is pinned. */
export const navSheetId = 'nav-sheet';

interface SheetStoreState {
  sheets: InternalSheet[];

  create(content: ReactNode, data: SheetData): string;
  /** Renders a keepMounted sheet closed, so its first `create` opens it without mounting. Does nothing when the id exists. */
  mount(content: ReactNode, data: SheetData): void;
  replace(content: ReactNode, data: SheetData): string;
  update(id: string, updates: Partial<InternalSheet>): void;
  remove(id?: string, opts?: CloseOptions): void;
  removeOnRouteChange: (opts?: CloseOptions) => void;
  /** Removes a sheet for good, a closed keepMounted sheet included. */
  unmount(id: string): void;
  get(id: string): InternalSheet | undefined;

  /** @deprecated No-op: focus returns through `triggerRef` or the focus fallback. Removed in the next release. */
  setTriggerRef: (id: string, ref: TriggerRef) => void;
}

// Manages one or multiple sheets; on mobile they render as drawers.
export const useSheeter = create<SheetStoreState>()((set, get) => ({
  sheets: [],

  create: (content, data) => {
    blurAndStashTrigger();

    const defaults = { open: true, modal: true, closeSheetOnRouteChange: true };

    set((state) => ({
      sheets: [...state.sheets.filter((s) => s.id !== data.id), { ...withDefaults(defaults, data), content }],
    }));
    return data.id;
  },

  mount: (content, data) => {
    if (get().sheets.some((s) => s.id === data.id)) return;

    const defaults = { modal: true, closeSheetOnRouteChange: true };

    set((state) => ({ sheets: [...state.sheets, { ...withDefaults(defaults, data), keepMounted: true, content, open: false }] }));
  },

  replace: (content, data) => {
    const existing = get().sheets.find((s) => s.id === data.id);
    if (!existing) return get().create(content, data);

    // Merges into the open sheet: an option passed as undefined clears its value.
    set((state) => ({ sheets: state.sheets.map((s) => (s.id === data.id ? { ...s, ...data, content, open: true } : s)) }));
    return data.id;
  },

  update: (id, updates) => {
    set((state) => ({ sheets: state.sheets.map((sheet) => (sheet.id === id ? { ...sheet, ...updates } : sheet)) }));
  },

  remove: (id, opts) => {
    const { sheets } = get();
    const toRemove = id === undefined ? sheets : sheets.filter((sheet) => sheet.id === id);
    closeAndNotify(set, sheets, toRemove, opts);
  },

  removeOnRouteChange: (opts) => {
    const { sheets } = get();
    const toRemove = sheets.filter((sheet) => sheet.closeSheetOnRouteChange !== false);
    closeAndNotify(set, sheets, toRemove, opts);
  },

  unmount: (id) => {
    const { sheets } = get();
    const sheet = sheets.find((s) => s.id === id);
    if (!sheet) return;
    // A closed sheet already had its onClose
    if (sheet.open === false) set({ sheets: sheets.filter((s) => s !== sheet) });
    else removeAndNotify((remaining) => set({ sheets: remaining }), sheets, [sheet], { isCleanup: true });
  },

  get: (id) => get().sheets.find((sheet) => sheet.id === id),

  setTriggerRef: () => {},
}));

// Non-hook alias for use outside React components, e.g. sheeter.getState()
export { useSheeter as sheeter };
