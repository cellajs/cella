import { Progress as ProgressPrimitive } from '@base-ui/react/progress';
import { cn } from '~/utils/cn';

export function Progress({ className, value, ...props }: ProgressPrimitive.Root.Props & { value?: number }) {
  return (
    <ProgressPrimitive.Root
      data-slot="progress"
      value={value}
      className={cn('bg-primary/20 relative h-2 w-full overflow-hidden rounded-full', className)}
      {...props}
    >
      <ProgressPrimitive.Indicator data-slot="progress-indicator" className="bg-primary h-full transition-all" />
    </ProgressPrimitive.Root>
  );
}
