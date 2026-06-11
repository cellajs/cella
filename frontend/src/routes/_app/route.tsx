import { createFileRoute, defer, redirect } from '@tanstack/react-router';
import { lazy } from 'react';
import { meQueryOptions } from '~/modules/me/query';
import { getMenuData } from '~/modules/navigation/menu-sheet/helpers/get-menu-data';
import { unseenCountsQueryOptions } from '~/modules/seen/query';
import { useUserStore } from '~/modules/user/user-store';
import { onError } from '~/query/on-error';
import { queryClient } from '~/query/query-client';
import { appStreamManager } from '~/query/realtime/stream-store';
import { withSuspenseSpinner } from '~/routes/route-utils';

const AppLayout = lazy(() => import('~/modules/common/app/app-layout'));

/**
 * Layout for authenticated users requiring a valid user session.
 */
export const Route = createFileRoute('/_app')({
  // isAuth is false here because the root route checks the leaf route's isAuth, not the layout's
  staticData: { isAuth: false, boundary: 'app' },
  component: withSuspenseSpinner(AppLayout),
  beforeLoad: async ({ location, cause }) => {
    if (cause !== 'enter') return;

    try {
      console.debug('[AppLayout] Fetching me before entering app:', location.pathname);

      // Try to use stored user, it will still revalidate below
      const storedUser = useUserStore.getState().user;
      if (storedUser) {
        console.info('Continuing user with session');
        // Start stream early so catchup runs in parallel with route loaders
        appStreamManager.connect();
        // Validate session in parallel — disconnect stream if stale
        queryClient.ensureQueryData({ ...meQueryOptions() }).catch(() => {
          appStreamManager.disconnect();
        });
        return { user: storedUser };
      }

      // Fetch and set user
      const user = await queryClient.ensureQueryData({ ...meQueryOptions() });
      // Start stream early so catchup runs in parallel with route loaders
      appStreamManager.connect();
      return { user };
    } catch (error) {
      if (error instanceof Error) {
        console.error(error);
        onError(error);
      }

      // If root domain, check for last user to decide where to redirect
      if (location.pathname === '/') {
        const { lastUser } = useUserStore.getState();
        if (lastUser) throw redirect({ to: '/auth/authenticate', replace: true });
        throw redirect({ to: '/about', replace: true });
      }

      console.info('Not authenticated -> redirect to sign in');

      const url = new URL(location.pathname, window.location.origin);
      const redirectPath = url.pathname + url.search;
      throw redirect({ to: '/auth/authenticate', search: { fromRoot: true, redirect: redirectPath } });
    }
  },

  loader: async ({ cause, context }) => {
    if (cause !== 'enter') return;

    try {
      console.debug('[AppLayout] Fetching menu while loading app:', location.pathname);

      // Revalidate user if not already awaited above
      if (!context?.user) await queryClient.ensureQueryData({ ...meQueryOptions() });

      // Prefetch unseen counts alongside menu data
      queryClient.prefetchQuery(unseenCountsQueryOptions());

      // Get menu too but defer it so no need to hang while its being retrieved
      return defer(getMenuData());
    } catch (error) {
      if (error instanceof Error) {
        console.error(error);
        onError(error);
      }
    }
  },
});
