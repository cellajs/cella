import { cn } from '~/utils/cn';

/** A placeholder for content on its way. A group of them fades in from the first frame (`fade-in animate-in duration-300`), without the wait a spinner has. */
export function Skeleton({ className, ...props }: React.ComponentProps<'div'>) {
  return <div data-slot="skeleton" className={cn('bg-accent/50 animate-pulse rounded-md', className)} {...props} />;
}
