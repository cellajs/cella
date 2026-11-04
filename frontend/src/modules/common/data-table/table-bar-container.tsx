import { type ReactNode, useEffect, useRef } from 'react';
import { useScrollReset } from '~/modules/common/scroll-reset';
import { scrollToPinLine, useStackedPin } from '~/modules/common/sticky-box';
import { cn } from '~/utils/cn';
import { tw } from '~/utils/tw';

interface TableBarContainerProps {
  children: ReactNode;
  className?: string;
  searchVars?: Record<string, unknown>;
  /** Pins the bar under the sticky stack, below the tab nav (z-80) */
  pinned?: boolean;
}

// Its fill reaches the screen edges (the body clips the overflow), so what it covers neither shows nor takes a tap beside it
const pinnedClass = tw(
  'bg-background before:bg-background z-70 before:absolute before:-inset-x-[100vmax] before:inset-y-0 before:-z-10 before:border-b',
);

/** Row above a data table holding its filters and actions. Scrolls back to the top whenever the search vars change. */
export function TableBarContainer({ children, className, searchVars, pinned = false }: TableBarContainerProps) {
  const scrollToReset = useScrollReset();
  const barRef = useRef<HTMLDivElement>(null);
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
