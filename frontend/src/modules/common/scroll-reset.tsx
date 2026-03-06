import { createContext, type ReactNode, useContext, useRef } from 'react';

const ScrollResetContext = createContext<(() => void) | null>(null);

/**
 * Wraps a scroll region with a zero-height sentinel in normal document flow.
 * Any descendant can call `useScrollReset()` to scroll back to this point.
 * Nestable — an inner `ScrollReset` overrides the outer context.
 */
export const ScrollReset = ({ children }: { children: ReactNode }) => {
  const ref = useRef<HTMLDivElement>(null);

  const scrollToReset = () => {
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    // Only scroll when sentinel is above the viewport (user scrolled past it)
    if (rect.top < 0) {
      window.scrollTo({ top: Math.floor(window.scrollY + rect.top), behavior: 'instant' });
    }
  };

  return (
    <ScrollResetContext.Provider value={scrollToReset}>
      <div ref={ref} className="h-0" aria-hidden />
      <div className="min-h-screen">{children}</div>
    </ScrollResetContext.Provider>
  );
};

/** Returns `scrollToReset` from the nearest `ScrollReset` ancestor, or a no-op. */
export const useScrollReset = () => useContext(ScrollResetContext) ?? (() => {});
