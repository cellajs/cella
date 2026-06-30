import { createFileRoute, defer, redirect } from '@tanstack/react-router';
import { lazy } from 'react';
import { meQueryOptions } from '~/modules/me/query';
import { getMenuData } from '~/modules/navigation/menu-sheet/helpers/get-menu-data';
import { unseenCountsQueryOptions } from '~/modules/seen/query';
import { useUserStore } from '~/modules/user/user-store';
import { appStorageReady } from '~/query/app-storage';
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

    const storedUser = useUserStore.getState().user;

    // No stored user → treat as unauthenticated and redirect immediately. We must NOT
    // await /me here: doing so gates first paint on the round-trip and shows a blank
    // screen when the backend is slow or unreachable. Instead we hydrate /me in the
    // background — a valid session still populates the store (the rare case of a cookie
    // without a stored user simply resolves on the next navigation). Failures are
    // handled by the global query error handler.
    if (!storedUser) {
      void queryClient.ensureQueryData({ ...meQueryOptions() }).catch(() => {});

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

    // Stored user → continue into the app and revalidate the session in the background
    console.info('Continuing user with session');
    // Wait for the per-user appdb to open + sync store to rehydrate so the stream
    // connects with a valid cursor (else catchup resyncs from `now`). Eager hydration
    // started at sign-in, so this usually resolves immediately.
    await appStorageReady();
    // Start stream early so catchup runs in parallel with route loaders
    appStreamManager.connect();
    // Validate session in parallel — disconnect stream if stale
    queryClient.ensureQueryData({ ...meQueryOptions() }).catch(() => {
      appStreamManager.disconnect();
    });
    return { user: storedUser };
  },

  loader: async ({ cause }) => {
    if (cause !== 'enter') return;

    try {
      console.debug('[AppLayout] Fetching menu while loading app:', location.pathname);

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
