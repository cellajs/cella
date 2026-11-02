import type { ReactNode } from 'react';
import { cn } from '~/utils/cn';

interface SearchRowIconProps {
  /** Empty keeps the column, for a row without a mark. */
  children?: ReactNode;
  className?: string;
}

/**
 * A search row's leading mark, centered in a fixed slot: marks of any size share one axis, and the text one column. The
 * field lines its own icon and text up with these; a list whose marks are larger sets --search-icon-size.
 */
export function SearchRowIcon({ children, className }: SearchRowIconProps) {
  return <span className={cn('flex w-(--search-icon-size,1rem) shrink-0 items-center justify-center', className)}>{children}</span>;
}
