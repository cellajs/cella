import { cn } from '~/utils/cn';

export function Skeleton({ className, ...props }: React.ComponentProps<'div'>) {
  return <div data-slot="skeleton" className={cn('animate-pulse rounded-md bg-accent/50', className)} {...props} />;
}
