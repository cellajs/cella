import { useTranslation } from 'react-i18next';
import { useInView } from 'react-intersection-observer';
import { useOnlineManager } from '~/hooks/use-online-manager';

type InfiniteLoaderProps = {
  hasNextPage: boolean;
  isFetching?: boolean;
  isFetchMoreError?: boolean;
  /**
   * Optional callback to fetch more data. When provided, uses intersection observer
   * to trigger fetch when the loader enters the viewport.
   * When used with DataGrid, omit this prop as DataGrid handles triggering via onRowsEndApproaching.
   */
  fetchMore?: () => Promise<unknown>;
};

/**
 * Displays infinite scroll status indicators (loading, error, all-loaded, offline).
 * Optionally triggers fetch via intersection observer when fetchMore is provided.
 * When used with DataGrid, the fetch triggering is handled by DataGrid's onRowsEndApproaching callback.
 */
export function InfiniteLoader({ hasNextPage, isFetching, isFetchMoreError, fetchMore }: InfiniteLoaderProps) {
  const { t } = useTranslation();
  const { isOnline } = useOnlineManager();

  // Intersection observer for non-DataGrid usage (e.g., entity grids)
  const { ref: measureRef } = useInView({
    triggerOnce: false,
    delay: 50,
    threshold: 0,
    onChange: (inView) => {
      if (inView && !isFetchMoreError && !isFetching && fetchMore) fetchMore();
    },
  });

  // Error state
  if (isFetchMoreError)
    return <div className="text-center my-8 text-sm text-red-600">{t('error:load_more_failed')}</div>;

  // Offline but more data is available
  if (!isOnline && hasNextPage)
    return <div className="w-full mt-4 italic text-muted text-sm text-center">{t('common:offline.load_more')}</div>;

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
    <div className="opacity-50 w-full text-xl mt-4 mb-10 text-center">
      <div>&#183;</div>
      <div className="-mt-5">&#183;</div>
      <div className="-mt-5">&#183;</div>
      <div className="-mt-3">&#176;</div>
    </div>
  );
}

function Loading() {
  return (
    <div className="flex space-x-1 opacity-50 justify-center items-center relative top-4 h-0 mb-10 w-full animate-pulse">
      <span className="sr-only">Loading...</span>
      <div className="h-1 w-3 bg-foreground rounded-full animate-bounce [animation-delay:-0.3s]" />
      <div className="h-1 w-3 bg-foreground rounded-full animate-bounce [animation-delay:-0.15s]" />
      <div className="h-1 w-3 bg-foreground rounded-full animate-bounce" />
    </div>
  );
}
