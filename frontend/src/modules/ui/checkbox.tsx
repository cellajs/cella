import { Checkbox as CheckboxPrimitive } from '@base-ui/react/checkbox';
import { CheckIcon, MinusIcon } from 'lucide-react';
import type * as React from 'react';
import { cn } from '~/utils/cn';

/** Pass `indeterminate` for a mixed state (e.g. "select all" with some rows selected): it shows a minus and reads as mixed. */
export function Checkbox({ className, ...props }: React.ComponentProps<typeof CheckboxPrimitive.Root>) {
  return (
    <CheckboxPrimitive.Root
      data-slot="checkbox"
      className={cn(
        // Transparent ::before extends the hit area just past the 4px focus/selection ring so edge clicks register.
        'peer focus-effect relative inline-flex size-5 shrink-0 items-center justify-center rounded-[4px] border border-input shadow-xs transition-shadow before:absolute before:-inset-1.25 before:content-[""] aria-invalid:border-destructive aria-invalid:ring-destructive/20 data-disabled:cursor-not-allowed data-checked:border-primary data-indeterminate:border-primary data-checked:bg-primary data-disabled:bg-muted data-indeterminate:bg-primary data-checked:text-primary-foreground data-indeterminate:text-primary-foreground data-disabled:opacity-50 dark:aria-invalid:ring-destructive/40',
        className,
      )}
      {...props}
    >
      <CheckboxPrimitive.Indicator data-slot="checkbox-indicator" className="flex items-center justify-center text-current transition-none">
        <CheckIcon className="in-data-indeterminate:hidden size-4" />
        <MinusIcon className="in-data-indeterminate:block hidden size-4" />
      </CheckboxPrimitive.Indicator>
    </CheckboxPrimitive.Root>
  );
}
