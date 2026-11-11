import { Skeleton } from '~/modules/ui/skeleton';

/** Three result rows with size-8 avatars, while a search has no results to show yet. */
export function SearchResultsSkeleton() {
  return (
    <div className="mount-fade flex flex-col p-1 duration-300">
      {Array.from({ length: 3 }).map((_, i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: static skeleton placeholder.
        <div key={i} className="flex items-center gap-2 py-1.5 pl-3">
          <Skeleton className="size-8 shrink-0 rounded-full" />
          <Skeleton className="h-4 w-48" />
        </div>
      ))}
    </div>
  );
}
