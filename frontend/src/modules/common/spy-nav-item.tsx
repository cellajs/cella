import { Link } from '@tanstack/react-router';
import { motion } from 'motion/react';
import type { CSSProperties, ReactNode } from 'react';
import { scrollToSectionById } from '~/hooks/scroll-spy-store';
import { Button } from '~/modules/ui/button';
import { cn } from '~/utils/cn';

interface IndicatorBarProps {
  /** Shared by the bars of one list, so the bar springs from row to row. */
  layoutId: string;
  animate?: boolean;
  className?: string;
  style?: CSSProperties;
}

// The bar springs from row to row and settles without a bounce
const barSpring = { type: 'spring', stiffness: 300, damping: 30, mass: 0.8 } as const;

/** Bar that marks the active row of a section list. */
export function IndicatorBar({ layoutId, animate = true, className, style }: IndicatorBarProps) {
  const barClassName = cn('bg-primary absolute left-2 ml-px w-[0.20rem] rounded-full', className);
  if (!animate) return <span className={barClassName} style={style} />;

  return <motion.span layoutId={layoutId} transition={barSpring} className={barClassName} style={style} />;
}

// Tailwind reads group names from literal class strings
const groupClassNames = {
  toc: { row: 'group/toc', active: 'group-data-spy-active/toc:text-foreground' },
  section: { row: 'group/section', active: 'group-data-spy-active/section:text-foreground' },
};

interface SpyNavItemProps {
  /** Section id. */
  id: string;
  isActive: boolean;
  layoutId: string;
  group: keyof typeof groupClassNames;
  staticIndicator?: boolean;
  className?: string;
  children: ReactNode;
}

/** Row of a scroll-spy aside: the scroll spy marks it through data-spy-link, and a click scrolls to its section. */
export function SpyNavItem({ id, isActive, layoutId, group, staticIndicator, className, children }: SpyNavItemProps) {
  const groupClassName = groupClassNames[group];

  return (
    <div className={cn(groupClassName.row, 'relative')} data-spy-link={id} data-active={isActive}>
      {isActive && <IndicatorBar layoutId={layoutId} animate={!staticIndicator} className="top-2 bottom-2" />}
      <Button
        variant="ghost"
        size="sm"
        className={cn(
          'focus-inset text-muted-foreground h-auto min-h-8 w-full justify-start gap-2 py-1.5 text-left font-normal whitespace-normal',
          groupClassName.active,
          className,
        )}
        render={
          <Link
            to="."
            hash={id}
            replace
            onClick={(event) => {
              if (event.metaKey || event.ctrlKey) return;
              event.preventDefault();
              scrollToSectionById(id);
            }}
          />
        }
      >
        <span className="line-clamp-2 text-sm">{children}</span>
      </Button>
    </div>
  );
}
