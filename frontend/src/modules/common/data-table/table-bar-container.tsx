import { type ReactNode, type RefObject, useEffect, useRef } from 'react';
import { useScrollReset } from '~/modules/common/scroll-reset';
import { scrollToPinLine, useStackedPin } from '~/modules/common/sticky-box';
import { cn } from '~/utils/cn';
import { tw } from '~/utils/tw';

interface TableBarContainerProps {
  children: ReactNode;
  className?: string;
  searchVars?: Record<string, unknown>;
  /** Pins the bar at the top over the sticky stack, as the open search on a phone does: above the tab nav (z-80). */
  pinned?: boolean;
  ref?: RefObject<HTMLDivElement | null>;
}

// Pinned, its fill and bottom edge reach past the page gutters to the screen edges (the body clips the overflow), so what
// it covers neither shows nor takes a tap beside it
const pinnedClass = tw(
  'z-90 bg-background before:absolute before:-inset-x-[100vmax] before:inset-y-0 before:-z-10 before:border-b before:bg-background',
);

/** Row above a data table holding its filters and actions. Scrolls back to the top whenever the search vars change. */
export function TableBarContainer({ children, className, searchVars, pinned = false, ref }: TableBarContainerProps) {
  const scrollToReset = useScrollReset();
  const ownRef = useRef<HTMLDivElement>(null);
  const barRef = ref ?? ownRef;
  const pinStyle = useStackedPin(barRef, pinned);

  const isInitialRenderRef = useRef(true);
  const serialized = searchVars ? JSON.stringify(searchVars) : undefined;

  useEffect(() => {
    if (isInitialRenderRef.current) {
      isInitialRenderRef.current = false;
      return;
    }
    scrollToReset();
    // The reset lands a step above a pinned bar's own place, which would leave a gap under the stack
    if (pinned && barRef.current) scrollToPinLine(barRef.current);
  }, [serialized]);

  return (
    <div ref={barRef} style={pinStyle} className={cn('flex items-center gap-2 py-2 max-sm:justify-between', pinned && pinnedClass, className)}>
      {children}
    </div>
  );
}
