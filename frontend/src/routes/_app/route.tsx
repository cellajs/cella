import { createFileRoute, redirect } from '@tanstack/react-router';
import { ApiError } from '~/lib/api';
import { meQueryOptions } from '~/modules/me/query';
import { getMenuData } from '~/modules/navigation/menu-sheet/helpers/get-menu-data';
import { unseenCountsQueryOptions } from '~/modules/seen/query';
import { userStore } from '~/modules/user/user-store';
import { localUserStorageReady } from '~/query/local-user-storage';
import { queryClient } from '~/query/query-client';
import { appStreamManager } from '~/query/realtime/stream-manager';
import { withSuspenseSpinner } from '~/routes/-route-utils';
import { lazyNamed } from '~/utils/lazy-named';

const AppLayout = lazyNamed(() => import('~/modules/common/app/app-layout'), 'AppLayout');

export const Route = createFileRoute('/_app')({
  // isAuth is false here because the root route checks the leaf route's isAuth, not the layout's
  staticData: { isAuth: false, boundary: 'app' },
  component: withSuspenseSpinner(AppLayout),
  beforeLoad: async ({ location, cause }) => {
    if (cause !== 'enter') return;

    if (!userStore.getState().user) {
      if (location.pathname === '/') {
        const { lastUser } = userStore.getState();
        if (!lastUser) throw redirect({ to: '/about', replace: true });

        // The cookie can still be valid while the store is empty after a backend-driven sign-in, so probe /me first.
        try {
          await queryClient.query({ ...meQueryOptions(), staleTime: 'static' });
        } catch {
          throw redirect({ to: '/auth/authenticate', search: { fromRoot: true }, replace: true });
        }
      } else {
        // Redirect without awaiting `/me` to keep first paint fast; background hydration restores valid sessions.
        void queryClient.query({ ...meQueryOptions(), staleTime: 'static' }).catch(() => {});
        throw redirect({ to: '/auth/authenticate', search: { fromRoot: true, redirect: location.pathname + location.searchStr } });
      }
    }

    // The stream needs localUserDb open and the sync store rehydrated for a valid cursor, else catchup resyncs from `now`.
    await localUserStorageReady();
    // Start stream early so catchup runs in parallel with route loaders
    appStreamManager.connect();
    // Only a 401 ends the session. A network failure or 5xx keeps the stream: disconnect() also drops its visibility and
    // leader reconnect handlers, so nothing would bring it back for the rest of the session.
    queryClient.query({ ...meQueryOptions(), staleTime: 'static' }).catch((error) => {
      if (error instanceof ApiError && error.status === 401) appStreamManager.disconnect({ sessionLost: true });
    });
  },

  loader: async ({ cause }) => {
    if (cause !== 'enter') return;

    void queryClient.query(unseenCountsQueryOptions()).catch(() => {});
    await getMenuData();
  },
});
