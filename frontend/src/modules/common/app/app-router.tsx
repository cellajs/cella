import { useIsRestoring } from '@tanstack/react-query';
import { RouterProvider } from '@tanstack/react-router';
import { useOnlineManager } from '~/hooks/use-online-manager';
import { PullToRefresh } from '~/modules/common/pull-to-refresh';
import { Spinner } from '~/modules/common/spinner';
import { queryClient } from '~/query/query-client';
import { router } from '~/routes/router';

/** Waits for the react-query cache to hydrate, so offline router loaders can read getQueryData. */
export function AppRouter() {
  const isRestoring = useIsRestoring();
  // Subscribed, so pull-to-refresh comes back when the connection does
  const isOnline = useOnlineManager();

  if (isRestoring && !isOnline) {
    return <Spinner className="mt-[45vh] size-12" />;
  }

  const handleRefresh = async () => {
    console.debug('[AppRouter] Refreshing router');
    await Promise.allSettled([queryClient.invalidateQueries(), router.invalidate()]);
  };

  return (
    <>
      <PullToRefresh onRefresh={() => handleRefresh()} isDisabled={isRestoring || !isOnline} />
      <RouterProvider router={router} />
    </>
  );
}
