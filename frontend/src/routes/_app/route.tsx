import { createFileRoute, defer, redirect } from '@tanstack/react-router';
import { meQueryOptions } from '~/modules/me/query';
import { getMenuData } from '~/modules/navigation/menu-sheet/helpers/get-menu-data';
import { unseenCountsQueryOptions } from '~/modules/seen/query';
import { useUserStore } from '~/modules/user/user-store';
import { localUserStorageReady } from '~/query/local-user-storage';
import { onError } from '~/query/on-error';
import { queryClient } from '~/query/query-client';
import { appStreamManager } from '~/query/realtime/stream-store';
import { withSuspenseSpinner } from '~/routes/-route-utils';
import { lazyNamed } from '~/utils/lazy-named';

const AppLayout = lazyNamed(() => import('~/modules/common/app/app-layout'), 'AppLayout');

export const Route = createFileRoute('/_app')({
  // isAuth is false here because the root route checks the leaf route's isAuth, not the layout's
  staticData: { isAuth: false, boundary: 'app' },
  component: withSuspenseSpinner(AppLayout),
  beforeLoad: async ({ location, cause }) => {
    if (cause !== 'enter') return;

    let storedUser = useUserStore.getState().user;

    if (!storedUser) {
      if (location.pathname === '/') {
        const { lastUser } = useUserStore.getState();
        if (!lastUser) throw redirect({ to: '/about', replace: true });

        // The cookie can still be valid while the store is empty after a backend-driven sign-in, so probe /me first.
        try {
          storedUser = await queryClient.ensureQueryData({ ...meQueryOptions() });
        } catch {
          throw redirect({ to: '/auth/authenticate', search: { fromRoot: true }, replace: true });
        }
      } else {
        // Redirect without awaiting `/me` to keep first paint fast; background hydration restores valid sessions.
        void queryClient.ensureQueryData({ ...meQueryOptions() }).catch(() => {});

        console.info('Not authenticated -> redirect to sign in');

        const url = new URL(location.pathname, window.location.origin);
        const redirectPath = url.pathname + url.search;
        throw redirect({ to: '/auth/authenticate', search: { fromRoot: true, redirect: redirectPath } });
      }
    }

    console.info('Continuing user with session');
    // The stream needs localUserDb open and the sync store rehydrated for a valid cursor, else catchup resyncs from `now`.
    await localUserStorageReady();
    // Start stream early so catchup runs in parallel with route loaders
    appStreamManager.connect();
    queryClient.ensureQueryData({ ...meQueryOptions() }).catch(() => {
      appStreamManager.disconnect();
    });
    return { user: storedUser };
  },

  loader: async ({ cause }) => {
    if (cause !== 'enter') return;

    try {
      console.debug('[AppLayout] Fetching menu while loading app:', location.pathname);

      queryClient.prefetchQuery(unseenCountsQueryOptions());

      return defer(getMenuData());
    } catch (error) {
      if (error instanceof Error) {
        console.error(error);
        onError(error);
      }
    }
  },
});
