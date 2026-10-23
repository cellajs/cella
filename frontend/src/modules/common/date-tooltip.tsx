import type { ReactNode } from 'react';
import { TooltipButton } from '~/modules/common/tooltip-button';
import { dateFull } from '~/utils/date-full';

interface DateTooltipProps {
  date?: string | null | Date;
  children: ReactNode;
  className?: string;
  side?: 'top' | 'bottom' | 'left' | 'right';
}

/** A timestamp (timeago or short date) in a span that shows the exact date and time on hover; the span is the only box it adds. */
export function DateTooltip({ date, children, className, side = 'bottom' }: DateTooltipProps) {
  const content = dateFull(date);
  if (!content) return <span className={className}>{children}</span>;

  return (
    <TooltipButton toolTipContent={content} side={side}>
      <span className={className}>{children}</span>
    </TooltipButton>
  );
}
