import type * as React from 'react';
import { cn } from '~/utils/cn';

/** Drops the default focus ring and shadow: the grid cell draws focus, and the input stays flush with it. */
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
