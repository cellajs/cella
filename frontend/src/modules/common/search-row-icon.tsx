import type { ReactNode } from 'react';
import { cn } from '~/utils/cn';

interface SearchRowIconProps {
  /** Empty keeps the column, for a row without a mark. */
  children?: ReactNode;
  className?: string;
}

/** A search row's leading mark in a fixed slot the field's icon lines up with; a list with larger marks sets --search-icon-size. */
export function SearchRowIcon({ children, className }: SearchRowIconProps) {
  return <span className={cn('flex w-(--search-icon-size,1rem) shrink-0 items-center justify-center', className)}>{children}</span>;
}
