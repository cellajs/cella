import { useTranslation } from 'react-i18next';
import { useInView } from 'react-intersection-observer';
import { useOnlineManager } from '~/hooks/use-online-manager';
import { useFetchMoreOnDemand } from '~/modules/common/data-table/use-fetch-more-on-demand';

type InfiniteLoaderProps = {
  hasNextPage: boolean;
  isFetching?: boolean;
  isFetchMoreError?: boolean;
  /**
   * Fetch-more callback. When provided, an intersection observer triggers it as the
   * loader enters the viewport. Omit with DataGrid because it triggers via onNearEndChange.
   */
  fetchMore?: () => Promise<unknown>;
};

/**
 * Infinite-scroll status indicators (loading, error, all-loaded, offline).
 * Optionally triggers fetch via intersection observer when `fetchMore` is provided.
 */
export function InfiniteLoader({ hasNextPage, isFetching, isFetchMoreError, fetchMore }: InfiniteLoaderProps) {
  const { t } = useTranslation();
  const isOnline = useOnlineManager();

  // Intersection observer for non-DataGrid usage (e.g., entity grids).
  // inView is consumed as level-triggered state, not an enter-event: a sentinel
  // that comes into view during a fetch is served when the fetch settles.
  const { ref: measureRef, inView } = useInView({
    triggerOnce: false,
    delay: 50,
    threshold: 0,
  });
  useFetchMoreOnDemand({
    demand: inView,
    hasNextPage,
    isFetching: !!isFetching,
    error: !!isFetchMoreError,
    fetchMore,
  });

  // Error state
  if (isFetchMoreError)
    return <div className="my-8 text-center text-red-600 text-sm">{t('error:load_more_failed')}</div>;

  // Offline but more data is available
  if (!isOnline && hasNextPage)
    return (
      <div className="mt-4 w-full text-center text-muted-foreground/50 text-sm italic">{t('c:offline.load_more')}</div>
    );

  return (
    <>
      {/* Intersection observer trigger - only rendered when fetchMore is provided */}
      {fetchMore && hasNextPage && <div ref={measureRef} className="h-8 w-full" />}

      {isFetching && hasNextPage && <Loading />}
      {!isFetching && !hasNextPage && <AllLoaded />}
    </>
  );
}

function AllLoaded() {
  return (
    <div className="mt-4 mb-10 w-full text-center text-xl opacity-50">
      <div>&#183;</div>
      <div className="-mt-5">&#183;</div>
      <div className="-mt-5">&#183;</div>
      <div className="-mt-3">&#176;</div>
    </div>
  );
}

function Loading() {
  return (
    <div className="relative top-4 mb-10 flex h-0 w-full animate-pulse items-center justify-center space-x-1 opacity-50">
      <span className="sr-only">Loading...</span>
      <div className="h-1 w-3 animate-bounce rounded-full bg-foreground [animation-delay:-0.3s]" />
      <div className="h-1 w-3 animate-bounce rounded-full bg-foreground [animation-delay:-0.15s]" />
      <div className="h-1 w-3 animate-bounce rounded-full bg-foreground" />
    </div>
  );
}
