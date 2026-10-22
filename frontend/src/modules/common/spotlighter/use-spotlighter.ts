import { useEffect } from 'react';
import { create } from 'zustand';
import { useLatestCallback } from '~/hooks/use-latest-ref';
import { tw } from '~/utils/tw';

/**
 * Spotlighter: one page-dim overlay for in-place spotlight states (an expanded composer, a card
 * in edit mode, a focused panel that should mute the page around it). The overlay renders
 * once at the app root (see provider.tsx) at `z-110`, above all page and navigation chrome; the
 * spotlit elements raise themselves above it with `spotlightLift`.
 *
 * The fixed z ladder: sidebar 10, sticky tab nav 80, floating nav/FAB 105, spotlight overlay 110,
 * spotlit content 111, dialogs/sheets/dropdowns 113+ (so pickers opened from spotlit content stay
 * usable). A lift only escapes the overlay when no ancestor between it and the app root creates its
 * own stacking context (transform, filter, opacity, contain, positioned z-index): lift the
 * outermost element of a region, not a node deep inside one.
 */
interface SpotlightEntry {
  id: string;
  /** Invoked on backdrop click and Esc while this entry is topmost. */
  onClose: () => void;
}

interface SpotlighterState {
  /** Overlapping spotlights stack (e.g. editing the one visible post of a submission view): the overlay stays up until the last one closes, and close gestures pop the top. */
  stack: SpotlightEntry[];
  open: (entry: SpotlightEntry) => void;
  close: (id: string) => void;
}

export const useSpotlighter = create<SpotlighterState>((set) => ({
  stack: [],
  open: (entry) => set((state) => ({ stack: [...state.stack.filter((existing) => existing.id !== entry.id), entry] })),
  close: (id) => set((state) => ({ stack: state.stack.filter((entry) => entry.id !== id) })),
}));

/**
 * Declarative registration: the overlay shows while `active`, and backdrop/Esc call `onClose`.
 * @public
 */
export function useSpotlight(id: string, active: boolean, onClose: () => void) {
  const handleClose = useLatestCallback(onClose);
  useEffect(() => {
    if (!active) return;
    useSpotlighter.getState().open({ id, onClose: handleClose });
    return () => useSpotlighter.getState().close(id);
  }, [id, active, handleClose]);
}

/**
 * Raises an element above the overlay. Apply to the outermost element of the spotlit region.
 * @public
 */
export const spotlightLift = tw('relative z-111');

/**
 * Lift for a row inside a virtualized list: virtua's row wrappers have `contain: layout style`
 * (their own stacking context), so the z-index must land on the wrapper itself. The wrapper is
 * render-owned by virtua, so the row marks itself and a global rule (styling/tailwind.css) climbs
 * one level with `:has(>)`.
 * @public
 */
export const spotlightLiftRow = 'spotlight-lift-row';

export { useSpotlighter as spotlighter };
