import type { CSSProperties } from 'react';
import { useTranslation } from 'react-i18next';
import { useInView } from 'react-intersection-observer';
import { useOnlineManager } from '~/hooks/use-online-manager';

type InfiniteLoaderProps = {
  hasNextPage: boolean;
  measureStyle?: CSSProperties;
  isFetching?: boolean;
  isFetchMoreError?: boolean;
  fetchMore?: () => Promise<unknown>;
};

export const InfiniteLoader = ({
  hasNextPage,
  isFetching,
  measureStyle,
  isFetchMoreError,
  fetchMore,
}: InfiniteLoaderProps) => {
  const { t } = useTranslation();
  const { isOnline } = useOnlineManager();

  const { ref: measureRef } = useInView({
    triggerOnce: false,
    delay: 50,
    threshold: 0,
    onChange: (inView) => {
      if (inView && !isFetchMoreError && fetchMore) fetchMore();
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
      {/* Infinite loading measure ref, which increases until 50 rows */}
      <div ref={measureRef} className="h-4 w-0 bg-red-700 absolute bottom-0 z-200" style={measureStyle} />

      {isFetching && hasNextPage && <Loading />}
      {fetchMore && !isFetching && !hasNextPage && <AllLoaded />}
    </>
  );
};

const AllLoaded = () => (
  <div className="opacity-50 w-full text-xl mt-4 mb-10 text-center">
    <div>&#183;</div>
    <div className="-mt-5">&#183;</div>
    <div className="-mt-5">&#183;</div>
    <div className="-mt-3">&#176;</div>
  </div>
);

const Loading = () => (
  <div className="flex space-x-1 opacity-50 justify-center items-center relative top-4 h-0 mb-10 w-full animate-pulse">
    <span className="sr-only">Loading...</span>
    <div className="h-1 w-3 bg-foreground rounded-full animate-bounce [animation-delay:-0.3s]" />
    <div className="h-1 w-3 bg-foreground rounded-full animate-bounce [animation-delay:-0.15s]" />
    <div className="h-1 w-3 bg-foreground rounded-full animate-bounce" />
  </div>
);
