import { useMountedState } from '~/hooks/use-mounted-state';
import { Skeleton } from '~/modules/ui/skeleton';
import { cn } from '~/utils/cn';

interface ListSkeletonProps {
  /** Number of placeholder cards (default: 3) */
  count?: number;
  /** Approximate height of each card in px (default: 160) */
  cardHeight?: number;
  className?: string;
}

/** Stacked card placeholders for card lists while their query is pending, so an empty state never flashes first. */
export function ListSkeleton({ count = 3, cardHeight = 160, className }: ListSkeletonProps) {
  const { hasStarted } = useMountedState();

  return (
    <div
      className={cn(
        'flex flex-col gap-4 transition-opacity duration-300',
        hasStarted ? 'opacity-100' : 'opacity-0',
        className,
      )}
    >
      {Array.from({ length: count }).map((_, index) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: static keys are fine here as this is a skeleton
        <Skeleton key={index} className="w-full rounded-lg" style={{ height: `${cardHeight}px` }} />
      ))}
    </div>
  );
}
