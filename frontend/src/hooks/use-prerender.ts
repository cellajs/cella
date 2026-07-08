import type { CSSProperties } from 'react';
import { useRef } from 'react';
import { create } from 'zustand';

interface PrerenderState {
  /** Prerender target by scope, one section per scope. */
  targets: Record<string, string | undefined>;
  /** Set prerender target for a scope. Pass undefined to clear. */
  setTarget: (scope: string, sectionId: string | undefined) => void;
}

const usePrerenderStore = create<PrerenderState>((set) => ({
  targets: {},
  setTarget: (scope, sectionId) =>
    set((state) => {
      if (state.targets[scope] === sectionId) return state;
      return { targets: { ...state.targets, [scope]: sectionId } };
    }),
}));

/** Hides prerendered content from layout and paint until it is opened. */
const hiddenStyle: CSSProperties = {
  contentVisibility: 'hidden',
  height: 0,
  overflow: 'hidden',
};

/**
 * Check if a section should be mounted and get its visibility style.
 * Prerendered sections mount hidden so later expansion is instant.
 */
export function usePrerenderSection(scope: string, sectionId: string, isOpen: boolean) {
  const isPrerendered = usePrerenderStore((s) => s.targets[scope] === sectionId);
  const shouldMount = isOpen || isPrerendered;
  const style = shouldMount && !isOpen ? hiddenStyle : undefined;

  return { shouldMount, style };
}

/**
 * Get a prerender trigger for a scope.
 * Debounces DOM mounting to avoid churn during quick scrolling.
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
