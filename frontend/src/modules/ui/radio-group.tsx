import { Radio } from '@base-ui/react/radio';
import { RadioGroup as RadioGroupPrimitive } from '@base-ui/react/radio-group';
import { CircleIcon } from 'lucide-react';
import { cn } from '~/utils/cn';

export function RadioGroup<Value>({ className, ...props }: RadioGroupPrimitive.Props<Value>) {
  return <RadioGroupPrimitive data-slot="radio-group" className={cn('grid gap-3', className)} {...props} />;
}

export function RadioGroupItem({ className, ...props }: Radio.Root.Props) {
  return (
    <Radio.Root
      data-slot="radio-group-item"
      className={cn(
        'focus-effect relative inline-flex aspect-square size-4 shrink-0 rounded-full border border-input field-hover:border-input-hover text-primary transition-[color,box-shadow] aria-invalid:border-destructive data-disabled:cursor-not-allowed data-disabled:opacity-50',
        className,
      )}
      {...props}
    >
      <Radio.Indicator data-slot="radio-group-indicator" className="relative flex size-full items-center justify-center">
        <CircleIcon className="absolute top-1/2 left-1/2 size-2 -translate-x-1/2 -translate-y-1/2 fill-primary" />
      </Radio.Indicator>
    </Radio.Root>
  );
}
