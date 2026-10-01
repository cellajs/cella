import { Progress as ProgressPrimitive } from '@base-ui/react/progress';
import type * as React from 'react';
import { cn } from '~/utils/cn';

export function Progress({
  className,
  value,
  ...props
}: React.ComponentProps<typeof ProgressPrimitive.Root> & { value?: number }) {
  return (
    <ProgressPrimitive.Root
      data-slot="progress"
      value={value}
      className={cn('relative h-2 w-full overflow-hidden rounded-full bg-primary/20', className)}
      {...props}
    >
      <ProgressPrimitive.Indicator data-slot="progress-indicator" className="h-full bg-primary transition-all" />
    </ProgressPrimitive.Root>
  );
}
