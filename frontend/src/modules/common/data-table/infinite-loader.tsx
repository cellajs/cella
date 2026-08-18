import { useTranslation } from 'react-i18next';
import { useInView } from 'react-intersection-observer';
import { useOnlineManager } from '~/hooks/use-online-manager';
import { useFetchMoreOnDemand } from '~/modules/common/data-table/use-fetch-more-on-demand';

type InfiniteLoaderProps = {
  hasNextPage: boolean;
  isFetching?: boolean;
  isFetchMoreError?: boolean;
  /** Skip the all-loaded dot trail, for embedded tables where the end marker is noise. */
  hideEndIndicator?: boolean;
  /** When set, an intersection observer calls it as the loader enters the viewport. Omit with DataGrid, which uses onNearEndChange. */
  fetchMore?: () => Promise<unknown>;
};

export function InfiniteLoader({
  hasNextPage,
  isFetching,
  isFetchMoreError,
  hideEndIndicator,
  fetchMore,
}: InfiniteLoaderProps) {
  const { t } = useTranslation();
  const isOnline = useOnlineManager();

  // inView is level-triggered state: a sentinel entering view during a fetch is served once that fetch settles.
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

  if (isFetchMoreError)
    return <div className="my-8 text-center text-red-600 text-sm">{t('error:load_more_failed')}</div>;

  if (!isOnline && hasNextPage)
    return (
      <div className="mt-4 w-full text-center text-muted-foreground/50 text-sm italic">{t('c:offline.load_more')}</div>
    );

  return (
    <>
      {fetchMore && hasNextPage && <div ref={measureRef} className="h-8 w-full" />}

      {isFetching && hasNextPage && <Loading />}
      {!isFetching && !hasNextPage && !hideEndIndicator && <AllLoaded />}
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
