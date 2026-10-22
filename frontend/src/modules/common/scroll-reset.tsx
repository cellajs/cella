import { useRouter } from '@tanstack/react-router';
import { createContext, type ReactNode, useContext, useRef } from 'react';

const ScrollResetContext = createContext<(() => void) | null>(null);

interface ScrollResetProps {
  children: ReactNode;
}

/**
 * Zero-height sentinel in document flow; any descendant calls `useScrollReset()` to scroll back to it.
 * Nestable. An inner `ScrollReset` overrides the outer context.
 */
export function ScrollReset({ children }: ScrollResetProps) {
  const sentinelRef = useRef<HTMLDivElement>(null);

  const scrollToReset = () => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return;
    const rect = sentinel.getBoundingClientRect();
    if (rect.top < 0) {
      window.scrollTo({ top: Math.floor(window.scrollY + rect.top), behavior: 'instant' });
    }
  };

  return (
    <ScrollResetContext.Provider value={scrollToReset}>
      <div ref={sentinelRef} className="h-0" aria-hidden />
      <div className="min-h-svh">{children}</div>
    </ScrollResetContext.Provider>
  );
}

/** Returns `scrollToReset` from the nearest `ScrollReset` ancestor, or a no-op. */
export const useScrollReset = () => useContext(ScrollResetContext) ?? (() => {});

/**
 * Click handler for a link that navigates with `resetScroll={false}`, such as a tab: scrolls back to the sentinel once
 * the route the click leads to has rendered. Never at the click itself: the router records the scroll position of the
 * page being left when the load starts, and history back returns to what it recorded.
 */
export function useScrollResetOnNavigate() {
  const scrollToReset = useScrollReset();
  const router = useRouter();

  return () => {
    // The link navigates within this click, so a load that starts before the click ends is its own. A click that
    // does not navigate (modifier key held) leaves nothing subscribed.
    let key: string | undefined;
    const stopWatching = router.subscribe('onBeforeLoad', ({ toLocation }) => {
      key = toLocation.state.__TSR_key;
    });
    queueMicrotask(() => {
      stopWatching();
      if (!key) return;
      const stopWaiting = router.subscribe('onRendered', ({ toLocation }) => {
        stopWaiting();
        // Another navigation can overtake this one; a history back among them restores its own position.
        if (toLocation.state.__TSR_key === key) scrollToReset();
      });
    });
  };
}
