import type * as React from 'react';
import { cn } from '~/utils/cn';

/**
 * Strips the default focus ring/shadow since the grid cell already provides
 * its own focus styling, and keeps the input flush with the cell.
 */
export function EditCellInput({ className, type, ...props }: React.ComponentProps<'input'>) {
  return (
    <input
      type={type}
      data-slot="edit-cell-input"
      className={cn(
        'h-full w-full min-w-0 bg-transparent px-3 text-sm outline-none placeholder:text-muted-foreground',
        'selection:bg-primary selection:text-primary-foreground',
        'disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50',
        className,
      )}
      {...props}
    />
  );
}
