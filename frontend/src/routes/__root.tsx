import { createRootRouteWithContext, redirect } from '@tanstack/react-router';
import { Root } from '~/modules/common/root';
import { meQueryOptions } from '~/modules/me/query';
import { useUserStore } from '~/modules/user/user-store';
import { queryClient } from '~/query/query-client';
import { RootErrorComponent, RootNotFoundComponent } from '~/routes/route-utils';

export const Route = createRootRouteWithContext()({
  staticData: { isAuth: false, boundary: 'root' },
  component: Root,
  beforeLoad: async ({ matches, location }) => {
    // Enforce isAuth globally: if the leaf route requires auth, verify the user session
    const leafMatch = matches[matches.length - 1];
    if (!leafMatch?.staticData?.isAuth) return;

    // Let the app layout route handle unauthenticated users on root path (redirects to /about)
    if (location.pathname === '/') return;

    const storedUser = useUserStore.getState().user;
    if (storedUser) return;

    try {
      await queryClient.ensureQueryData({ ...meQueryOptions() });
    } catch {
      console.info('[RootRoute] Not authenticated -> redirect to sign in');
      const redirectPath = location.pathname + location.searchStr;
      throw redirect({ to: '/auth/authenticate', search: { fromRoot: true, redirect: redirectPath } });
    }
  },
  errorComponent: RootErrorComponent,
  notFoundComponent: RootNotFoundComponent,
});
