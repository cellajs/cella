import { Radio } from '@base-ui/react/radio';
import { RadioGroup as RadioGroupPrimitive } from '@base-ui/react/radio-group';
import { CircleIcon } from 'lucide-react';
import * as React from 'react';
import { cn } from '~/utils/cn';

export function RadioGroup({ className, ...props }: React.ComponentProps<typeof RadioGroupPrimitive>) {
  return <RadioGroupPrimitive data-slot="radio-group" className={cn('grid gap-3', className)} {...props} />;
}

export function RadioGroupItem({ className, ...props }: React.ComponentProps<typeof Radio.Root>) {
  return (
    <Radio.Root
      data-slot="radio-group-item"
      className={cn(
        'border-input text-primary focus-visible:border-ring focus-visible:ring-ring aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive aspect-square size-4 shrink-0 rounded-full border shadow-xs transition-[color,box-shadow] outline-none focus-visible:ring-2 disabled:cursor-not-allowed disabled:opacity-50',
        className,
      )}
      {...props}
    >
      <Radio.Indicator data-slot="radio-group-indicator" className="relative flex items-center justify-center">
        <CircleIcon className="fill-primary absolute top-1/2 left-1/2 size-2 -translate-x-1/2 -translate-y-1/2" />
      </Radio.Indicator>
    </Radio.Root>
  );
}
