import useMounted from '~/hooks/use-mounted';
import { Skeleton } from '~/modules/ui/skeleton';

export function EntityGridSkeleton() {
  const { hasStarted } = useMounted();

  const items = Array.from({ length: 6 }, () => ({
    membersCount: Math.floor(Math.random() * 4) + 1,
  }));

  return (
    <div
      className={`duration-300 transition-opacity ${hasStarted ? 'opacity-100' : 'opacity-0'} mb-12 grid gap-6 grid-cols-1 sm:grid-cols-1 md:grid-cols-2 lg:grid-cols-[repeat(auto-fit,minmax(330px,1fr))]`}
    >
      {items.map((item, index) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: static keys are fine here as this is a skeleton
        <SkeletonItem key={index} membersCount={item.membersCount} />
      ))}
    </div>
  );
}

function SkeletonItem({ membersCount }: { membersCount: number }) {
  return (
    <Skeleton className="overflow-hidden py-6 px-4">
      <div className="w-full relative group">
        <div className="relative flex flex-col -mx-4 -mt-6 bg-cover bg-center aspect-3/1 bg-gray-600/50">
          <div className="grow" />
          <div className="flex w-full items-center backdrop-blur-xs gap-3 px-4 py-2 bg-background/40 transition-colors">
            <div className="h-10 w-10 bg-gray-500 rounded-md invisible" />
          </div>
        </div>
      </div>
      <div className="flex items-center justify-stretch gap-3 pt-4">
        <div className="grow" />
        {Array.from({ length: membersCount }).map((_, index) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: static keys are fine here as this is a skeleton
          <div key={index} className="h-8 w-8 invisible bg-gray-600 border-2 border-secondary -ml-6 rounded-full" />
        ))}
      </div>
    </Skeleton>
  );
}
