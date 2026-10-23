import type { ReactNode } from 'react';
import { cn } from '~/utils/cn';

interface PanelHeadingProps {
  children: ReactNode;
  className?: string;
}

/** The muted lowercase heading over a block in a nav sheet panel. */
export function PanelHeading({ children, className }: PanelHeadingProps) {
  return <h3 className={cn('font-medium text-muted-foreground text-sm lowercase', className)}>{children}</h3>;
}
