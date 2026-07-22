import { useMountedState } from '~/hooks/use-mounted-state';
import { Skeleton } from '~/modules/ui/skeleton';

interface EntityGridSkeletonProps {
  /** Approximate height of each tile in px (default: 180, matching ChannelGridTile) */
  tileHeight?: number;
}

/**
 * Renders a loading skeleton for the entity grid.
 * Pass `tileHeight` to match the approximate height of the real tile component.
 */
export function EntityGridSkeleton({ tileHeight = 180 }: EntityGridSkeletonProps) {
  const { hasStarted } = useMountedState();

  return (
    <div
      className={`transition-opacity duration-300 ${hasStarted ? 'opacity-100' : 'opacity-0'} mb-12 grid grid-cols-1 gap-6 sm:grid-cols-1 md:grid-cols-2 lg:grid-cols-[repeat(auto-fit,minmax(330px,1fr))]`}
    >
      {Array.from({ length: 6 }).map((_, index) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: static keys are fine here as this is a skeleton
        <Skeleton key={index} className="w-full rounded-lg" style={{ height: `${tileHeight}px` }} />
      ))}
    </div>
  );
}
