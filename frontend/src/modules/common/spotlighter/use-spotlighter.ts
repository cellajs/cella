import { useEffect } from 'react';
import { create } from 'zustand';
import { useLatestCallback } from '~/hooks/use-latest-ref';
import { tw } from '~/utils/tw';

interface SpotlightEntry {
  id: string;
  /** Invoked on backdrop click and Esc while this entry is topmost. */
  onClose: () => void;
  /** The element the overlay dims; the whole page when absent (see `useSpotlight`). */
  scope?: Element;
}

interface SpotlighterState {
  /** Overlapping spotlights stack: the overlay stays up until the last one closes, and close gestures pop the top. */
  stack: SpotlightEntry[];
  open: (entry: SpotlightEntry) => void;
  close: (id: string) => void;
}

/** The open spotlights of the one page-dim overlay (`Spotlighter`): an expanded composer, a card in edit mode, a focused panel, an inline dialog. */
export const useSpotlighter = create<SpotlighterState>((set) => ({
  stack: [],
  open: (entry) => set((state) => ({ stack: [...state.stack.filter((existing) => existing.id !== entry.id), entry] })),
  close: (id) => set((state) => ({ stack: state.stack.filter((entry) => entry.id !== id) })),
}));

/**
 * Declarative registration: the overlay shows while `active`, and backdrop/Esc call `onClose`.
 * A region inside a sheet passes its `sheetLayerOf` as `scope`: the overlay then dims only that sheet, and `spotlightLift` raises the region above it there.
 * @public
 */
export function useSpotlight(id: string, active: boolean, onClose: () => void, scope?: Element | null) {
  const handleClose = useLatestCallback(onClose);
  useEffect(() => {
    if (!active) return;
    useSpotlighter.getState().open({ id, onClose: handleClose, scope: scope ?? undefined });
    return () => useSpotlighter.getState().close(id);
  }, [id, active, handleClose, scope]);
}

/**
 * Raises a spotlit region to z-111: above the overlay (110, over all page and navigation chrome and the selection bar), below dialogs,
 * sheets and dropdowns (113+), so pickers opened from it stay usable. Apply it to the outermost element of the region: an ancestor with
 * a stacking context (transform, filter, opacity, contain, positioned z-index) traps it under the overlay.
 * @public
 */
export const spotlightLift = tw('relative z-111');

/**
 * `spotlightLift` for a virtua list row, whose wrapper's `contain` traps the row's own z-index: a rule in styling/tailwind.css lifts the wrapper.
 * @public
 */
export const spotlightLiftRow = 'spotlight-lift-row';

export { useSpotlighter as spotlighter };
