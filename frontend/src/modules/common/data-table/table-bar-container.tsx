import { type ReactNode, type RefObject, useEffect, useRef } from 'react';
import { useScrollReset } from '~/modules/common/scroll-reset';
import { scrollToPinLine, useStackedPin } from '~/modules/common/sticky-box';
import { cn } from '~/utils/cn';

interface TableBarContainerProps {
  children: ReactNode;
  className?: string;
  searchVars?: Record<string, unknown>;
  /** Pins the bar under the sticky stack, as the open search on a phone does. */
  pinned?: boolean;
  ref?: RefObject<HTMLDivElement | null>;
}

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
    <div
      ref={barRef}
      style={pinStyle}
      className={cn('flex items-center gap-2 py-2 max-sm:justify-between', pinned && 'z-70 bg-background', className)}
    >
      {children}
    </div>
  );
}
