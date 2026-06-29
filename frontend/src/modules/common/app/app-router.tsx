import { onlineManager, useIsFetching, useIsRestoring } from '@tanstack/react-query';
import { RouterProvider } from '@tanstack/react-router';
import { PullToRefresh } from '~/modules/common/pull-to-refresh';
import { Spinner } from '~/modules/common/spinner';
import { queryClient } from '~/query/query-client';
import router from '~/routes/router';

/**
 * Wait for react-query to hydrate cache so we can use fallback getQueryData in router loaders when offline.
 */
export const AppRouter = () => {
  const isRestoring = useIsRestoring();
  const isOnline = onlineManager.isOnline();
  const fetchingCount = useIsFetching();

  if (isRestoring && !isOnline) {
    return <Spinner className="mt-[45vh] h-12 w-12" />;
  }

  const handleRefresh = async () => {
    console.debug('[AppRouter] Refreshing router');
    await Promise.allSettled([queryClient.invalidateQueries(), router.invalidate()]);
  };

  return (
    <>
      <PullToRefresh
        onRefresh={() => handleRefresh()}
        isFetching={fetchingCount > 0}
        isDisabled={isRestoring || !isOnline}
      />
      <RouterProvider router={router} />
    </>
  );
};
