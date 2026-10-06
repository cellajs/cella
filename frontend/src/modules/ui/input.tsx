import type * as React from 'react';
import { cn } from '~/utils/cn';
import { tw } from '~/utils/tw';

/** @public */
export const inputClass = tw(
  'focus-effect h-10 w-full min-w-0 rounded-md border border-input bg-background px-3 py-2 text-md shadow-xs outline-hidden transition-[color,box-shadow] selection:bg-primary selection:text-primary-foreground placeholder:text-muted-foreground disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-destructive/20 sm:text-sm dark:aria-invalid:ring-destructive/40',
);

export function Input({ className, type, ...props }: React.ComponentProps<'input'>) {
  return <input type={type} data-slot="input" className={cn(inputClass, className)} {...props} />;
}
