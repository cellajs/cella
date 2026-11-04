import { Checkbox as CheckboxPrimitive } from '@base-ui/react/checkbox';
import { CheckIcon, MinusIcon } from 'lucide-react';
import { cn } from '~/utils/cn';

/** Pass `indeterminate` for a mixed state (e.g. "select all" with some rows selected): it shows a minus and reads as mixed. */
export function Checkbox({ className, ...props }: CheckboxPrimitive.Root.Props) {
  return (
    <CheckboxPrimitive.Root
      data-slot="checkbox"
      className={cn(
        // Transparent ::before extends the hit area just past the 4px focus/selection ring so edge clicks register.
        // Opaque fill: on a hovered row a see-through box takes the row's muted fill, which is how a disabled checkbox looks.
        'peer focus-effect border-input field-hover:border-input-hover bg-background aria-invalid:border-destructive data-checked:border-primary data-indeterminate:border-primary data-checked:bg-primary data-disabled:bg-muted data-indeterminate:bg-primary data-checked:text-primary-foreground data-indeterminate:text-primary-foreground relative inline-flex size-5 shrink-0 items-center justify-center rounded-[4px] border transition-shadow before:absolute before:-inset-1.25 data-disabled:cursor-not-allowed data-disabled:opacity-50',
        className,
      )}
      {...props}
    >
      <CheckboxPrimitive.Indicator data-slot="checkbox-indicator" className="flex items-center justify-center text-current transition-none">
        <CheckIcon className="size-4 in-data-indeterminate:hidden" />
        <MinusIcon className="hidden size-4 in-data-indeterminate:block" />
      </CheckboxPrimitive.Indicator>
    </CheckboxPrimitive.Root>
  );
}
