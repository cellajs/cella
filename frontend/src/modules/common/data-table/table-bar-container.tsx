import { type ReactNode, useEffect, useRef } from 'react';
import { useScrollReset } from '~/modules/common/scroll-reset';
import { cn } from '~/utils/cn';

interface TableBarContainerProps {
  children: ReactNode;
  className?: string;
  searchVars?: Record<string, unknown>;
}

/** Row above a data table holding its filters and actions. Scrolls back to the top whenever the search vars change. */
export function TableBarContainer({ children, className, searchVars }: TableBarContainerProps) {
  const scrollToReset = useScrollReset();

  const isInitialRender = useRef(true);
  const serialized = searchVars ? JSON.stringify(searchVars) : undefined;

  useEffect(() => {
    if (isInitialRender.current) {
      isInitialRender.current = false;
      return;
    }
    scrollToReset();
  }, [serialized]);

  return <div className={cn('flex items-center py-2 max-sm:justify-between md:gap-2', className)}>{children}</div>;
}
