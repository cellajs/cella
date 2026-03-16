import { type ReactNode, useEffect, useRef } from 'react';
import { useScrollReset } from '~/modules/common/scroll-reset';
import { useUIStore } from '~/store/ui';
import { cn } from '~/utils/cn';
import { StickyBox } from '../sticky-box';

interface TableBarContainerProps {
  children: ReactNode;
  className?: string;
  enableSticky?: boolean;
  offsetTop?: number;
  searchVars?: Record<string, unknown>;
}

export const TableBarContainer = ({
  children,
  className,
  enableSticky = false,
  offsetTop,
  searchVars,
}: TableBarContainerProps) => {
  const focusView = useUIStore((state) => state.focusView);
  const scrollToReset = useScrollReset();

  const isInitialRender = useRef(true);
  const serialized = searchVars ? JSON.stringify(searchVars) : undefined;

  // Scroll table area into view when search/filter params change
  useEffect(() => {
    if (isInitialRender.current) {
      isInitialRender.current = false;
      return;
    }
    scrollToReset();
  }, [serialized]);

  return (
    <StickyBox
      enabled={enableSticky}
      className="group/sticky z-10 bg-background/60 backdrop-blur-xs max-sm:static! max-sm:top-auto!"
      offsetTop={focusView ? 0 : offsetTop}
      hideWhenOutOfView
    >
      <div className={cn('flex items-center max-sm:justify-between md:gap-2 py-2', className)}>{children}</div>
    </StickyBox>
  );
};
