import type { ReactNode } from 'react';
import { TooltipButton } from '~/modules/common/tooltip-button';
import { dateFull } from '~/utils/date-full';

interface DateTooltipProps {
  date?: string | null | Date;
  children: ReactNode;
  className?: string;
  side?: 'top' | 'bottom' | 'left' | 'right';
}

/**
 * Wraps a rendered timestamp (a timeago or shortened date) so hovering reveals the exact date and
 * time. The trigger span is the tooltip trigger itself, so no extra layout box is introduced beyond
 * the span callers already rendered around their date text.
 */
export function DateTooltip({ date, children, className, side = 'bottom' }: DateTooltipProps) {
  const content = dateFull(date);
  if (!content) return <span className={className}>{children}</span>;

  return (
    <TooltipButton toolTipContent={content} side={side}>
      <span className={className}>{children}</span>
    </TooltipButton>
  );
}
