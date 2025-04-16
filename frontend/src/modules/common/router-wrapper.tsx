import { onlineManager, useIsRestoring } from '@tanstack/react-query';
import { RouterProvider } from '@tanstack/react-router';
import router from '~/lib/router';
import PullToRefresh from '~/modules/common/pull-to-refresh';
import Spinner from '~/modules/common/spinner';
import { queryClient } from '~/query/query-client';

/**
 * Wait for react-query to hydrate cache so we can use fallback getQueryData in router loaders when offline.
 */
export const RouterWrapper = () => {
  const isRestoring = useIsRestoring();
  const isOnline = onlineManager.isOnline();

  if (isRestoring && !isOnline) {
    return <Spinner className="h-12 w-12 mt-[45vh]" />;
  }

  const handleRefresh = () => {
    console.debug('Refreshing router ...');
    queryClient.invalidateQueries();
    router.invalidate();
  };

  return (
    <>
      <PullToRefresh onRefresh={() => handleRefresh()} isDisabled={isRestoring || !isOnline} />
      <RouterProvider router={router} />
    </>
  );
};
