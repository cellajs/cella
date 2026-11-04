import type * as React from 'react';
import { cn } from '~/utils/cn';
import { tw } from '~/utils/tw';

/** The text field frame Input and Textarea share. */
export const inputClass = tw(
  'focus-effect border-input bg-background text-md selection:bg-primary selection:text-primary-foreground placeholder:text-faint-foreground aria-invalid:border-destructive w-full rounded-md border px-3 py-2 outline-hidden transition-[color,box-shadow] disabled:cursor-not-allowed disabled:opacity-50 sm:text-sm',
);

/** Spread on a field that takes someone else's address or a search: 1Password, LastPass and NordPass then add no icon or hidden markup beside it. */
export const skipPasswordManagers = { 'data-1p-ignore': true, 'data-lpignore': 'true', 'data-np-skip': true } as const;

export function Input({ className, type, ...props }: React.ComponentProps<'input'>) {
  return <input type={type} data-slot="input" className={cn(inputClass, 'h-10 min-w-0 disabled:pointer-events-none', className)} {...props} />;
}
