import type * as React from 'react';
import { cn } from '~/utils/cn';
import { tw } from '~/utils/tw';

/** The text field frame Input and Textarea share. */
export const inputClass = tw(
  'focus-effect w-full rounded-md border border-input field-hover:border-input-hover bg-background px-3 py-2 text-md outline-hidden transition-[color,box-shadow] selection:bg-primary selection:text-primary-foreground placeholder:text-faint-foreground disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive sm:text-sm',
);

export function Input({ className, type, ...props }: React.ComponentProps<'input'>) {
  return <input type={type} data-slot="input" className={cn(inputClass, 'h-10 min-w-0 disabled:pointer-events-none', className)} {...props} />;
}
