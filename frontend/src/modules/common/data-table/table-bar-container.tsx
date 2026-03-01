import { type ReactNode, useEffect, useRef } from 'react';
import { useUIStore } from '~/store/ui';
import { cn } from '~/utils/cn';
import { scrollToNearestTarget } from '~/utils/scroll-to-target';
import { StickyBox } from '../sticky-box';

interface TableBarContainerProps {
  children: ReactNode;
  className?: string;
  /** Sticky offset (px) when not in focus view. Use 36 to account for PageNav. */
  offsetTop?: number;
  /** When provided, scroll the table area into view on any search/filter change */
  searchVars?: Record<string, unknown>;
}

export const TableBarContainer = ({ children, className, offsetTop, searchVars }: TableBarContainerProps) => {
  const focusView = useUIStore((state) => state.focusView);

  const containerRef = useRef<HTMLDivElement>(null);
  const isInitialRender = useRef(true);
  const serialized = searchVars ? JSON.stringify(searchVars) : undefined;

  // Scroll table area into view when search/filter params change
  useEffect(() => {
    if (isInitialRender.current) {
      isInitialRender.current = false;
      return;
    }
    if (containerRef.current) scrollToNearestTarget(containerRef.current);
  }, [serialized]);

  return (
    <StickyBox
      className="group/sticky z-10 bg-background/60 backdrop-blur-xs pb-2 max-sm:static! max-sm:top-auto!"
      offsetTop={focusView ? 0 : offsetTop}
      hideWhenOutOfView
    >
      <div
        ref={containerRef}
        className={cn(
          'flex items-center max-sm:justify-between md:gap-2 mt-4 group-data-[sticky=true]/sticky:mt-2',
          className,
        )}
      >
        {children}
      </div>
    </StickyBox>
  );
};
