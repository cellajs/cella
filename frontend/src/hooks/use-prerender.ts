import type { CSSProperties } from 'react';
import { useRef } from 'react';
import { create } from 'zustand';

/**
 * Prerender store — manages intent-based DOM prerendering.
 *
 * Tracks a single prerender target per scope (e.g., 'operations', 'schemas').
 * When a user hovers/focuses on a section trigger (table row, sidebar tag),
 * the target is set so the page can mount that section's content with
 * `content-visibility: hidden` — making subsequent expansion instant.
 *
 * Only one target per scope at a time to limit DOM weight.
 */

interface PrerenderState {
  /** scope → sectionId (one prerendered section per scope) */
  targets: Record<string, string | undefined>;
  /** Set prerender target for a scope. Pass undefined to clear. */
  setTarget: (scope: string, sectionId: string | undefined) => void;
}

export const usePrerenderStore = create<PrerenderState>((set) => ({
  targets: {},
  setTarget: (scope, sectionId) =>
    set((state) => {
      if (state.targets[scope] === sectionId) return state;
      return { targets: { ...state.targets, [scope]: sectionId } };
    }),
}));

/** CSS style to apply when section is prerendered but not yet visible.
 * content-visibility: hidden keeps DOM accessible but skips paint/layout.
 * height: 0 + overflow: hidden ensures zero layout space is reserved. */
const hiddenStyle: CSSProperties = {
  contentVisibility: 'hidden',
  height: 0,
  overflow: 'hidden',
};

/**
 * Check if a section should be mounted and get its visibility style.
 * Returns shouldMount=true when section is either open OR prerendered.
 * Returns hiddenStyle only when prerendered but not open.
 */
export function usePrerenderSection(scope: string, sectionId: string, isOpen: boolean) {
  const isPrerendered = usePrerenderStore((s) => s.targets[scope] === sectionId);
  const shouldMount = isOpen || isPrerendered;
  const style = shouldMount && !isOpen ? hiddenStyle : undefined;

  return { shouldMount, style };
}

/**
 * Get a prerender trigger for a scope.
 * Call prerender(sectionId) on hover/focus to prepare DOM.
 * DOM mount is debounced (150ms) to avoid churn during quick scrolling.
 * Data prefetching should happen separately (immediately) at the call site.
 */
export function usePrerenderTrigger(scope: string) {
  const setTarget = usePrerenderStore((s) => s.setTarget);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const prerender = (sectionId: string) => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setTarget(scope, sectionId), 150);
  };

  const clear = () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = null;
    setTarget(scope, undefined);
  };

  return { prerender, clear };
}
