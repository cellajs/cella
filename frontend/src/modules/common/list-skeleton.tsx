import { Skeleton } from '~/modules/ui/skeleton';
import { cn } from '~/utils/cn';

/** Stacked card placeholders for card lists while their query is pending, so an empty state never flashes first. */
export function ListSkeleton({ className }: { className?: string }) {
  return (
    <div className={cn('mount-fade flex flex-col gap-4 duration-300', className)}>
      {Array.from({ length: 3 }).map((_, index) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: static keys are fine here as this is a skeleton
        <Skeleton key={index} className="w-full rounded-lg" style={{ height: 160 }} />
      ))}
    </div>
  );
}
