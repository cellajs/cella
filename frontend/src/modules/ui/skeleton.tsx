import { cn } from '~/utils/cn';

export function Skeleton({ className, ...props }: React.ComponentProps<'div'>) {
  return <div data-slot="skeleton" className={cn('bg-accent/50 animate-pulse rounded-md', className)} {...props} />;
}
