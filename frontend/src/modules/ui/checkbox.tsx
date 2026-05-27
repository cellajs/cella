import { Checkbox as CheckboxPrimitive } from '@base-ui/react/checkbox';
import { CheckIcon } from 'lucide-react';
import type * as React from 'react';
import { cn } from '~/utils/cn';

export function Checkbox({ className, ...props }: React.ComponentProps<typeof CheckboxPrimitive.Root>) {
  return (
    <CheckboxPrimitive.Root
      data-slot="checkbox"
      className={cn(
        'peer focus-effect size-5 shrink-0 rounded-[4px] border border-input shadow-xs transition-shadow aria-invalid:border-destructive aria-invalid:ring-destructive/20 data-disabled:cursor-not-allowed data-checked:border-primary data-checked:bg-primary data-disabled:bg-muted data-checked:text-primary-foreground data-disabled:opacity-50 dark:aria-invalid:ring-destructive/40',
        className,
      )}
      {...props}
    >
      <CheckboxPrimitive.Indicator
        data-slot="checkbox-indicator"
        className="flex items-center justify-center text-current transition-none"
      >
        <CheckIcon className="mt-px size-4" />
      </CheckboxPrimitive.Indicator>
    </CheckboxPrimitive.Root>
  );
}
