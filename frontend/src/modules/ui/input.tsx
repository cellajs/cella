import type * as React from 'react';
import { cn } from '~/utils/cn';
import { tw } from '~/utils/tw';

/** The text field frame Input and Textarea share. */
export const inputClass = tw(
  'focus-effect w-full rounded-md border border-input bg-background px-3 py-2 text-md outline-hidden transition-[color,box-shadow] selection:bg-primary selection:text-primary-foreground placeholder:text-faint-foreground disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive sm:text-sm',
);

/** Spread on a field that takes someone else's address or a search: 1Password, LastPass and NordPass then add no icon or hidden markup beside it. */
export const skipPasswordManagers = { 'data-1p-ignore': true, 'data-lpignore': 'true', 'data-np-skip': true } as const;

export function Input({ className, type, ...props }: React.ComponentProps<'input'>) {
  return <input type={type} data-slot="input" className={cn(inputClass, 'h-10 min-w-0 disabled:pointer-events-none', className)} {...props} />;
}
