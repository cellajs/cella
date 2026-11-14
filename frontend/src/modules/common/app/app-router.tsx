import { RouterProvider } from '@tanstack/react-router';
import { useOnlineManager } from '~/hooks/use-online-manager';
import { PullToRefresh } from '~/modules/common/pull-to-refresh';
import { queryClient } from '~/query/query-client';
import { router } from '~/routes/router';

/** The router, with pull-to-refresh while online. */
export function AppRouter() {
  // Subscribed, so pull-to-refresh comes back when the connection does
  const isOnline = useOnlineManager();

  const handleRefresh = async () => {
    console.debug('[AppRouter] Refreshing router');
    await Promise.allSettled([queryClient.invalidateQueries(), router.invalidate()]);
  };

  return (
    <>
      <PullToRefresh onRefresh={handleRefresh} isDisabled={!isOnline} />
      <RouterProvider router={router} />
    </>
  );
}
