import { Link } from '@tanstack/react-router';
import { motion } from 'motion/react';
import type { CSSProperties, ReactNode } from 'react';
import { scrollToSectionById } from '~/hooks/use-scroll-spy-store';
import { Button } from '~/modules/ui/button';
import { cn } from '~/utils/cn';

interface IndicatorBarProps {
  /** Shared by the bars of one list, so the bar springs from row to row. */
  layoutId: string;
  /** False renders a static bar. */
  animate?: boolean;
  className?: string;
  style?: CSSProperties;
}

/** Bar that marks the active row of a section list. */
export function IndicatorBar({ layoutId, animate = true, className, style }: IndicatorBarProps) {
  const barClassName = cn('absolute left-2 ml-px w-[0.20rem] rounded-full bg-primary', className);
  if (!animate) return <span className={barClassName} style={style} />;

  return (
    <motion.span layoutId={layoutId} transition={{ type: 'spring', stiffness: 300, damping: 30, mass: 0.8 }} className={barClassName} style={style} />
  );
}

// Tailwind reads group names from literal class strings
const groupClassNames = {
  toc: { row: 'group/toc', active: 'group-data-spy-active/toc:opacity-100' },
  section: { row: 'group/section', active: 'group-data-spy-active/section:opacity-100' },
};

interface SpyNavItemProps {
  /** Section id: link hash and data-spy-link target. */
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
        className={cn('h-8 w-full justify-start gap-2 text-left font-normal text-sm opacity-75 hover:bg-accent/50', groupClassName.active, className)}
        render={
          <Link
            to="."
            hash={id}
            replace
            draggable={false}
            onClick={(e) => {
              if (e.metaKey || e.ctrlKey) return;
              e.preventDefault();
              scrollToSectionById(id);
            }}
          />
        }
      >
        <span className="truncate text-sm">{children}</span>
      </Button>
    </div>
  );
}
